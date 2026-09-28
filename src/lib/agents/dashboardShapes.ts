import type { AgentScope } from "./workQueue";

/**
 * Shapes and constants for the agent home's trend data. Kept free of model
 * imports so panels (and their tests) can use them without loading mongoose;
 * the queries live in dashboardTrends.ts.
 */

export interface AgentDailyTrend {
  /** ISO date (UTC day). */
  day: string;
  leads: number;
  jobs: number;
  applications: number;
  interviews: number;
  placements: number;
}

export interface AgentWindowCounts {
  leads: number;
  jobs: number;
  applications: number;
  interviews: number;
  placements: number;
}

export interface AgentActivityTrend {
  /** Days in the window, oldest first. */
  daily: AgentDailyTrend[];
  current: AgentWindowCounts;
  previous: AgentWindowCounts;
  /** Length of each window in days. */
  days: number;
}

export type LeadStage = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";

export const LEAD_STAGES: readonly LeadStage[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

export type CommissionBucket = "pending" | "approved" | "paid" | "disputed";

export const COMMISSION_BUCKETS: readonly CommissionBucket[] = ["pending", "approved", "paid", "disputed"];

export interface CommissionBucketTotal {
  count: number;
  amount: number;
}

/** Jobs owned directly or through an assigned employer: the portfolio the queue also uses. */
export function portfolioMatch(scope: Pick<AgentScope, "agentId" | "assignedEmployerIds">): Record<string, unknown> {
  return {
    $or: [
      { agentId: scope.agentId },
      ...(scope.assignedEmployerIds.length ? [{ employerId: { $in: scope.assignedEmployerIds } }] : []),
    ],
  };
}
