/**
 * The one WhatsApp opt-out rule, shared by every send path (per-user
 * notifications, admin broadcasts, schedules). Pure on purpose: no models, so
 * any module can import it without pulling in Mongoose.
 */

/** The consent fields of `User.whatsapp` that the opt-out decision reads. */
export interface WhatsAppConsentState {
  optInAt?: Date | string | null;
  optOutAt?: Date | string | null;
}

/**
 * An inbound STOP sets `optOutAt`; a later START stamps `optInAt` after it
 * (turning the channel back on in settings does not: it is a preference). The STOP stands unless the
 * opt-in is strictly newer, so a tie goes to the STOP, the same order guard
 * webhookHandlers applies. A date that cannot be read counts as opted out:
 * the failure mode of a withdrawn consent must be "do not send".
 */
export function hasOptedOut(w: WhatsAppConsentState | null | undefined): boolean {
  if (!w?.optOutAt) return false;
  const out = new Date(w.optOutAt).getTime();
  if (Number.isNaN(out)) return true;
  if (!w.optInAt) return true;
  const opted = new Date(w.optInAt).getTime();
  if (Number.isNaN(opted)) return true;
  return out >= opted;
}
