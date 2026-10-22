/**
 * A write tool's result tells the model "a confirmation card is shown", and the
 * model then repeats that sentence on later turns without calling any tool —
 * the user reads "confirm it in the UI" with no card on screen (2026-10-21:
 * "mark that task as in progress" got that reply and nothing happened). The
 * chat route asks the model once more when a reply makes that claim but the
 * turn proposed nothing.
 */
const CARD_CLAIM = /confirmation card|confirm (?:it )?(?:in|on) the (?:ui|card|panel)|بطاقة (?:ال)?تأكيد/i;

export function claimsConfirmationCard(text: string | null | undefined): boolean {
  return Boolean(text && CARD_CLAIM.test(text));
}

export const PHANTOM_CARD_CORRECTION =
  "System check: you did not call any tool in this turn, so no confirmation card exists and nothing will happen. " +
  "Call the right tool now — use a read tool first (e.g. my_tasks) if you need an id — or tell the user plainly what you still need. " +
  "Do not mention a confirmation card unless a tool you call returns awaiting_user_confirmation.";
