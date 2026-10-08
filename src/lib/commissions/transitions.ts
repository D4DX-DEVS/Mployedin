import type { CommissionStatus } from "@/models/Commission";

/**
 * Commission status lifecycle (CM-1).
 *
 *   pending     → approved | disputed
 *   approved    → paid | disputed | clawed_back
 *   paid        → clawed_back | disputed
 *   disputed    → approved | pending | clawed_back   (resolution: commissions:update only)
 *   clawed_back → (terminal)
 *
 * A no-op (same status) is not a transition and is always allowed.
 *
 * Exception: a dispute on a commission that was already PAID may only be
 * settled back to `paid` or `clawed_back`. Returning it to approved/pending
 * would let the next payout batch (which selects status:"approved") pay it a
 * second time.
 */
export const COMMISSION_TRANSITIONS: Readonly<Record<CommissionStatus, readonly CommissionStatus[]>> = {
  pending: ["approved", "disputed"],
  approved: ["paid", "disputed", "clawed_back"],
  paid: ["clawed_back", "disputed"],
  disputed: ["approved", "pending", "clawed_back"],
  clawed_back: [],
};

/**
 * Privilege tier of the caller for a status change:
 * - "update":      holds commissions:update (admin) — every mapped transition.
 * - "approve":     approve-only (super_agent) — pending→approved and →disputed.
 * - "beneficiary": the line's own earner without approve — →disputed only (CM-3).
 */
export type CommissionTransitionActor = "update" | "approve" | "beneficiary";

export function isAllowedCommissionTransition(
  from: CommissionStatus,
  to: CommissionStatus,
  actor: CommissionTransitionActor,
  opts: { paidBefore?: boolean } = {},
): boolean {
  if (from === to) return true;
  if (from === "disputed" && opts.paidBefore) {
    return actor === "update" && (to === "paid" || to === "clawed_back");
  }
  if (!COMMISSION_TRANSITIONS[from]?.includes(to)) return false;
  if (actor === "update") return true;
  if (to === "disputed") return true;
  return actor === "approve" && from === "pending" && to === "approved";
}
