import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";
import { logActivity } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import logger from "@/lib/logger";

const setPasswordSchema = z.object({ newPassword: strongPasswordSchema });

/** How long after signing in a session may still set a first password. */
const RECENT_SIGN_IN_SECONDS = 15 * 60;

/**
 * POST /api/users/set-password
 * Body: { newPassword }
 *
 * The first password of an account that has none: one made by an e-mail code
 * on a shared job link, or by Google / Apple / LinkedIn. Those accounts could
 * only come back through "Forgot password" or a new code, and Settings asked
 * them for a current password that did not exist.
 *
 * It never replaces a password. The "has none" condition is part of the write,
 * so an account with one is refused (409) and stays behind the
 * current-password check in /api/users/change-password.
 *
 * Only a session that signed in within the last 15 minutes may do it
 * (`authAt`, stamped by the jwt callback at sign-in). A password is a permanent
 * way in, and with one the account's e-mail address can be changed
 * (/api/user/email-change asks for a password): without this, a session that
 * was stolen or left open on a shared computer could turn an hour of access
 * into the whole account. The apply page offers this minutes after sign-in;
 * from Settings an older session is told to log in again first.
 *
 * A session from before an unproven password was removed
 * (lib/auth/unprovenPassword.ts, `sessionsValidAfter`) is refused as well. It
 * is signed out at its next re-check, up to five minutes later; until then it
 * must not put a password of its own back on the account.
 *
 * `passwordChangedAt` is deliberately not set: the jwt callback signs out every
 * token issued before it, which would end the session that just set the
 * password, and there is no earlier password whose sessions need ending.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const sessionUser = session?.user;
  const userId = sessionUser?.id;
  if (!sessionUser || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authAt = (sessionUser as { authAt?: unknown }).authAt;
  const authAtMs = (sessionUser as { authAtMs?: unknown }).authAtMs;
  const age = typeof authAt === "number" ? Math.floor(Date.now() / 1000) - authAt : Number.NaN;
  // A missing, future or old sign-in time all fail the same way.
  if (!(age >= 0 && age <= RECENT_SIGN_IN_SECONDS)) {
    return NextResponse.json({ error: "REAUTH_REQUIRED" }, { status: 403 });
  }

  const rl = await checkRateLimit(`set-pwd:${userId}`, {
    limit: 5,
    windowSec: 3600,
    prefix: "setpwd",
    failClosed: true,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
    );
  }

  let newPassword: string;
  try {
    ({ newPassword } = await validateBody(req, setPasswordSchema));
  } catch (err) {
    if (err instanceof Response) return err as NextResponse;
    throw err;
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const signedInBy =
    typeof authAtMs === "number" ? new Date(authAtMs) : new Date(((authAt as number) + 1) * 1000 - 1);
  const account = (await User.findOneAndUpdate(
    {
      _id: userId,
      isActive: true,
      passwordHash: { $in: [null, ""] },
      // The session must not predate the account's session cut-off
      // (lib/auth/sessionCutOff.ts): in ms when it carries `authAtMs`; with
      // whole seconds only, anything in its sign-in second passes.
      $or: [{ sessionsValidAfter: null }, { sessionsValidAfter: { $lte: signedInBy } }],
    },
    { $set: { passwordHash } },
    { projection: { email: 1 } },
  ).lean()) as { email?: string } | null;
  if (!account) {
    return NextResponse.json({ error: "PASSWORD_ALREADY_SET" }, { status: 409 });
  }

  logActivity({
    actorId: userId,
    actorRole: (sessionUser as { role?: string }).role ?? "unknown",
    action: "user.set_password",
    resource: "users",
    resourceId: userId,
    req,
  });

  // Same security notice a changed password sends, straight through sendEmail
  // so no notification preference can stop it. Non-blocking. Sent to the
  // address on the account: the session's copy can be stale.
  const email = account.email;
  if (email) {
    const dateTime = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
    sendEmail({
      to: email,
      ...EmailTemplates.passwordResetConfirmation(dateTime),
      userId,
      source: "password-set",
      category: "security",
    }).catch((err) => logger.error({ err, userId }, "[set-password] confirmation email not sent"));
  }

  return NextResponse.json({ success: true });
}
