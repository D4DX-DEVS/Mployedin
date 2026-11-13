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
import { revokeUnprovenAccessElsewhere, unprovenAccessCleanup } from "@/lib/auth/unprovenPassword";
import { endAllSessions, noteSessionsCutOff } from "@/lib/auth/sessionCutOff";

const schema = z.object({
  token: z.string().min(1),
  password: strongPasswordSchema,
});

/**
 * POST /api/auth/reset-password
 * Validate reset token and update password. Ends every session of the account
 * and its MCP app grants (lib/auth/sessionCutOff.ts): whoever knew the old
 * password may be signed in somewhere.
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

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(body.password, salt);
  // The link was delivered to this inbox, so using it proves the address. An
  // agent a super-agent adds sets their password this way and would otherwise
  // land on the verify-code screen straight after.
  const unconfirmed = user.isEmailVerified !== true;

  if (unconfirmed) {
    // The old password may be a stranger's who registered this address: the
    // owner could not confirm without it, so they reset it. One write sets the
    // new password, confirms the address, ends the sessions the old password
    // opened and clears what it set up (lib/auth/unprovenPassword.ts), so a
    // failure part-way cannot leave the owner with no password at all.
    const changedAt = new Date();
    const cleanup = unprovenAccessCleanup(changedAt);
    const result = await User.updateOne(
      {
        _id: user._id,
        passwordResetToken: hashedToken,
        // It may have expired while the password was hashed.
        passwordResetExpiry: { $gt: new Date() },
        isEmailVerified: { $ne: true },
      },
      {
        $set: { ...cleanup.$set, passwordHash, isEmailVerified: true, passwordResetAttempts: 0 },
        $unset: {
          ...cleanup.$unset,
          passwordResetToken: "",
          passwordResetExpiry: "",
          emailVerificationToken: "",
          emailVerificationOtp: "",
          emailVerificationExpiry: "",
          emailVerificationAttempts: "",
        },
      },
    );
    if (result.modifiedCount !== 1) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }
    noteSessionsCutOff(user._id.toString(), changedAt);
    // Revokes the MCP app grants too.
    await revokeUnprovenAccessElsewhere(user._id.toString());
  } else {
    // The cut-off goes in the same save as the new password: every session
    // signed in before it ends on its next request, on every device.
    const changedAt = new Date();
    user.passwordHash = passwordHash;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    user.passwordResetAttempts = 0;
    user.passwordChangedAt = changedAt;
    user.sessionsValidAfter = changedAt;
    user.tempPasswordIssuedAt = undefined;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await endAllSessions(user._id.toString(), changedAt);
  }

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "password_reset.completed",
    resource: "auth",
    meta: { email: user.email, ...(unconfirmed ? { confirmedAddress: true } : {}) },
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
