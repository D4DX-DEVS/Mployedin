import crypto from "crypto";
import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import logger from "@/lib/logger";

/** How long a reset link stays redeemable. Mirrored by the reset-password route. */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * The parts of a User document this needs. Structural rather than `IUser` so a
 * lean projection or a test double can be handed in without casting.
 */
export interface PasswordResetTarget {
  _id: { toString(): string };
  email?: string | null;
  role?: string;
  locale?: string;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  passwordResetAttempts?: number;
  save: () => Promise<unknown>;
}

export interface IssuePasswordResetOptions {
  /** Who triggered it — the account holder for self-service, the admin otherwise. */
  actor: { actorId?: string; actorRole?: string };
  req?: NextRequest;
}

/**
 * Mint a reset token on `user` and email the link.
 *
 * Both entry points — the public forgot-password form and an admin sending a
 * reset from the users table — have to produce the *same* token shape, TTL and
 * attempt reset, or one of them yields a link the reset-password route refuses.
 * Keeping that in one place is the point of this helper.
 *
 * Delivery failure is reported back rather than thrown: the self-service caller
 * must stay silent about it (email enumeration), while an admin who just
 * clicked "Send password reset" needs to be told it did not go out.
 */
export async function issuePasswordReset(
  user: PasswordResetTarget,
  { actor, req }: IssuePasswordResetOptions,
): Promise<{ delivered: boolean }> {
  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  user.passwordResetAttempts = 0;
  await user.save();

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const userLocale = user.locale ?? "en";
  const resetUrl = `${appUrl}/${userLocale}/reset-password?token=${encodeURIComponent(resetToken)}`;

  try {
    const template = EmailTemplates.passwordReset(resetUrl);
    await sendEmail({ to: String(user.email), ...template });
    return { delivered: true };
  } catch (emailErr) {
    logger.error({ err: emailErr }, "[PasswordReset] Reset email could not be sent");
    // Queryable next to every other auth event: a reset that never reached the
    // inbox used to leave nothing behind but a line in the server log.
    logActivity({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: "password_reset.email_failed",
      resource: "auth",
      meta: { email: user.email, error: emailErr instanceof Error ? emailErr.message : "unknown" },
      ...(req ? { req } : {}),
    });
    return { delivered: false };
  }
}
