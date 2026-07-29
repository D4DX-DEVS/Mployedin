import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { hashOtp } from "@/lib/auth/emailVerification";
import { z } from "zod";
import { getClientIp } from "@/lib/security/clientIp";

const schema = z.object({
  token: z.string().min(1).max(128).optional(),
  otp: z.string().regex(/^\d{6}$/).optional(),
  email: z.string().email().max(254).optional(),
}).refine((v) => v.token || v.otp, { message: "Either token or otp is required" })
  .refine((v) => !v.otp || v.email, { message: "email is required with otp" });

/**
 * POST /api/auth/verify-email
 * Validate email verification token OR OTP and mark user as verified.
 * Supports two verification methods:
 *   - Magic link (token): the long hex token from the email link.
 *   - In-app OTP (otp): a 6-digit code entered in the verify-email page.
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
    const hashedOtp = hashOtp(body.otp);
    // Scope by email so a correctly-guessed OTP only ever matches the
    // account it was requested for, not whichever pending signup holds it.
    user = await User.findOne({
      email: (body.email as string).toLowerCase().trim(),
      emailVerificationOtp: hashedOtp,
      isActive: true,
    }).select("+emailVerificationOtp +emailVerificationExpiry");
  } else {
    const hashedToken = crypto.createHash("sha256").update(body.token as string).digest("hex");
    user = await User.findOne({
      emailVerificationToken: hashedToken,
      isActive: true,
    }).select("+emailVerificationToken +emailVerificationExpiry");
  }

  if (!user || (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date())) {
    // Don't leak account existence or verification status — use generic message
    return NextResponse.json(
      { error: "Invalid or expired verification code" },
      { status: 400 }
    );
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationOtp = undefined;
  user.emailVerificationExpiry = undefined;
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
