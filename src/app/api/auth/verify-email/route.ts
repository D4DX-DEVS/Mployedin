import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { hashOtp, otpHashesMatch, VERIFIABLE_ACCOUNT } from "@/lib/auth/emailVerification";
import { checkPasswordHolder } from "@/lib/auth/passwordHolder";
import { z } from "zod";
import { getClientIp } from "@/lib/security/clientIp";

const schema = z.object({
  token: z.string().min(1).max(128).optional(),
  otp: z.string().regex(/^\d{6}$/).optional(),
  email: z.string().email().max(254).optional(),
  /** The account's password, when the page is not signed in as that account. */
  password: z.string().min(1).max(200).optional(),
}).refine((v) => v.token || v.otp, { message: "Either token or otp is required" })
  .refine((v) => !v.otp || v.email, { message: "email is required with otp" });

const INVALID_CODE = "Invalid or expired verification code";

/**
 * Wrong guesses one code takes before it stops working. The per-address limit
 * above resets every five minutes for the code's whole 24 hours (about 1,440
 * guesses); someone who registered another person's address knows the
 * password and needs only this code. The link in the same mail keeps working,
 * and resend-verification gives an address at most five new codes a day.
 */
const MAX_CODE_GUESSES = 5;

function codeLocked() {
  return NextResponse.json(
    {
      error: "This code was entered wrong too many times. Use the link in the email, or ask for a new code.",
      code: "CODE_LOCKED",
    },
    { status: 400 },
  );
}

/**
 * POST /api/auth/verify-email
 * Validate email verification token OR OTP and mark user as verified.
 * Supports two verification methods:
 *   - Magic link (token): the long hex token from the email link.
 *   - In-app OTP (otp): a 6-digit code entered in the verify-email page.
 *
 * Either one finishes only for the holder of the account's password: inside
 * that account's session, or with the password sent along
 * (lib/auth/passwordHolder.ts). Otherwise 401 with `code` PASSWORD_REQUIRED /
 * WRONG_PASSWORD (429 TOO_MANY_ATTEMPTS), and the link or code stays usable.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  // OTP attempts get a tighter limit than link clicks to resist brute force.
  const { allowed } = await checkRateLimit(`verify-email:${ip}`, { limit: 10, windowSec: 300, prefix: "vemail", failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Per-account brute-force guard for OTP: the IP limit above doesn't stop a
  // distributed attacker hammering one email from many IPs, and a 6-digit code
  // has only 1M combinations. Bound attempts per email regardless of IP.
  if (body.otp) {
    const emailKey = (body.email as string).toLowerCase().trim();
    const { allowed: otpAllowed } = await checkRateLimit(`verify-otp:${emailKey}`, { limit: 5, windowSec: 300, prefix: "votp", failClosed: true });
    if (!otpAllowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
    }
  }

  await connectDB();

  let user: Awaited<ReturnType<typeof User.findOne>>;

  if (body.otp) {
    // Scope by email so a correctly-guessed OTP only ever matches the
    // account it was requested for, not whichever pending signup holds it.
    user = await User.findOne({
      email: (body.email as string).toLowerCase().trim(),
      ...VERIFIABLE_ACCOUNT,
    }).select("+emailVerificationOtp +emailVerificationExpiry +emailVerificationAttempts +passwordHash");
    const storedOtp = user?.emailVerificationOtp;
    if (!user || !storedOtp || (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date())) {
      return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
    }
    if ((user.emailVerificationAttempts ?? 0) >= MAX_CODE_GUESSES) return codeLocked();
    if (!otpHashesMatch(hashOtp(body.otp), storedOtp)) {
      // Counted on this code only, and only while it is still the live one.
      const counted = (await User.findOneAndUpdate(
        { _id: user._id, emailVerificationOtp: storedOtp },
        { $inc: { emailVerificationAttempts: 1 } },
        { new: true, projection: { emailVerificationAttempts: 1 } },
      )) as { emailVerificationAttempts?: number } | null;
      if ((counted?.emailVerificationAttempts ?? 0) >= MAX_CODE_GUESSES) {
        await User.updateOne({ _id: user._id, emailVerificationOtp: storedOtp }, { $unset: { emailVerificationOtp: "" } });
        return codeLocked();
      }
      return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
    }
  } else {
    const hashedToken = crypto.createHash("sha256").update(body.token as string).digest("hex");
    user = await User.findOne({
      emailVerificationToken: hashedToken,
      ...VERIFIABLE_ACCOUNT,
    }).select("+emailVerificationToken +emailVerificationExpiry +passwordHash");
  }

  if (!user || (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date())) {
    // Don't leak account existence or verification status — use generic message
    return NextResponse.json({ error: INVALID_CODE }, { status: 400 });
  }

  // The mail reaches whoever owns the address; the password may be a
  // stranger's who registered it. Nothing is written until the holder shows.
  const holder = await checkPasswordHolder(user, body.password);
  if (!holder.ok) {
    return NextResponse.json({ error: holder.error, code: holder.code }, { status: holder.status });
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationOtp = undefined;
  user.emailVerificationExpiry = undefined;
  user.emailVerificationAttempts = undefined;
  await user.save();

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "email.verified",
    resource: "auth",
    meta: { email: user.email, method: body.otp ? "otp" : "link" },
    req,
  });

  return NextResponse.json({ message: "Email verified successfully" });
}
