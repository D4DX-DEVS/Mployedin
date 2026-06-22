import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

/**
 * POST /api/auth/forgot-password
 * Generate a password reset token and send reset email.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await checkRateLimit(`forgot-pwd:${ip}`, { limit: 5, windowSec: 300, prefix: "fpwd" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ email: body.email, isActive: true });

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  }

  // Generate secure token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  user.passwordResetAttempts = 0;
  await user.save();

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const userLocale = (user.locale as string) ?? "en";
  const resetUrl = `${appUrl}/${userLocale}/reset-password?token=${encodeURIComponent(resetToken)}`;

  try {
    const template = EmailTemplates.passwordReset(resetUrl);
    await sendEmail({ to: user.email as string, ...template });
  } catch (emailErr) {
    console.error("[ForgotPassword] Failed to send reset email:", emailErr);
    // Still return success — don't leak delivery failures to the caller
  }

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "password_reset.requested",
    resource: "auth",
    meta: { email: body.email },
    req,
  });

  return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
}
