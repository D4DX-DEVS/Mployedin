import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReferralAudience } from "@/lib/referrals/url";

// ── Types ──────────────────────────────────────────────────────────

export interface ReferralRegistration {
  /** Missing on rows written before job-seeker links existed → employer. */
  kind?: "employer" | "job_seeker";
  employerId?: string;
  jobSeekerId?: string;
  userId: string;
  /** Employer rows only. */
  companyName?: string;
  /** Job-seeker rows only. */
  name?: string;
  email: string;
  country?: string;
  city?: string;
  registeredAt: string;
}

export interface ReferralLinkItem {
  _id: string;
  code: string;
  createdBy: { _id: string; name: string; email: string } | string;
  creatorRole: "agent" | "super_agent";
  /** Missing on links created before job-seeker links existed → employer. */
  audience?: ReferralAudience;
  label?: string;
  expiresAt?: string;
  maxUses: number;
  usedCount: number;
  registrations: ReferralRegistration[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReferralLinkStatus = "active" | "expired" | "maxed" | "inactive";
export type ReferralCreatorRole = "agent" | "super_agent";
export type ReferralSortField = "createdAt" | "usedCount" | "code" | "label";

export interface ReferralLinksFilters {
  page: number;
  limit: number;
  search?: string;
  status?: ReferralLinkStatus;
  creatorRole?: ReferralCreatorRole;
  audience?: ReferralAudience;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: ReferralSortField;
  sortOrder?: "asc" | "desc";
}

export interface ReferralLinksStats {
  totalLinks: number;
  activeLinks: number;
  totalRegistrations: number;
  employerRegistrations: number;
  jobSeekerRegistrations: number;
  myLinks: number;
  agentLinks: number;
}

interface ReferralLinksResponse {
  links: ReferralLinkItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: ReferralLinksStats;
}

interface CreateReferralLinkPayload {
  audience?: ReferralAudience;
  label?: string;
  maxUses?: number;
  expiresAt?: string;
}

interface UpdateReferralLinkPayload {
  id: string;
  label?: string;
  isActive?: boolean;
  maxUses?: number;
  expiresAt?: string | null;
}

// ── Query Keys ─────────────────────────────────────────────────────

export const referralLinkKeys = {
  all: ["referral-links"] as const,
  lists: () => [...referralLinkKeys.all, "list"] as const,
  list: (filters: ReferralLinksFilters) => [...referralLinkKeys.lists(), filters] as const,
  detail: (id: string) => [...referralLinkKeys.all, "detail", id] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated referral links list */
export function useReferralLinks(filters: ReferralLinksFilters) {
  return useQuery({
    queryKey: referralLinkKeys.list(filters),
    queryFn: async (): Promise<ReferralLinksResponse> => {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("limit", String(filters.limit));
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.creatorRole) params.set("creatorRole", filters.creatorRole);
      if (filters.audience) params.set("audience", filters.audience);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
      const res = await fetch(`/api/referral-links?${params}`);
      if (!res.ok) throw new Error("Failed to fetch referral links");
      return res.json();
    },
    staleTime: 5_000,
    refetchOnMount: "always",
    placeholderData: (prev) => prev,
  });
}

/** Fetch single referral link details */
export function useReferralLinkDetail(id: string | null) {
  return useQuery({
    queryKey: referralLinkKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await fetch(`/api/referral-links/${id}`);
      if (!res.ok) throw new Error("Failed to fetch referral link");
      return res.json() as Promise<{ link: ReferralLinkItem }>;
    },
    enabled: Boolean(id),
  });
}

/** Create a new referral link */
export function useCreateReferralLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateReferralLinkPayload) => {
      const res = await fetch("/api/referral-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create referral link");
      }
      return res.json() as Promise<{ link: ReferralLinkItem; referralUrl: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referralLinkKeys.lists() });
    },
  });
}

/** Update a referral link */
export function useUpdateReferralLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateReferralLinkPayload) => {
      const res = await fetch(`/api/referral-links/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update referral link");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referralLinkKeys.all });
    },
  });
}

/** Delete (deactivate) a referral link */
export function useDeleteReferralLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/referral-links/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete referral link");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referralLinkKeys.lists() });
    },
  });
}

/** Effective display status of a referral link, derived from its own fields. */
export function linkStatus(link: ReferralLinkItem): "active" | "expired" | "maxed" | "inactive" {
  if (!link.isActive) return "inactive";
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  if (link.maxUses > 0 && link.usedCount >= link.maxUses) return "maxed";
  return "active";
}
