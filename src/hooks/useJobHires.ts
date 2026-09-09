import { useQueries } from "@tanstack/react-query";

/** One hired candidate on a job, joined from applications + placements + background checks. */
export interface HireRow {
  applicationId: string;
  candidateName?: string;
  avatar?: string;
  /** When the application reached `hired` (falls back to the placement date). */
  hiredAt?: string;
  placement?: { _id: string; status: string; visaStatus?: string; startDate?: string };
  check?: { _id: string; status: string; checkType?: string; referencesTotal: number; referencesReplied: number };
}

export interface HiredApplicationRow {
  _id: string;
  appliedAt?: string;
  updatedAt?: string;
  jobSeekerId?: { fullName?: string; userId?: { name?: string; avatar?: string } | string } | null;
}
export interface PlacementRow {
  _id: string;
  applicationId?: string;
  status?: string;
  visaStatus?: string;
  startDate?: string;
  placedAt?: string;
  createdAt?: string;
  candidateName?: string;
}
export interface CheckRow {
  _id: string;
  applicationId?: string | { _id?: string };
  status: string;
  checkType?: string;
  references?: { status?: string }[];
  createdAt?: string;
}

const idOf = (v: string | { _id?: unknown } | undefined): string | undefined =>
  typeof v === "string" ? v : v && typeof v === "object" && v._id ? String(v._id) : undefined;

/** Pure join: hired applications first (newest first), then orphan placements. */
export function composeHires(apps: HiredApplicationRow[], placements: PlacementRow[], checks: CheckRow[]): HireRow[] {
  const placementByApp = new Map<string, PlacementRow>();
  for (const p of placements) if (p.applicationId) placementByApp.set(String(p.applicationId), p);
  const checkByApp = new Map<string, CheckRow>();
  for (const c of checks) {
    const key = idOf(c.applicationId);
    if (!key) continue;
    const prev = checkByApp.get(key);
    if (!prev || String(c.createdAt ?? "") > String(prev.createdAt ?? "")) checkByApp.set(key, c);
  }
  const toPlacement = (p?: PlacementRow) => (p ? { _id: p._id, status: p.status ?? "active", visaStatus: p.visaStatus, startDate: p.startDate } : undefined);
  const toCheck = (c?: CheckRow) =>
    c
      ? {
          _id: c._id,
          status: c.status,
          checkType: c.checkType,
          referencesTotal: c.references?.length ?? 0,
          referencesReplied: (c.references ?? []).filter((r) => r.status === "responded").length,
        }
      : undefined;

  const seen = new Set<string>();
  const rows: HireRow[] = apps.map((a) => {
    seen.add(a._id);
    const seeker = a.jobSeekerId ?? undefined;
    const user = seeker && typeof seeker.userId === "object" ? seeker.userId : undefined;
    const placement = placementByApp.get(a._id);
    return {
      applicationId: a._id,
      candidateName: user?.name ?? seeker?.fullName,
      avatar: user?.avatar,
      hiredAt: a.updatedAt ?? placement?.placedAt ?? a.appliedAt,
      placement: toPlacement(placement),
      check: toCheck(checkByApp.get(a._id)),
    };
  });
  for (const p of placements) {
    if (!p.applicationId || seen.has(String(p.applicationId))) continue;
    rows.push({
      applicationId: String(p.applicationId),
      candidateName: p.candidateName,
      hiredAt: p.placedAt ?? p.createdAt,
      placement: toPlacement(p),
      check: toCheck(checkByApp.get(String(p.applicationId))),
    });
  }
  return rows.sort((a, b) => String(b.hiredAt ?? "").localeCompare(String(a.hiredAt ?? "")));
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const jobHiresKeys = {
  all: ["job-hires"] as const,
  detail: (jobId: string) => [...jobHiresKeys.all, jobId] as const,
};

export function useJobHires(jobId: string | undefined) {
  const enabled = Boolean(jobId);
  const id = jobId ?? "";
  const results = useQueries({
    queries: [
      {
        queryKey: [...jobHiresKeys.detail(id), "applications"],
        queryFn: () => getJson<{ applications?: HiredApplicationRow[] }>(`/api/applications?jobId=${id}&status=hired&limit=50`),
        enabled,
        staleTime: 30 * 1000,
      },
      {
        queryKey: [...jobHiresKeys.detail(id), "placements"],
        queryFn: () => getJson<{ placements?: PlacementRow[] }>(`/api/placements?jobId=${id}&limit=50`),
        enabled,
        staleTime: 30 * 1000,
      },
      {
        queryKey: [...jobHiresKeys.detail(id), "checks"],
        queryFn: () => getJson<{ items?: CheckRow[] }>(`/api/employer/background-checks?jobId=${id}&limit=50`),
        enabled,
        staleTime: 30 * 1000,
      },
    ],
  });
  const [apps, placements, checks] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);
  const rows = isLoading
    ? []
    : composeHires(apps.data?.applications ?? [], placements.data?.placements ?? [], checks.data?.items ?? []);
  const refetch = () => Promise.all(results.map((r) => r.refetch()));
  return { rows, isLoading, isError, refetch };
}
