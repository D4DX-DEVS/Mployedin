import User from "@/models/User";
import { Webhook } from "@/models/Webhook";
import ApiKey from "@/models/ApiKey";
import { PushSubscription } from "@/models/PushSubscription";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { noteSessionsCutOff, revokeMcpGrants } from "@/lib/auth/sessionCutOff";

/** The sign-in route that has just proved who owns the mailbox. */
export type MailboxProof = "email-otp" | "firebase-google" | "linkedin" | "apple" | "password-reset";

export interface UnprovenPasswordContext {
  provider: MailboxProof;
  role: string;
}

/**
 * Removes a password that nobody proved the mailbox for.
 *
 * An account can hold a password while its address is still unverified:
 * anyone can register someone else's address with a password of their own, and
 * an employer can add a colleague's address with a password the employer is
 * shown. When the real owner then proves the mailbox another way (an e-mail
 * code, Google / LinkedIn / Apple, or a password-reset link), the account used to be marked verified
 * with that password still working, so whoever set it kept a way in.
 *
 * Call this BEFORE the account is marked verified: the filter only matches an
 * unverified account, which is also what makes a repeat call a no-op.
 *
 * Besides the password it takes away what that password could have set up to
 * get back in:
 *  - `sessionsValidAfter` ends every session signed in before now (jwt
 *    callback; it compares the sign-in time, not `iat`, which every request
 *    refreshes). The sign-in that triggered this is stamped afterwards, so the
 *    owner stays signed in.
 *  - `passwordChangedAt` cuts MCP grants (lib/mcp/oauth.ts).
 *  - a pending e-mail change, which is confirmed from the new address with no
 *    session at all;
 *  - the calendar feed link, which works without signing in;
 *  - the WhatsApp number a START came from (sends go only to that number);
 *  - webhooks and API keys the account created, its browser push
 *    subscriptions and its MCP app grants (revokeUnprovenAccessElsewhere).
 *
 * The owner is left with no password: the account then offers "Set a password"
 * (POST /api/users/set-password), and they can still log in by code.
 */
export async function dropUnprovenPassword(userId: string, context: UnprovenPasswordContext): Promise<boolean> {
  const now = new Date();
  const cleanup = unprovenAccessCleanup(now);
  const result = await User.updateOne(
    {
      _id: userId,
      isEmailVerified: { $ne: true },
      passwordHash: { $exists: true, $nin: [null, ""] },
    },
    { $set: cleanup.$set, $unset: { ...cleanup.$unset, passwordHash: "" } },
  );
  if (result.modifiedCount !== 1) return false;

  // This server ends the old sessions on their next request, not 30 s later.
  noteSessionsCutOff(userId, now);
  await revokeUnprovenAccessElsewhere(userId);
  logUnprovenPasswordRemoved(userId, context);
  return true;
}

export interface UnprovenAccessCleanup {
  $set: Record<string, unknown>;
  $unset: Record<string, "">;
}

/**
 * The account fields that go with an unproven password, as one update — all
 * but the password itself, so a route that replaces it (reset-password) can
 * write the new one in the same update.
 */
export function unprovenAccessCleanup(now: Date): UnprovenAccessCleanup {
  return {
    // sessionsValidAfter ends sessions (jwt callback); passwordChangedAt cuts
    // MCP grants (lib/mcp/oauth.ts). The lockout belonged to the old password.
    $set: { passwordChangedAt: now, sessionsValidAfter: now, failedLoginAttempts: 0, lockUntil: null },
    $unset: {
      // No temporary password is left for the dashboard notice to talk about.
      tempPasswordIssuedAt: "",
      pendingEmail: "",
      emailChangeToken: "",
      emailChangeExpires: "",
      calendarFeedToken: "",
      "whatsapp.verifiedNumber": "",
      "whatsapp.waId": "",
      // The START code was shown to whoever held the password; from the
      // profile phone (theirs) it would verify the number again. A new one is
      // made on the owner's next visit to the settings page.
      "whatsapp.startCode": "",
    },
  };
}

/**
 * What the account set up outside its own row and that still reaches whoever
 * held the unproven password. Run after the account row is written. Never
 * throws, and one failure does not stop the others: by then the password is
 * gone, and refusing the owner's sign-in would only lock them out.
 */
export async function revokeUnprovenAccessElsewhere(userId: string): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["webhooks", () => Webhook.updateMany({ createdBy: userId, isActive: true }, { $set: { isActive: false } })],
    ["API keys", () => ApiKey.updateMany({ createdBy: userId, isActive: true }, { $set: { isActive: false } })],
    ["push subscriptions", () => PushSubscription.deleteMany({ userId })],
    // MCP access and refresh tokens (ChatGPT / Claude connectors).
    ["app grants", () => revokeMcpGrants(userId)],
  ];
  for (const [what, run] of steps) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, userId }, `[unprovenPassword] Could not switch off the account's ${what}`);
    }
  }
}

export function logUnprovenPasswordRemoved(userId: string, context: UnprovenPasswordContext): void {
  logActivity({
    actorId: userId,
    actorRole: context.role,
    action: "auth.unproven_password_removed",
    resource: "auth",
    resourceId: userId,
    meta: { provider: context.provider },
  });
}
