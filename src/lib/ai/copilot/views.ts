/**
 * Copilot "views": the rows a read tool returned, shaped for the chat panel to
 * draw as cards instead of the model retyping them as a markdown table. The
 * route streams one as a `view` frame next to the tool result; the model is
 * told the user can see it and keeps its own reply short.
 *
 * Every presenter reads the exact rows its tool's `execute` returns (see
 * src/lib/ai/copilot/tools/*). A tool without a presenter, or a result with
 * nothing in it, gets no view: the model explains an empty answer better than
 * an empty card does.
 */

/** Cards drawn per view; the rest are counted in `more`. */
export const VIEW_ROW_LIMIT = 6;

export interface JobCard {
  jobId: string;
  title: string;
  company?: string;
  location: string;
  salary?: string;
  matchScore?: number;
  strongMatch?: boolean;
  /** Matched skills for recommended_jobs, the job's skills for search_jobs. */
  skills: string[];
  alreadyApplied: boolean;
  url: string;
}

export interface CandidateRow {
  /** Application id. */
  id: string;
  name: string;
  job?: string;
  status: string;
  matchScore?: number;
  experienceYears?: number;
  skills: string[];
}

export interface ApplicationRow {
  title: string;
  status: string;
  /** ISO date, or undefined when the stored date is unusable. */
  appliedAt?: string;
  matchScore?: number;
}

/** A ranked job seeker from find_candidates. Every row is kept: the card exports them all. */
export interface TalentRow {
  seekerId: string;
  name: string;
  title?: string;
  location?: string;
  nationality?: string;
  experienceYears?: number;
  skills: string[];
  hasCV: boolean;
  fit: number;
  locationFit?: "current" | "worked" | "prefers";
  experienceFit?: "meets" | "below" | "above" | "unknown";
}

/** One number. `status` is a pipeline or lead status; `metric` a fixed label. */
export type StatTile = { status: string; value: number } | { metric: "total" | "overdue"; value: number };

export type CopilotView =
  | { kind: "jobs"; jobs: JobCard[]; more: number }
  | { kind: "candidates"; candidates: CandidateRow[]; more: number }
  | { kind: "talent"; talent: TalentRow[]; totalMatched: number; relaxed: boolean; brief: string }
  | { kind: "applications"; applications: ApplicationRow[]; more: number }
  | { kind: "stats"; tiles: StatTile[]; rows: Array<{ label: string; value: number }> };

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => Boolean(r) && typeof r === "object") : []);

function isoDate(v: unknown): string | undefined {
  if (!(v instanceof Date) && typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function limited<T>(items: T[]): { shown: T[]; more: number } {
  return { shown: items.slice(0, VIEW_ROW_LIMIT), more: Math.max(0, items.length - VIEW_ROW_LIMIT) };
}

function jobsView(rows: Row[]): CopilotView | null {
  if (!rows.length) return null;
  const { shown, more } = limited(rows);
  return {
    kind: "jobs",
    jobs: shown.map((r) => ({
      jobId: String(r.jobId ?? ""),
      title: str(r.title) ?? "",
      company: str(r.company),
      location: str(r.location) ?? "",
      salary: str(r.salary),
      matchScore: num(r.matchScore),
      strongMatch: typeof r.strongMatch === "boolean" ? r.strongMatch : undefined,
      skills: strings(r.matchedSkills ?? r.skills),
      alreadyApplied: r.alreadyApplied === true,
      url: str(r.url) ?? "",
    })),
    more,
  };
}

function candidatesView(rows: Row[]): CopilotView | null {
  if (!rows.length) return null;
  const { shown, more } = limited(rows);
  return {
    kind: "candidates",
    candidates: shown.map((r) => ({
      id: String(r.applicationId ?? ""),
      name: str(r.candidate) ?? "",
      job: str(r.job),
      status: str(r.status) ?? "",
      matchScore: num(r.matchScore),
      experienceYears: num(r.experienceYears),
      skills: strings(r.skills),
    })),
    more,
  };
}

const LOCATION_FITS = ["current", "worked", "prefers"] as const;
const EXPERIENCE_FITS = ["meets", "below", "above", "unknown"] as const;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

/** "electrical engineer · Kuwait · 2+ yrs": the brief as the export's file title. */
function briefLabel(brief: unknown): string {
  const b = (brief && typeof brief === "object" ? brief : {}) as Row;
  const years = num(b.minYears);
  return [str(b.role), ...strings(b.skills), str(b.location), years !== undefined ? `${years}+ yrs` : undefined]
    .filter(Boolean)
    .join(" · ");
}

function talentView(data: Row): CopilotView | null {
  const rows = rowsOf(data.candidates);
  if (!rows.length) return null;
  return {
    kind: "talent",
    talent: rows.map((r) => ({
      seekerId: String(r.seekerId ?? ""),
      name: str(r.name) ?? "",
      title: str(r.title),
      location: str(r.location),
      nationality: str(r.nationality),
      experienceYears: num(r.experienceYears),
      skills: strings(r.matchedSkills).length ? strings(r.matchedSkills) : strings(r.skills),
      hasCV: r.hasCV === true,
      fit: num(r.fit) ?? 0,
      locationFit: oneOf(LOCATION_FITS, r.locationFit),
      experienceFit: oneOf(EXPERIENCE_FITS, r.experienceFit),
    })),
    totalMatched: num(data.totalMatched) ?? rows.length,
    relaxed: data.relaxed === true,
    brief: briefLabel(data.brief),
  };
}

function applicationsView(rows: Row[]): CopilotView | null {
  if (!rows.length) return null;
  const { shown, more } = limited(rows);
  return {
    kind: "applications",
    applications: shown.map((r) => ({
      title: str(r.title) ?? "",
      status: str(r.status) ?? "",
      appliedAt: isoDate(r.appliedAt),
      matchScore: num(r.matchScore),
    })),
    more,
  };
}

function statusTiles(counts: unknown): StatTile[] {
  if (!counts || typeof counts !== "object") return [];
  return Object.entries(counts as Record<string, unknown>)
    .filter(([, v]) => num(v) !== undefined)
    .map(([status, v]) => ({ status, value: v as number }));
}

function pipelineView(data: Row): CopilotView | null {
  const tiles = statusTiles(data.byStage);
  const rows = rowsOf(data.byJob)
    .map((j) => ({ label: str(j.title) ?? "", value: num(j.applicants) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  return tiles.length || rows.length ? { kind: "stats", tiles, rows } : null;
}

function leadStatsView(data: Row): CopilotView | null {
  const total = num(data.total);
  if (total === undefined) return null;
  return {
    kind: "stats",
    tiles: [
      { metric: "total", value: total },
      { metric: "overdue", value: num(data.overdueFollowUps) ?? 0 },
      ...statusTiles(data.byStatus),
    ],
    rows: [],
  };
}

const PRESENTERS: Record<string, (data: unknown) => CopilotView | null> = {
  recommended_jobs: (data) => jobsView(rowsOf((data as Row | null)?.jobs)),
  search_jobs: (data) => jobsView(rowsOf(data)),
  search_candidates: (data) => candidatesView(rowsOf(data)),
  find_candidates: (data) => (data && typeof data === "object" ? talentView(data as Row) : null),
  my_applications: (data) => applicationsView(rowsOf(data)),
  pipeline_stats: (data) => (data && typeof data === "object" ? pipelineView(data as Row) : null),
  lead_stats: (data) => (data && typeof data === "object" ? leadStatsView(data as Row) : null),
};

/** The view for a successful read tool's `data`, or null to leave it to the model. */
export function presentToolResult(tool: string, data: unknown): CopilotView | null {
  return PRESENTERS[tool]?.(data) ?? null;
}
