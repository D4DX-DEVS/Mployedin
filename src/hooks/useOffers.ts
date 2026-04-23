import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";

export interface Offer {
  _id: string;
  jobId: { _id: string; title: string; location?: string };
  applicationId: { _id: string; status: string };
  jobSeekerId: { _id: string; name?: string };
  salary: { amount: number; currency: string; period: "monthly" | "annually" };
  startDate: string;
  benefits?: string;
  notes?: string;
  status: OfferStatus;
  expiresAt: string;
  respondedAt?: string;
  declineReason?: string;
  createdAt: string;
}

interface OffersResponse {
  offers: Offer[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface OffersFilters {
  page: number;
  limit: number;
  status?: string;
  jobId?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const offerKeys = {
  all: ["offers"] as const,
  lists: () => [...offerKeys.all, "list"] as const,
  list: (filters: OffersFilters) => [...offerKeys.lists(), filters] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchOffers(filters: OffersFilters): Promise<OffersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.jobId && filters.jobId !== "all") params.set("jobId", filters.jobId);

  const res = await fetch(`/api/offers?${params}`);
  if (!res.ok) throw new Error("Failed to fetch offers");
  return res.json();
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered offers list */
export function useOffers(filters: OffersFilters) {
  return useQuery({
    queryKey: offerKeys.list(filters),
    queryFn: () => fetchOffers(filters),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Withdraw (delete) an offer */
export function useWithdrawOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const res = await fetch(`/api/offers/${offerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to withdraw offer");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: offerKeys.lists() });
    },
  });
}

/** Create a new offer */
export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      applicationId: string;
      salary: { amount: number; currency: string; period: string };
      startDate: string;
      benefits?: string;
      notes?: string;
    }) => {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create offer");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: offerKeys.lists() });
    },
  });
}
