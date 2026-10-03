/**
 * The WhatsApp id (`whatsapp.waId`) stored on a User: Meta's `wa_id` for the
 * number we sent to or heard from. A STOP is matched on it as well as on the
 * typed phone (see `numberMatchFilter` in webhookHandlers.ts). A phone change
 * resets it together with the rest of the number's WhatsApp state.
 */
import logger from "@/lib/logger";
import User from "@/models/User";
import NotificationPreference, { CATEGORY_KEYS } from "@/models/NotificationPreference";
import ConsentLog from "@/models/ConsentLog";
import { toWaRecipient } from "./phone";

/**
 * Two typed phones are the same number when send.ts would dial both the same
 * way (toWaRecipient). A phone it cannot read (no country code) compares as
 * typed, as the raw comparison did before.
 */
function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toWaRecipient(a);
  const y = toWaRecipient(b);
  if (x && y) return x === y;
  return (a ?? "") === (b ?? "");
}

/**
 * Stores the `wa_id` Meta returned for a send: it can differ from the typed
 * phone (Mexico's 521…, Brazil, Argentina). Best effort: a failed write never
 * fails the send, and the log line carries no number.
 */
export async function rememberWaId(userId: string, waId: string | undefined): Promise<void> {
  if (!waId) return;
  try {
    await User.updateOne({ _id: userId, "whatsapp.waId": { $ne: waId } }, { $set: { "whatsapp.waId": waId } });
  } catch {
    logger.warn({ userId }, "[whatsapp] could not store the wa_id Meta returned");
  }
}

/**
 * Call before saving a new `User.phone` (every route that writes it does).
 * WhatsApp state belongs to the old number, so a new one starts from nothing:
 * - the stored wa_id, which left in place would match an inbound STOP from the
 *   old number against this account;
 * - the consent: `optInAt` (a START from the old number) and the WhatsApp
 *   channel in every category. A kept consent would let anyone opt in once
 *   and then point the account at someone else's number. A ConsentLog row
 *   records the withdrawal when there was a consent to withdraw;
 * - `lastInboundAt`: the 24 h window was opened by the old number;
 * - `verifiedNumber` / `verifiedAt`: the START that proved the old number
 *   proves nothing about the new one, which needs its own START;
 * - `startCode`: so that START is sent with a fresh personal code (the next
 *   settings page load makes one, startLink.ts).
 * `optOutAt` stays: a STOP is never undone by a profile edit.
 *
 * Only when the stored phone is another number (a first phone included), so
 * saving the same number again changes nothing, whatever its format: profile
 * forms resend the phone as the input formats it, and "+971 50 123 4567" over
 * "+971501234567" must keep the consent, the START verification and the code. Numbers
 * compare as send.ts dials them (sameNumber). Not best effort: a failure of the
 * reset surfaces before the phone is written, so a save is never made on top of
 * the old number's state. The consent row alone is best effort, as in optIn.ts:
 * the history must not fail the user's save.
 *
 * Race safety: the decision needs the stored phone, so it is read first, and the
 * reset is a compare-and-set on exactly that value (the atomic pre-image read
 * still returns the account as it was). If another save changed the phone in
 * between, the filter misses and the helper reads and decides again. A phone
 * that keeps changing under it is reset unconditionally on the last attempt,
 * which only ever costs a new START.
 */
export async function forgetWaIdOnPhoneChange(userId: string, phone: string): Promise<void> {
  const ATTEMPTS = 3;
  let before: { name?: string; whatsapp?: { optInAt?: Date | null } } | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS && !before; attempt += 1) {
    const current = (await User.findById(userId).select("phone").lean()) as { phone?: string | null } | null;
    if (!current || sameNumber(current.phone, phone)) return;
    // `phone: null` also matches an account with no phone stored.
    const filter = attempt < ATTEMPTS ? { _id: userId, phone: current.phone ?? null } : { _id: userId };
    before = (await User.findOneAndUpdate(
      filter,
      { $unset: { "whatsapp.waId": 1, "whatsapp.optInAt": 1, "whatsapp.lastInboundAt": 1, "whatsapp.verifiedNumber": 1, "whatsapp.verifiedAt": 1, "whatsapp.startCode": 1 } },
      { returnDocument: "before" },
    )
      .select("name whatsapp.optInAt")
      .lean()) as { name?: string; whatsapp?: { optInAt?: Date | null } } | null;
  }
  if (!before) return;

  const pull: Record<string, string> = {};
  for (const c of CATEGORY_KEYS) pull[`categories.${c}.channels`] = "whatsapp";
  const prefs = await NotificationPreference.updateOne({ userId }, { $pull: pull });

  if (!before.whatsapp?.optInAt && prefs.modifiedCount === 0) return;
  try {
    await ConsentLog.create({ userId, userName: before.name ?? "Unknown", consentType: "whatsapp_messaging", granted: false, source: "phone_changed" });
  } catch (err) {
    logger.error({ err, userId }, "[whatsapp] consent record on phone change failed");
  }
}
