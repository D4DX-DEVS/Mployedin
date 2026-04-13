import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface TrainingItem {
  _id?: string;
  title: string;
  provider: string;
  url?: string;
  targetRole?: string;
  status: "not_started" | "in_progress" | "completed";
  dueDate?: string;
  notes?: string;
  completedAt?: string;
}

interface TrainingResponse {
  items: TrainingItem[];
}

// ── Query Keys ─────────────────────────────────────────────────────
export const trainingKeys = {
  all: ["training"] as const,
  list: () => [...trainingKeys.all, "list"] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchTraining(): Promise<TrainingItem[]> {
  const res = await fetch("/api/employers/training");
  if (!res.ok) throw new Error("Failed to fetch training items");
  const data: TrainingResponse = await res.json();
  return data.items ?? [];
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch all training items */
export function useTraining() {
  return useQuery({
    queryKey: trainingKeys.list(),
    queryFn: fetchTraining,
    staleTime: 5 * 60 * 1000,
  });
}

/** Create a new training item */
export function useCreateTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: Omit<TrainingItem, "_id">) => {
      const { dueDate, ...rest } = form;
      const payload = {
        ...rest,
        ...(dueDate ? { dueDate } : {}),
      };
      const res = await fetch("/api/employers/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create training item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingKeys.list() });
    },
  });
}

/** Update the status of a training item */
export function useUpdateTrainingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TrainingItem["status"] }) => {
      const res = await fetch(`/api/employers/training/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to update training status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingKeys.list() });
    },
  });
}
