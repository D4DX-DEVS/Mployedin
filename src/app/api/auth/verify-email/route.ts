import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1).max(128).optional(),
  otp: z.string().regex(/^\d{6}$/).optional(),
}).refine((v) => v.token || v.otp, { message: "Either token or otp is required" });

/**
 * POST /api/auth/verify-email
 * Validate email verification token OR OTP and mark user as verified.
 * Supports two verification methods:
 *   - Magic link (token): the long hex token from the email link.
 *   - In-app OTP (otp): a 6-digit code entered in the verify-email page.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  // OTP attempts get a tighter limit than link clicks to resist brute force.
  const { allowed } = await checkRateLimit(`verify-email:${ip}`, { limit: 10, windowSec: 300, prefix: "vemail" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();

  let user: Awaited<ReturnType<typeof User.findOne>>;

  if (body.otp) {
    const hashedOtp = crypto.createHash("sha256").update(body.otp).digest("hex");
    user = await User.findOne({
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
