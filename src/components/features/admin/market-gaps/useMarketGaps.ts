"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export type GapKind = "find_employers" | "thin_supply" | "find_seekers" | "fix_data";
export type GapStatus = "new" | "assigned" | "done" | "dismissed" | "resolved";

export interface GapRow {
  id: string;
  kind: GapKind;
  areaId: string | null;
  areaName: string;
  saName: string;
  role: string;
  seekers: number;
  jobs: number;
  priority: "high" | "medium" | "low";
  topSkills: { skill: string; count: number }[];
  medianWaitDays: number;
  status: GapStatus;
  seekersChange: number | null;
}

export interface GapList {
  snapshot: {
    generatedAt: string;
    seekersConsidered: number;
    noAreaCount: number;
    activeJobs: number;
    areas: { areaId?: string | null; name: string; seekers: number }[];
  } | null;
  kpis: { unplacedSeekers: number; rolesWithNoJobs: number; areasAffected: number; openSuggestions: number; newThisWeek: number };
  territories: { id: string; name: string }[];
  doFirst: GapRow[];
  data: GapRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GapDetail extends GapRow {
  trend: { at: string; seekers: number; jobs: number }[];
  firstSeenAt: string;
  saUserId: string | null;
  history: { at: string; action: string; note: string; by: string }[];
  seekerSample: { id: string; name: string; skills: string[]; waitDays: number }[];
}

export interface GapFilters {
  kind: string;
  status: string;
  priority: string;
  territory: string;
  area: string;
  search: string;
  sort: string;
  page: number;
  pageSize: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function useMarketGaps(f: GapFilters) {
  const qs = new URLSearchParams({ status: f.status, sort: f.sort, page: String(f.page), pageSize: String(f.pageSize) });
  for (const k of ["kind", "priority", "territory", "area", "search"] as const) if (f[k] && f[k] !== "all") qs.set(k, f[k]);
  return useQuery({
    queryKey: ["admin-market-gaps", f],
    queryFn: () => getJson<GapList>(`/api/admin/market-gaps?${qs}`),
    placeholderData: (prev) => prev,
  });
}

export function useGapDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin-market-gap", id],
    queryFn: () => getJson<GapDetail>(`/api/admin/market-gaps/${id}`),
    enabled: Boolean(id),
  });
}

export function useGapAgents(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-market-gap-agents", id],
    queryFn: () => getJson<{ agents: { userId: string; name: string; email: string }[] }>(`/api/admin/market-gaps/${id}/assign`),
    enabled: Boolean(id) && enabled,
  });
}

export async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export function useInvalidateGaps() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin-market-gaps"] });
    void qc.invalidateQueries({ queryKey: ["admin-market-gap"] });
  };
}
