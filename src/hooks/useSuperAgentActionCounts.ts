import { useQuery } from "@tanstack/react-query";

export interface SuperAgentActionCounts {
  /** Exhibition requests from this super-agent's team awaiting their review. */
  pendingExhibitionReviews: number;
  /** Commissions on this super-agent's own record still needing sign-off. */
  pendingCommissionApprovals: number;
  /** Leads in scope whose follow-up date has passed and are still in play. */
  overdueLeadFollowUps: number;
}

const EMPTY: SuperAgentActionCounts = {
  pendingExhibitionReviews: 0,
  pendingCommissionApprovals: 0,
  overdueLeadFollowUps: 0,
};

/**
 * Counts for the things waiting on a super-agent, used to badge navigation.
 *
 * Every nav surface renders on every page, so this is deliberately one small
 * endpoint rather than the list queries the individual pages already run. A
 * failure resolves to zeroes: a missing badge is a far smaller problem than a
 * navigation bar that throws.
 */
export function useSuperAgentActionCounts(enabled = true) {
  const { data } = useQuery<SuperAgentActionCounts>({
    queryKey: ["super-agent", "action-counts"],
    queryFn: async () => {
      const res = await fetch("/api/super-agent/action-counts");
      if (!res.ok) return EMPTY;
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return data ?? EMPTY;
}
