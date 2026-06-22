import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
});

/**
 * POST /api/auth/resend-verification
 * Re-send the email verification link. Rate-limited to prevent abuse.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await checkRateLimit(`resend-verify:${ip}`, { limit: 3, windowSec: 300, prefix: "rsndv" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({
    email: body.email.toLowerCase().trim(),
    isActive: true,
    isEmailVerified: false,
  });

  // Always return success to avoid email enumeration
  if (!user) {
    return NextResponse.json({ success: true, message: "If that email exists, a verification link has been sent." });
  }

  // Generate new token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.emailVerificationToken = hashedToken;
  await user.save();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/en/verify-email?token=${rawToken}`;

  await sendEmail({
    to: user.email,
    ...EmailTemplates.verifyEmail(user.name || "there", verifyUrl),
  });

  return NextResponse.json({ success: true, message: "Verification email sent." });
}
