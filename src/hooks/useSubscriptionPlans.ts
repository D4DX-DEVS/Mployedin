import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  IEmployerFeatureLimits,
  IJobSeekerFeatureLimits,
  IAIFeatureLimit,
  PlanTargetRole,
} from "@/types/subscription-plan";

// ── Types ──────────────────────────────────────────────────────────
export interface SubscriptionPlanItem {
  _id: string;
  name: string;
  slug: string;
  targetRole: PlanTargetRole;
  tier: number;
  description?: string;
  price: number;
  currency: string;
  billingCycle: "monthly" | "quarterly" | "yearly";
  employerLimits?: IEmployerFeatureLimits;
  jobSeekerLimits?: IJobSeekerFeatureLimits;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlanPayload {
  name: string;
  targetRole: PlanTargetRole;
  tier: number;
  description?: string;
  price: number;
  currency?: string;
  billingCycle: "monthly" | "quarterly" | "yearly";
  employerLimits?: IEmployerFeatureLimits;
  jobSeekerLimits?: IJobSeekerFeatureLimits;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}

export type { IEmployerFeatureLimits, IJobSeekerFeatureLimits, IAIFeatureLimit, PlanTargetRole };

// ── Query Keys ─────────────────────────────────────────────────────
export const subscriptionPlanKeys = {
  all: ["subscription-plans"] as const,
  lists: () => [...subscriptionPlanKeys.all, "list"] as const,
  list: (filters: { targetRole?: string; isActive?: string }) =>
    [...subscriptionPlanKeys.lists(), filters] as const,
  detail: (id: string) => [...subscriptionPlanKeys.all, "detail", id] as const,
};

// ── Fetch Functions ────────────────────────────────────────────────

async function fetchPlans(
  filters?: { targetRole?: string; isActive?: string },
): Promise<SubscriptionPlanItem[]> {
  const params = new URLSearchParams();
  if (filters?.targetRole) params.set("targetRole", filters.targetRole);
  if (filters?.isActive) params.set("isActive", filters.isActive);
  const qs = params.toString();

  const res = await fetch(
    `/api/admin/subscription-plans${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) throw new Error("Failed to load subscription plans");
  const data = await res.json();
  return data.plans;
}

async function fetchPlan(id: string): Promise<SubscriptionPlanItem> {
  const res = await fetch(`/api/admin/subscription-plans/${id}`);
  if (!res.ok) throw new Error("Failed to load subscription plan");
  const data = await res.json();
  return data.plan;
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useSubscriptionPlans(
  filters?: { targetRole?: string; isActive?: string },
) {
  return useQuery({
    queryKey: subscriptionPlanKeys.list(filters ?? {}),
    queryFn: () => fetchPlans(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubscriptionPlan(id: string | null) {
  return useQuery({
    queryKey: subscriptionPlanKeys.detail(id!),
    queryFn: () => fetchPlan(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubscriptionPlanPayload) => {
      const res = await fetch("/api/admin/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create plan");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: subscriptionPlanKeys.all }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<SubscriptionPlanPayload> & { id: string }) => {
      const res = await fetch(`/api/admin/subscription-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update plan");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: subscriptionPlanKeys.all }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/subscription-plans/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to deactivate plan");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: subscriptionPlanKeys.all }),
    onError: (err: Error) => toast.error(err.message),
  });
}
