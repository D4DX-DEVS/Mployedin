import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { validateBody } from "@/lib/validators";
import { changePasswordSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import logger from "@/lib/logger";
import { endAllSessions } from "@/lib/auth/sessionCutOff";

/**
 * POST /api/users/change-password
 * Body: { currentPassword: string, newPassword: string }
 * Requires authenticated session.
 *
 * Ends every session of the account, this one included, and its MCP app
 * grants (lib/auth/sessionCutOff.ts): `{ signedOut: true }` tells the page to
 * sign out and back in with the new password.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`change-pwd:${session.user.id}`, {
    limit: 3,
    windowSec: 3600,
    prefix: "chpwd",
    failClosed: true,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { currentPassword, newPassword } = await validateBody(req, changePasswordSchema);

  await connectDB();

  // Fetch user WITH passwordHash (select: false by default)
  const user = await User.findById(session.user.id).select("+passwordHash");
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "Password login not configured for this account (OAuth user)" },
      { status: 400 }
    );
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  // Hash new password and save. The cut-off goes in the same save: every
  // session signed in before it ends on its next request, on every device.
  const changedAt = new Date();
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = changedAt;
  user.sessionsValidAfter = changedAt;
  // Their own password now — the "you're on a temporary password" notice stops.
  user.tempPasswordIssuedAt = undefined;
  await user.save();
  await endAllSessions(session.user.id, changedAt);

  logActivity({
    actorId: session.user.id,
    actorRole: (session.user as { role?: string }).role ?? "unknown",
    action: "user.change_password",
    resource: "users",
    resourceId: session.user.id,
    req,
  });

  // Security notice, sent straight through sendEmail so no notification
  // preference or "unsubscribe from all" can stop it — the owner's call: a
  // changed password always tells the account holder. Non-blocking, as in the
  // reset route.
  const dateTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const userId = session.user.id;
  sendEmail({
    to: user.email,
    ...EmailTemplates.passwordResetConfirmation(dateTime),
    userId,
    source: "password-change",
    category: "security",
  }).catch((err) => logger.error({ err, userId }, "[change-password] confirmation email not sent"));

  return NextResponse.json({ success: true, signedOut: true });
}
