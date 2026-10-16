/**
 * The budget rule of the target chain: a super agent's profit target is split
 * among their agents, and what the agents are given never adds up to more than
 * the super agent's own target. Amounts compare in integer minor units so a
 * decimal target cannot trip the check on float noise.
 */

import type mongoose from "mongoose";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";

const toCents = (amount: number) => Math.round((amount || 0) * 100);
const fromCents = (cents: number) => cents / 100;

/**
 * What a super agent's profile has already given to agents: the sum of its
 * active children's profit targets. `excludeProfileIds` leaves out children
 * that are about to be overwritten.
 */
export async function allocatedProfitCents(
  parentProfileId: string | mongoose.Types.ObjectId,
  excludeProfileIds: (string | mongoose.Types.ObjectId)[] = [],
): Promise<number> {
  const children = await TargetProfile.find({
    ...PROFIT_TARGET_FILTER,
    parentProfileId,
    status: "active",
    ...(excludeProfileIds.length ? { _id: { $nin: excludeProfileIds } } : {}),
  })
    .select("profitTarget")
    .lean();
  return children.reduce((sum, child) => sum + toCents(child.profitTarget as number), 0);
}

export interface BudgetCheck {
  withinBudget: boolean;
  /** Budget left after the proposed allocations; negative when over. */
  remaining: number;
}

/** Would `proposed` on top of `allocatedCents` stay within the parent's target? */
export function checkProfitBudget(parentProfitTarget: number, allocatedCents: number, proposedCents: number): BudgetCheck {
  const remainingCents = toCents(parentProfitTarget) - allocatedCents - proposedCents;
  return { withinBudget: remainingCents >= 0, remaining: fromCents(remainingCents) };
}

export const profitToCents = toCents;
