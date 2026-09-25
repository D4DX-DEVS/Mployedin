import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { hashOtp, VERIFIABLE_ACCOUNT } from "@/lib/auth/emailVerification";
import logger from "@/lib/logger";
import { z } from "zod";
import { getClientIp } from "@/lib/security/clientIp";
import { auth } from "@/lib/auth/config";

const GENERIC_SUCCESS = "If that email exists, a verification link has been sent.";

const schema = z.object({
  email: z.string().email().max(254),
  /**
   * Sent by the verify page on arrival. Accounts an admin or super-agent creates
   * reach that page with no code ever issued, so it asks for one — but only when
   * none is live, or it would replace the code a registration just sent.
   */
  ifMissing: z.boolean().optional(),
});

/**
 * POST /api/auth/resend-verification
 * Re-send the email verification link. Rate-limited to prevent abuse.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // The arrival request fires on page load, with no click, so it only counts
  // for a signed-in user asking about their own address. Otherwise any page
  // could have a visitor's browser mail a code to someone else.
  if (body.ifMissing) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== body.email.toLowerCase().trim()) {
      return NextResponse.json({ success: true, message: GENERIC_SUCCESS });
    }
  }

  // The arrival request gets its own bucket so it never eats the user's manual
  // Resends; it sends at most once per code lifetime, so it can't flood an inbox.
  const ip = getClientIp(req.headers);
  const { allowed } = body.ifMissing
    ? await checkRateLimit(`resend-verify-auto:${ip}`, { limit: 10, windowSec: 300, prefix: "rsndva", failClosed: true })
    : await checkRateLimit(`resend-verify:${ip}`, { limit: 3, windowSec: 300, prefix: "rsndv", failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }

  await connectDB();

  const user = await User.findOne({
    email: body.email.toLowerCase().trim(),
    isEmailVerified: false,
    ...VERIFIABLE_ACCOUNT,
  }).select("+emailVerificationOtp +emailVerificationExpiry");

  // Always return success to avoid email enumeration
  if (!user) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS });
  }

  const hasLiveCode =
    !!user.emailVerificationOtp && !!user.emailVerificationExpiry && user.emailVerificationExpiry > new Date();
  if (body.ifMissing && hasLiveCode) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS });
  }

  // Generate new token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Generate a 6-digit OTP alongside the link. Both methods share the same
  // expiry window so users can pick whichever is more convenient.
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = hashOtp(otp);

  user.emailVerificationToken = hashedToken;
  user.emailVerificationOtp = hashedOtp;
  user.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const locale = req.cookies.get("NEXT_LOCALE")?.value === "ar" ? "ar" : "en";
  const verifyUrl = `${baseUrl}/${locale}/verify-email?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

  try {
    await sendEmail({
      to: user.email,
      ...EmailTemplates.verifyEmailOtp(user.name || "there", otp, verifyUrl),
    });
  } catch (err) {
    logger.error({ err }, "[resend-verification] Failed to send verification email");
    return NextResponse.json({ error: "Couldn't send the email right now. Please try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ success: true, message: "Verification email sent." });
}
