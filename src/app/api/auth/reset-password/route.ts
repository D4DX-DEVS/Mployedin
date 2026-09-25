import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";
import { getClientIp } from "@/lib/security/clientIp";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import logger from "@/lib/logger";

const schema = z.object({
  token: z.string().min(1),
  password: strongPasswordSchema,
});

/**
 * POST /api/auth/reset-password
 * Validate reset token and update password.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`reset-pwd:${ip}`, { limit: 5, windowSec: 300, prefix: "rpwd", failClosed: true });
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

  // Hash the provided token to compare with stored hash
  const hashedToken = crypto.createHash("sha256").update(body.token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpiry: { $gt: new Date() },
    isActive: true,
  }).select("+passwordResetToken +passwordResetExpiry +passwordResetAttempts");

  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 }
    );
  }

  // Per-token brute-force protection — check attempts before proceeding
  if ((user.passwordResetAttempts ?? 0) >= 5) {
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 }
    );
  }
  await User.findByIdAndUpdate(user._id, { $inc: { passwordResetAttempts: 1 } });

  // Hash new password and save
  const salt = await bcrypt.genSalt(12);
  user.passwordHash = await bcrypt.hash(body.password, salt);
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.passwordResetAttempts = 0;
  user.passwordChangedAt = new Date();
  user.tempPasswordIssuedAt = undefined;
  // The link was delivered to this inbox, so using it proves the address. An
  // agent a super-agent adds sets their password this way and would otherwise
  // land on the verify-code screen straight after.
  user.isEmailVerified = true;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "password_reset.completed",
    resource: "auth",
    meta: { email: user.email },
    req,
  });

  // Send confirmation email (non-blocking — do not fail if email fails)
  const now = new Date();
  const dateTime = now.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  sendEmail({
    to: user.email,
    ...EmailTemplates.passwordResetConfirmation(dateTime),
    userId: user._id.toString(),
    source: "password-reset",
    category: "security",
  }).catch((err) =>
    logger.error({ err, userId: user._id.toString() }, "Failed to send password reset confirmation email"),
  );

  return NextResponse.json({ message: "Password has been reset successfully" });
}
