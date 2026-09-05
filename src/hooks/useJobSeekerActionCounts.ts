import { useQuery } from "@tanstack/react-query";

export interface JobSeekerActionCounts {
  /** Offers sent to this seeker that still need an accept / decline / counter. */
  pendingOffers: number;
  /** Interviews the seeker has not confirmed, declined or asked to move. */
  interviewsAwaitingResponse: number;
  /** Confirmed interviews still ahead — informational, not a decision. */
  upcomingInterviews: number;
}

const EMPTY: JobSeekerActionCounts = {
  pendingOffers: 0,
  interviewsAwaitingResponse: 0,
  upcomingInterviews: 0,
};

/**
 * Counts for the things waiting on a job seeker, used to badge navigation.
 *
 * Every nav surface renders on every page, so this is deliberately one small
 * endpoint rather than the three list queries the individual pages already run.
 * A failure resolves to zeroes: a missing badge is a far smaller problem than a
 * navigation bar that throws.
 */
export function useJobSeekerActionCounts(enabled = true) {
  const { data } = useQuery<JobSeekerActionCounts>({
    queryKey: ["job-seeker", "action-counts"],
    queryFn: async () => {
      const res = await fetch("/api/job-seeker/action-counts");
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
