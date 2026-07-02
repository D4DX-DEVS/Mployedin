import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";

// ── Types ──────────────────────────────────────────────────────────
export type TalentPoolSource = "rejected" | "withdrawn" | "manual" | "expired";

export interface PooledCandidateRef {
  _id: string;
  fullName?: string;
  headline?: string;
  skills?: string[];
  currentLocation?: string;
  userId?: { _id: string; name?: string; email?: string; avatar?: string };
}

export interface PooledCandidate {
  _id: string;
  jobSeekerId: PooledCandidateRef | string | null;
  addedAt: string;
  source: TalentPoolSource;
  notes?: string;
  tags?: string[];
}

export interface TalentPool {
  _id: string;
  name: string;
  description?: string;
  tags: string[];
  candidates: PooledCandidate[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const POOLS_KEY = ["talent-pools"] as const;
const poolKey = (id: string | null) => ["talent-pool", id] as const;

// ── Queries ────────────────────────────────────────────────────────
export function useTalentPools() {
  return useQuery({
    queryKey: POOLS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/talent-pools");
      if (!res.ok) throw new Error("Failed to load talent pools");
      const data = (await res.json()) as { pools?: TalentPool[] };
      return data.pools ?? [];
    },
  });
}

export function useTalentPool(id: string | null) {
  return useQuery({
    queryKey: poolKey(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/talent-pools/${id}`);
      if (!res.ok) throw new Error("Failed to load talent pool");
      const data = (await res.json()) as { pool: TalentPool };
      return data.pool;
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────
export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; tags?: string[] }) => {
      const res = await csrfFetch("/api/talent-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to create pool");
      }
      return (await res.json()) as { pool: TalentPool };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  });
}

export function useUpdatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; description?: string; tags?: string[] }) => {
      const res = await csrfFetch(`/api/talent-pools/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update pool");
      return (await res.json()) as { pool: TalentPool };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: POOLS_KEY });
      qc.invalidateQueries({ queryKey: poolKey(vars.id) });
    },
  });
}

export function useDeletePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await csrfFetch(`/api/talent-pools/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to archive pool");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  });
}

export function useAddCandidateToPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poolId,
      jobSeekerId,
      source,
      notes,
      sourceApplicationId,
    }: {
      poolId: string;
      jobSeekerId: string;
      source?: TalentPoolSource;
      notes?: string;
      sourceApplicationId?: string;
    }) => {
      const res = await csrfFetch(`/api/talent-pools/${poolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_candidate", jobSeekerId, source, notes, sourceApplicationId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        const error = new Error(err.error ?? "Failed to add candidate") as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      return (await res.json()) as { pool: TalentPool };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: POOLS_KEY });
      qc.invalidateQueries({ queryKey: poolKey(vars.poolId) });
    },
  });
}

export function useRemoveCandidateFromPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, candidateId }: { poolId: string; candidateId: string }) => {
      const res = await csrfFetch(`/api/talent-pools/${poolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_candidate", candidateId }),
      });
      if (!res.ok) throw new Error("Failed to remove candidate");
      return (await res.json()) as { pool: TalentPool };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: POOLS_KEY });
      qc.invalidateQueries({ queryKey: poolKey(vars.poolId) });
    },
  });
}
