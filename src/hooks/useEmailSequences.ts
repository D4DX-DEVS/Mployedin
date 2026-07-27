import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";

// ── Types ──────────────────────────────────────────────────────────
export type SequenceStatus = "draft" | "active" | "paused" | "completed";
export type RecipientStatus = "active" | "completed" | "unsubscribed" | "bounced";

export interface SequenceStep {
  _id?: string;
  order: number;
  subject: string;
  body: string;
  delayDays: number;
  condition?: string;
}

export interface SequenceRecipient {
  _id?: string;
  jobSeekerId?: string;
  email: string;
  name: string;
  currentStep: number;
  status: RecipientStatus;
  lastSentAt?: string;
  nextSendAt?: string;
  openedSteps: number[];
  clickedSteps: number[];
}

export interface EmailSequence {
  _id: string;
  name: string;
  description?: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  recipients?: SequenceRecipient[];
  fromName: string;
  fromEmail: string;
  tags: string[];
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceStepInput {
  subject: string;
  body: string;
  delayDays: number;
  condition?: string;
}

const SEQUENCES_KEY = ["email-sequences"] as const;
const sequenceKey = (id: string | null) => ["email-sequence", id] as const;

// ── Queries ────────────────────────────────────────────────────────
export function useEmailSequences(params: { page?: number; limit?: number; search?: string; status?: string | null } = {}) {
  const { page = 1, limit = 10, search = "", status = null } = params;
  return useQuery({
    queryKey: [...SEQUENCES_KEY, { page, limit, search, status }],
    queryFn: async () => {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const res = await fetch(`/api/email-sequences?${query}`);
      if (!res.ok) throw new Error("Failed to load email sequences");
      const data = (await res.json()) as {
        sequences?: EmailSequence[];
        total?: number;
        page?: number;
        totalPages?: number;
      };
      return {
        sequences: data.sequences ?? [],
        total: data.total ?? 0,
        page: data.page ?? page,
        totalPages: data.totalPages ?? 1,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useEmailSequence(id: string | null) {
  return useQuery({
    queryKey: sequenceKey(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/email-sequences/${id}`);
      if (!res.ok) throw new Error("Failed to load email sequence");
      const data = (await res.json()) as { sequence: EmailSequence };
      return data.sequence;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────
export function useCreateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      fromName?: string;
      fromEmail?: string;
      steps?: SequenceStepInput[];
      tags?: string[];
    }) => {
      const res = await csrfFetch("/api/email-sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to create sequence");
      }
      return (await res.json()) as { sequence: EmailSequence };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SEQUENCES_KEY }),
  });
}

export function useUpdateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string;
      fromName?: string;
      fromEmail?: string;
      status?: SequenceStatus;
      steps?: SequenceStepInput[];
    }) => {
      const res = await csrfFetch(`/api/email-sequences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update sequence");
      return (await res.json()) as { sequence: EmailSequence };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: SEQUENCES_KEY });
      qc.invalidateQueries({ queryKey: sequenceKey(vars.id) });
    },
  });
}

export function useAddRecipients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      recipients,
    }: {
      id: string;
      recipients: { email: string; name: string; jobSeekerId?: string }[];
    }) => {
      const res = await csrfFetch(`/api/email-sequences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_recipients", recipients }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to add recipients");
      }
      return (await res.json()) as { sequence: EmailSequence };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: SEQUENCES_KEY });
      qc.invalidateQueries({ queryKey: sequenceKey(vars.id) });
    },
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await csrfFetch(`/api/email-sequences/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete sequence");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SEQUENCES_KEY }),
  });
}
