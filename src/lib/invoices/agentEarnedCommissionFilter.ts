/**
 * Mongo filter for Commission records an agent earns: the query form of
 * `commissionBeneficiary(...).role === "agent"` (lib/invoices/commissionRecords.ts)
 * for external records, which have no `role` field. Combined with
 * `{ superAgentId }` it gives the lines that super agent may approve. Their own
 * override lines are left out, because the server refuses self-approval.
 * Counting them made "1 commission waiting on your approval" un-clearable
 * (audit 2026-11-26 SA-01).
 *
 * Kept free of imports so dashboard code can use it without loading the
 * notification/model graph.
 */
export const AGENT_EARNED_COMMISSION_FILTER = {
  type: { $ne: "override" },
  agentId: { $ne: null },
} as const;
