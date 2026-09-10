import { useQuery } from "@tanstack/react-query";
import { availabilityUrl, type AvailabilityResponse } from "@/lib/interviews/availabilitySlots";

export const seekerAvailabilityKeys = {
  all: ["seeker-availability"] as const,
  window: (seekerId: string, date: string) => [...seekerAvailabilityKeys.all, seekerId, date] as const,
};

/**
 * One candidate's free interview slots over the next 7 days from `date`.
 * `data === null` means the candidate has not switched on instant booking
 * (the API answers 403) — callers render nothing rather than an error.
 */
export function useSeekerAvailability(seekerId: string | null | undefined, date: string) {
  return useQuery<AvailabilityResponse | null>({
    queryKey: seekerAvailabilityKeys.window(seekerId ?? "", date),
    queryFn: async (): Promise<AvailabilityResponse | null> => {
      const res = await fetch(availabilityUrl(seekerId as string, date));
      if (res.status === 403 || res.status === 404) return null;
      if (!res.ok) throw new Error("Availability request failed");
      return res.json();
    },
    enabled: Boolean(seekerId) && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 60 * 1000,
    retry: false,
  });
}
