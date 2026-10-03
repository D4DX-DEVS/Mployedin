/**
 * The one "number verified" rule, shared by every send path (per-user
 * notifications, admin broadcasts, schedules) and the settings pages' status.
 * Pure on purpose, like optOut.ts: no models.
 *
 * Anyone can type any number on a profile, so a typed number proves nothing.
 * A START sent from the number does: Meta signs the webhook, and the handler
 * records the sender as `whatsapp.verifiedNumber` ("+" and digits, the form
 * send.ts sends to). A phone change clears it (waId.ts).
 */
import { toWaRecipient } from "./phone";

/** True when the START on record came from the number on the profile, compared as send.ts would dial it. */
export function isWhatsAppNumberVerified(phone: string | null | undefined, verifiedNumber: string | null | undefined): boolean {
  if (!verifiedNumber) return false;
  const recipient = toWaRecipient(phone);
  return recipient !== null && verifiedNumber === `+${recipient}`;
}
