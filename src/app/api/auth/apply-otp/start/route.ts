import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import PendingSignin, { PENDING_SIGNIN_TTL_MS } from "@/models/PendingSignin";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { validateBody } from "@/lib/validators";
import { applyOtpStartSchema } from "@/lib/validators/applyOtp";
import { hashOtp } from "@/lib/auth/emailVerification";
import { verifyRecaptcha } from "@/lib/security/recaptcha";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";
import { z } from "zod";

export const runtime = "nodejs";

const schema = applyOtpStartSchema;

/**
 * Every response after the email rate-limit check takes at least this long.
 * The branches below do different amounts of work (a staff email returns after
 * one DB read; a seeker email waits on the mailer), and that difference used to
 * be measurable from outside. The floor hides it as long as a healthy mailer
 * answers within it (SMTP/OAuth sends are typically 200-800 ms). A slow or
 * failing mailer still shows through; the IP and per-email limits are what keep
 * that residual from being useful at scale.
 */
const MIN_RESPONSE_MS = 1000;

async function settle(startedAt: number, res: NextResponse): Promise<NextResponse> {
  const remaining = MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  return res;
}

/**
 * POST /api/auth/apply-otp/start
 *
 * Anonymous quick-apply, step 1: email a 6-digit code.
 *
 * This endpoint creates NOTHING permanent. The hashed code is stored in
 * PendingSignin (10-minute TTL); the job_seeker account is created only when the
 * code is redeemed by the "email-otp" auth provider. Before this, every address
 * typed here minted a User + JobSeeker, which made it a junk-account generator.
 *
 * Deliberately leaks nothing about whether the email is registered or what role
 * it has: same body, same status, same minimum latency on every masked branch.
 *
 * Protection, in order: IP rate limit (fails closed) -> schema -> reCAPTCHA v3
 * when configured (fails closed) -> per-email rate limit (fails closed).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  const { allowed: ipAllowed } = await checkRateLimit(`auth-otp:${ip}`, {
    ...RATE_LIMIT_CONFIGS.auth,
    failClosed: true,
  });
  if (!ipAllowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = await validateBody(req, schema);
  } catch {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const captcha = await verifyRecaptcha(body.captchaToken, {
    action: "quick_apply",
    hostname: req.nextUrl.hostname,
  });
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: captcha.status });
  }

  const normalizedEmail = body.email.toLowerCase().trim();

  const { allowed: emailAllowed } = await checkRateLimit(`otp-start:${normalizedEmail}`, {
    limit: 3,
    windowSec: 300,
    prefix: "otp-start",
    failClosed: true,
  });

  const startedAt = Date.now();

  if (!emailAllowed) {
    // Masked: same response as success so the limit itself is not a probe.
    return settle(startedAt, NextResponse.json({ sent: true }, { status: 200 }));
  }

  try {
    await connectDB();

    const existing = await User.findOne({ email: normalizedEmail }).select("role isActive name");

    // Only job_seeker accounts may sign in this way. Staff and employers keep
    // their password (and, for admins, TOTP). A deactivated seeker is refused by
    // the provider anyway, so do not email them either. In both cases answer
    // exactly as if a code had been sent.
    if (existing && (existing.role !== "job_seeker" || !existing.isActive)) {
      logActivity({
        action: "otp.rejected",
        resource: "auth",
        ipAddress: ip,
        meta: {
          email: normalizedEmail,
          reason: existing.role !== "job_seeker" ? "non_job_seeker_role" : "account_inactive",
          role: existing.role,
        },
      });
      return settle(startedAt, NextResponse.json({ sent: true }, { status: 200 }));
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + PENDING_SIGNIN_TTL_MS);

    // Replace any earlier code for this address. Nothing is written to User —
    // a pending signup verification on the same address is left untouched.
    const pendingUpdate = {
      $set: {
        // "signin" binds the code to the passwordless provider only; it can
        // never be redeemed at /api/auth/verify-email and vice versa.
        otpHash: hashOtp(otp, "signin"),
        attempts: 0,
        requestIp: ip,
        expiresAt,
        name: body.name,
      },
    };
    try {
      await PendingSignin.findOneAndUpdate({ email: normalizedEmail }, pendingUpdate, { upsert: true });
    } catch (err) {
      // Two taps on "Send code" can race the upsert into the unique email
      // index (E11000). The row exists now, so a plain retry lands the update.
      if ((err as { code?: number }).code !== 11000) throw err;
      await PendingSignin.findOneAndUpdate({ email: normalizedEmail }, pendingUpdate, { upsert: true });
    }

    // The code is entered in place on the job page, so the email carries no
    // link. The greeting is the account's name, or the name just typed —
    // never the email's local part.
    const sendResult = await sendEmail({
      to: normalizedEmail,
      ...EmailTemplates.verifyEmailOtpQuickApply(otp, existing?.name ?? body.name),
      source: "quick-apply",
      category: "system",
    }).catch((err) => {
      logger.error({ err }, "[OTP] Failed to send sign-in code");
      return null;
    });

    if (!sendResult) {
      // Nothing to roll back: the pending row expires on its own.
      return settle(startedAt, NextResponse.json({ error: "EMAIL_FAILED" }, { status: 502 }));
    }

    logActivity({
      ...(existing ? { actorId: existing._id.toString(), actorRole: "job_seeker" as const } : {}),
      action: "otp.sent",
      resource: "auth",
      ipAddress: ip,
      meta: { email: normalizedEmail, existingAccount: Boolean(existing) },
      req,
    });

    return settle(startedAt, NextResponse.json({ sent: true }, { status: 200 }));
  } catch (err) {
    logger.error({ err }, "apply-otp-start error");
    return settle(startedAt, NextResponse.json({ error: "EMAIL_FAILED" }, { status: 502 }));
  }
}
