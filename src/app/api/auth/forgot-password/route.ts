import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { z } from "zod";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

/**
 * POST /api/auth/forgot-password
 * Generate a password reset token and send reset email.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`forgot-pwd:${ip}`, { limit: 5, windowSec: 300, prefix: "fpwd", failClosed: true });
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
  const account = await User.findOne({ email: body.email });
  const user = account?.isActive ? account : null;

  // Always return success to prevent email enumeration. The caller learns nothing,
  // but the server log must still say WHY nothing was sent — a silent no-op here is
  // indistinguishable from a failed send when someone reports "no mail arrived".
  if (!user) {
    logger.info(
      { email: body.email, reason: !account ? "no_account" : "account_inactive" },
      "[ForgotPassword] No reset email sent",
    );
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
    logger.error({ err: emailErr }, "[ForgotPassword] Reset email could not be sent");
    // Queryable next to every other auth event: a reset that never reached the
    // inbox used to leave nothing behind but a line in the server log.
    logActivity({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: "password_reset.email_failed",
      resource: "auth",
      meta: { email: user.email, error: emailErr instanceof Error ? emailErr.message : "unknown" },
    });
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
