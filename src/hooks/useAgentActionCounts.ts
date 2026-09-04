import { useQuery } from "@tanstack/react-query";
// Typed from the shared module rather than from the route file: a client hook
// importing out of `app/api/**` drags a server route into the client graph's
// resolution, and the type lives here anyway.
import type { AgentActionCounts } from "@/lib/agents/workQueue";

const EMPTY: AgentActionCounts = {
  overdueTasks: 0,
  dueFollowUps: 0,
  interviewsAwaitingOutcome: 0,
  offersAwaitingResponse: 0,
  newCandidates: 0,
};

/**
 * Counts for the things waiting on an agent, used to badge navigation and to
 * rank the Today queue.
 *
 * One small endpoint rather than the five list queries the individual pages
 * already run, because every nav surface renders on every page. A failure
 * resolves to zeroes — a missing badge beats a navigation bar that throws.
 */
export function useAgentActionCounts(enabled = true): AgentActionCounts {
  const { data } = useQuery<AgentActionCounts>({
    queryKey: ["agent", "action-counts"],
    queryFn: async () => {
      const res = await fetch("/api/agent/action-counts");
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
