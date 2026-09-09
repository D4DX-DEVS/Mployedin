import { useQueries } from "@tanstack/react-query";

export interface JourneyInterview {
  _id: string;
  interviewRound?: number;
  status: string;
  outcome?: string;
  scheduledAt?: string;
}
export interface JourneyOffer {
  _id: string;
  status: string;
  expiresAt?: string;
  createdAt?: string;
}
export interface JourneyCheck {
  _id: string;
  status: string;
  references?: { status?: string }[];
  createdAt?: string;
}
export interface JourneyPlacement {
  _id: string;
  status?: string;
  startDate?: string;
}

export interface CandidateJourneyData {
  interviews: JourneyInterview[];
  offer?: JourneyOffer;
  check?: JourneyCheck;
  placement?: JourneyPlacement;
}

const newest = <T extends { createdAt?: string }>(rows: T[]): T | undefined =>
  [...rows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];

/** Pure shaping of the four per-application lists into one journey record. */
export function summarizeJourney(
  interviews: JourneyInterview[],
  offers: JourneyOffer[],
  checks: JourneyCheck[],
  placements: JourneyPlacement[],
): CandidateJourneyData {
  return {
    interviews: [...interviews].sort((a, b) => (a.interviewRound ?? 1) - (b.interviewRound ?? 1) || String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? ""))),
    offer: newest(offers),
    check: newest(checks),
    placement: placements[0],
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const candidateJourneyKeys = {
  all: ["candidate-journey"] as const,
  detail: (applicationId: string) => [...candidateJourneyKeys.all, applicationId] as const,
};

/** Interviews, latest offer, latest background check and placement for one application. */
export function useCandidateJourney(applicationId: string | null | undefined) {
  const enabled = Boolean(applicationId);
  const id = applicationId ?? "";
  const q = encodeURIComponent(id);
  const results = useQueries({
    queries: [
      { queryKey: [...candidateJourneyKeys.detail(id), "interviews"], queryFn: () => getJson<{ interviews?: JourneyInterview[]; items?: JourneyInterview[] }>(`/api/interviews?applicationId=${q}&limit=20`), enabled, staleTime: 30 * 1000 },
      { queryKey: [...candidateJourneyKeys.detail(id), "offers"], queryFn: () => getJson<{ offers?: JourneyOffer[] }>(`/api/offers?applicationId=${q}&limit=5`), enabled, staleTime: 30 * 1000 },
      { queryKey: [...candidateJourneyKeys.detail(id), "checks"], queryFn: () => getJson<{ items?: JourneyCheck[] }>(`/api/employer/background-checks?applicationId=${q}&limit=5`), enabled, staleTime: 30 * 1000 },
      { queryKey: [...candidateJourneyKeys.detail(id), "placements"], queryFn: () => getJson<{ placements?: JourneyPlacement[] }>(`/api/placements?applicationId=${q}&limit=1`), enabled, staleTime: 30 * 1000 },
    ],
  });
  const [interviews, offers, checks, placements] = results;
  const isLoading = enabled && results.some((r) => r.isLoading);
  const data = isLoading
    ? undefined
    : summarizeJourney(
        interviews.data?.interviews ?? interviews.data?.items ?? [],
        offers.data?.offers ?? [],
        checks.data?.items ?? [],
        placements.data?.placements ?? [],
      );
  return { data, isLoading, isError: results.some((r) => r.isError) };
}
