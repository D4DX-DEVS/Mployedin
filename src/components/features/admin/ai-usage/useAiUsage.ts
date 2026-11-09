"use client";

/** React Query hooks for the admin AI usage report and the employer drill-down. */
import { useQuery } from "@tanstack/react-query";
import type { AiUsageGroup } from "@/lib/admin/aiUsageConstants";

export interface UsageRow {
  id: string;
  name: string;
  sub: string;
  calls: number;
  tokens: number;
  costUsd: number;
  prevCostUsd: number;
  share: number;
  mix: { feature: string; share: number }[];
  behalfCostUsd: number;
  ownCostUsd: number;
  employerCount: number;
}

export interface UsageSummary {
  month: string;
  kpis: {
    costUsd: number;
    prevCostUsd: number;
    calls: number;
    failed: number;
    cacheHits: number;
    unpriced: number;
    inputTokens: number;
    outputTokens: number;
  };
  tabs: Record<AiUsageGroup, number>;
  features: { feature: string; costUsd: number; calls: number }[];
  daily: { day: string; feature: string; costUsd: number }[];
  rows: UsageRow[];
  seekerFeatures: { feature: string; users: number; calls: number; costUsd: number }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UsageParams {
  month: string;
  group: AiUsageGroup;
  search: string;
  page: number;
  pageSize: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function useAiUsage(p: UsageParams) {
  const qs = new URLSearchParams({
    month: p.month,
    group: p.group,
    page: String(p.page),
    pageSize: String(p.pageSize),
  });
  if (p.search) qs.set("search", p.search);
  return useQuery({
    queryKey: ["admin-ai-usage", p],
    queryFn: () => getJson<UsageSummary>(`/api/admin/ai-usage?${qs}`),
    placeholderData: (prev) => prev,
  });
}

export interface EmployerUsage {
  employer: { id: string; name: string; city: string };
  month: string;
  kpis: { costUsd: number; prevCostUsd: number; calls: number; failed: number; inputTokens: number; outputTokens: number };
  features: { feature: string; calls: number; costUsd: number }[];
  people: { userId: string | null; name: string; role: string; onBehalf: boolean; calls: number; costUsd: number }[];
}

export function useEmployerUsage(id: string, month: string) {
  return useQuery({
    queryKey: ["admin-ai-usage-employer", id, month],
    queryFn: () => getJson<EmployerUsage>(`/api/admin/ai-usage/employers/${id}?month=${month}`),
  });
}

export interface CallRow {
  id: string;
  at: string;
  user: string;
  role: string;
  onBehalf: boolean;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean;
  cacheHit: boolean;
  ok: boolean;
}

export interface CallLogParams {
  employerId: string;
  month: string;
  feature: string;
  result: string;
  page: number;
  pageSize: number;
}

export function useCallLog(p: CallLogParams) {
  const qs = new URLSearchParams({ employerId: p.employerId, month: p.month, page: String(p.page), pageSize: String(p.pageSize) });
  if (p.feature !== "all") qs.set("feature", p.feature);
  if (p.result !== "all") qs.set("result", p.result);
  return useQuery({
    queryKey: ["admin-ai-usage-calls", p],
    queryFn: () =>
      getJson<{ data: CallRow[]; page: number; pageSize: number; total: number; totalPages: number }>(`/api/admin/ai-usage/calls?${qs}`),
    placeholderData: (prev) => prev,
  });
}

/** Last six UTC months, newest first, as `YYYY-MM`. */
export function recentMonths(now: Date = new Date(), count = 6): string[] {
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
}
