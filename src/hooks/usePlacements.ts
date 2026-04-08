import { useQuery } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Placement {
  _id: string;
  jobTitle?: string;
  candidateName?: string;
  candidateEmail?: string;
  startDate?: string;
  salary?: { amount: number; currency: string };
  status: string;
  type: string;
  createdAt: string;
}

interface PlacementsResponse {
  placements?: Placement[];
  items?: Placement[];
  total?: number;
}

export interface PlacementsFilters {
  page: number;
  limit: number;
  status?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const placementKeys = {
  all: ["placements"] as const,
  lists: () => [...placementKeys.all, "list"] as const,
  list: (filters: PlacementsFilters) => [...placementKeys.lists(), filters] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchPlacements(filters: PlacementsFilters): Promise<{ placements: Placement[]; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.status && filters.status !== "all") params.set("status", filters.status);

  const res = await fetch(`/api/placements?${params}`);
  if (!res.ok) throw new Error("Failed to fetch placements");
  const data: PlacementsResponse = await res.json();
  const items = data.placements ?? data.items ?? [];
  return { placements: items, total: data.total ?? items.length };
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered placements list */
export function usePlacements(filters: PlacementsFilters) {
  return useQuery({
    queryKey: placementKeys.list(filters),
    queryFn: () => fetchPlacements(filters),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
