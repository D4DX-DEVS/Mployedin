import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth/config";
import { checkRateLimit } from "@/lib/security/rateLimit";

export type PasswordHolderCode = "PASSWORD_REQUIRED" | "WRONG_PASSWORD" | "TOO_MANY_ATTEMPTS";

export type PasswordHolderResult =
  | { ok: true }
  | { ok: false; status: 401 | 429; code: PasswordHolderCode; error: string };

export interface PasswordHolderAccount {
  _id: { toString(): string };
  passwordHash?: string | null;
  /** Set by failed logins; the password is not checked here either until it lapses. */
  lockUntil?: Date | null;
}

/**
 * Whether the person finishing an emailed link is the one who holds the
 * account's password.
 *
 * A link proves who reads the mailbox, not who set the password. Anyone can
 * register someone else's address with a password of their own; the "confirm
 * your email" mail then reaches the real owner, and one click used to leave a
 * confirmed account the stranger could log in to. The same went for "confirm
 * your new email": a stranger's account asks to move to the owner's address,
 * the owner clicks, and the stranger holds a confirmed account under it.
 *
 * So a link that marks an address confirmed finishes only:
 *  - inside a session of that same account (signing in needed the password, or
 *    proved the mailbox some other way, which already confirmed it), or
 *  - with that account's password typed on the page (a link opened on a phone,
 *    or an agent still waiting for approval, who cannot sign in yet).
 * An account with no password has nothing to protect and is let through.
 *
 * Someone who does not know the password can reset it: the reset link proves
 * the mailbox, replaces the password, and clears what the old one set up
 * (reset-password route, lib/auth/unprovenPassword.ts).
 *
 * Call it after the link's token has matched an account and before anything
 * is written: a refusal leaves the link usable. Password tries are limited per
 * account; the token already keeps everyone but the mailbox's reader out.
 */
export async function checkPasswordHolder(
  account: PasswordHolderAccount,
  password: string | undefined,
): Promise<PasswordHolderResult> {
  if (!account.passwordHash) return { ok: true };

  const accountId = account._id.toString();
  const session = await auth();
  const sessionUserId = (session?.user as { id?: unknown } | undefined)?.id;
  if (typeof sessionUserId === "string" && sessionUserId === accountId) return { ok: true };

  if (!password) {
    return {
      ok: false,
      status: 401,
      code: "PASSWORD_REQUIRED",
      error: "Enter the password of this account to confirm.",
    };
  }

  if (account.lockUntil && new Date(account.lockUntil).getTime() > Date.now()) {
    return {
      ok: false,
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      error: "Too many tries. Wait a few minutes and try again.",
    };
  }

  const rl = await checkRateLimit(`link-pwd:${accountId}`, {
    limit: 5,
    windowSec: 15 * 60,
    prefix: "linkpwd",
    failClosed: true,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      error: "Too many tries. Wait a few minutes and try again.",
    };
  }

  if (await bcrypt.compare(password, account.passwordHash)) return { ok: true };
  return { ok: false, status: 401, code: "WRONG_PASSWORD", error: "That password isn't right." };
}
