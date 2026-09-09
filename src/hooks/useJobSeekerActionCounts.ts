import { useQuery } from "@tanstack/react-query";

export interface JobSeekerActionCounts {
  /** Offers sent to this seeker that still need an accept / decline / counter. */
  pendingOffers: number;
  /** Interviews the seeker has not confirmed, declined or asked to move. */
  interviewsAwaitingResponse: number;
  /** Confirmed interviews still ahead — informational, not a decision. */
  upcomingInterviews: number;
  /** Every application this seeker has ever sent. */
  totalApplications: number;
  /** Applications not yet hired, rejected or withdrawn. */
  activeApplications: number;
}

const EMPTY: JobSeekerActionCounts = {
  pendingOffers: 0,
  interviewsAwaitingResponse: 0,
  upcomingInterviews: 0,
  totalApplications: 0,
  activeApplications: 0,
};

const QUERY_KEY = ["job-seeker", "action-counts"] as const;

/**
 * The raw query, for callers that must tell "still loading" and "failed" apart
 * from "zero" — the journey header shows a skeleton until the numbers arrive
 * and nothing at all if they never do, never a fake 0.
 */
export function useJobSeekerActionCountsQuery(enabled = true) {
  return useQuery<JobSeekerActionCounts>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/job-seeker/action-counts");
      if (!res.ok) throw new Error(`action-counts ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/**
 * Counts for the things waiting on a job seeker, used to badge navigation.
 *
 * Every nav surface renders on every page, so this is deliberately one small
 * endpoint rather than the three list queries the individual pages already run.
 * A failure resolves to zeroes: a missing badge is a far smaller problem than a
 * navigation bar that throws.
 */
export function useJobSeekerActionCounts(enabled = true): JobSeekerActionCounts {
  const { data } = useJobSeekerActionCountsQuery(enabled);
  return data ?? EMPTY;
}
