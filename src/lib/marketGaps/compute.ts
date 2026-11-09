/**
 * Market gaps: where we hold job seekers we cannot place, and where jobs have
 * nobody to fill them. Pure — rows in, suggestions out — so it can be tested
 * without a database; `build.ts` loads the rows and stores the result.
 *
 * An "area" is the city a seeker or an employer is registered in
 * (`regionCityId`); a job takes its employer's area. "The same kind of work" is
 * `sharesRole`, the matcher the rest of the product already uses, so a gap here
 * means the same thing as "no match" does on a seeker's own page.
 */
import { roleKey, sharesRole } from "@/lib/matching/roleMatch";

export type GapKind = "find_employers" | "thin_supply" | "find_seekers" | "fix_data";
export type GapPriority = "high" | "medium" | "low";

export interface GapSeeker {
  id: string;
  areaId: string | null;
  roles: string[];
  skills: string[];
  createdAt: Date;
}

export interface GapJob {
  id: string;
  /** The employer's area; null when the employer has none. */
  areaId: string | null;
  remote: boolean;
  title: string;
  createdAt: Date;
}

export interface GapOptions {
  /** Fewest seekers that make a gap worth a suggestion. */
  minSeekers: number;
  /** Seekers per matching job at or above which supply counts as thin. */
  thinRatio: number;
  /** A job open this long with few candidates is worth a seeker campaign. */
  lonelyJobDays: number;
  /** "Few candidates": fewer matching seekers than this. */
  lonelyMax: number;
  /** Seekers with no area before a "fix data" suggestion appears. */
  minNoArea: number;
  now: Date;
}

export const DEFAULT_GAP_OPTIONS: Omit<GapOptions, "now"> = {
  minSeekers: 5,
  thinRatio: 5,
  lonelyJobDays: 14,
  lonelyMax: 3,
  minNoArea: 10,
};

export interface GapDraft {
  /** Stable across runs, so status survives a recompute. */
  key: string;
  kind: GapKind;
  areaId: string | null;
  roleKey: string;
  role: string;
  seekers: number;
  jobs: number;
  priority: GapPriority;
  topSkills: { skill: string; count: number }[];
  medianWaitDays: number;
  sampleSeekerIds: string[];
}

export interface GapResult {
  suggestions: GapDraft[];
  seekersConsidered: number;
  noAreaCount: number;
  noRoleCount: number;
}

const DAY = 24 * 3600 * 1000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function priorityFor(seekers: number): GapPriority {
  return seekers >= 25 ? "high" : seekers >= 10 ? "medium" : "low";
}

function topSkills(seekers: GapSeeker[], limit = 5): { skill: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of seekers) {
    for (const raw of new Set(s.skills.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([skill, count]) => ({ skill, count }));
}

/** The first of a seeker's wanted roles that names real work. */
function primaryRole(roles: string[]): { key: string; label: string } | null {
  for (const r of roles) {
    const key = roleKey(r);
    if (key) return { key, label: r.trim() };
  }
  return null;
}

function mostCommon(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function computeGaps(seekers: GapSeeker[], jobs: GapJob[], opts: GapOptions): GapResult {
  const out: GapDraft[] = [];
  let noArea = 0;
  let noRole = 0;

  const jobsByArea = new Map<string, GapJob[]>();
  const remoteJobs: GapJob[] = [];
  for (const j of jobs) {
    if (j.remote) remoteJobs.push(j);
    if (j.areaId) jobsByArea.set(j.areaId, [...(jobsByArea.get(j.areaId) ?? []), j]);
  }

  // Seekers grouped by (area, kind of work).
  const groups = new Map<string, { areaId: string; roleKey: string; labels: string[]; members: GapSeeker[] }>();
  const seekersByArea = new Map<string, GapSeeker[]>();
  for (const s of seekers) {
    if (!s.areaId) {
      noArea += 1;
      continue;
    }
    seekersByArea.set(s.areaId, [...(seekersByArea.get(s.areaId) ?? []), s]);
    const role = primaryRole(s.roles);
    if (!role) {
      noRole += 1;
      continue;
    }
    const key = `${s.areaId}|${role.key}`;
    const g = groups.get(key) ?? { areaId: s.areaId, roleKey: role.key, labels: [], members: [] };
    g.labels.push(role.label);
    g.members.push(s);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    if (g.members.length < opts.minSeekers) continue;
    const label = mostCommon(g.labels);
    const nearby = [...(jobsByArea.get(g.areaId) ?? []), ...remoteJobs.filter((j) => j.areaId !== g.areaId)];
    const matching = nearby.filter((j) => sharesRole(j.title, [label])).length;
    const n = g.members.length;
    let kind: GapKind | null = null;
    if (matching === 0) kind = "find_employers";
    else if (n / matching >= opts.thinRatio) kind = "thin_supply";
    if (!kind) continue;
    out.push({
      key: `${kind}|${g.areaId}|${g.roleKey}`,
      kind,
      areaId: g.areaId,
      roleKey: g.roleKey,
      role: label,
      seekers: n,
      jobs: matching,
      priority: priorityFor(n),
      topSkills: topSkills(g.members),
      medianWaitDays: median(g.members.map((m) => Math.max(0, Math.floor((opts.now.getTime() - m.createdAt.getTime()) / DAY)))),
      sampleSeekerIds: g.members.slice(0, 10).map((m) => m.id),
    });
  }

  // Jobs that have waited with almost nobody to fill them.
  const lonely = new Map<string, { areaId: string; roleKey: string; titles: string[] }>();
  for (const j of jobs) {
    if (!j.areaId) continue;
    if (opts.now.getTime() - j.createdAt.getTime() < opts.lonelyJobDays * DAY) continue;
    const key = roleKey(j.title);
    if (!key) continue;
    const k = `${j.areaId}|${key}`;
    const g = lonely.get(k) ?? { areaId: j.areaId, roleKey: key, titles: [] };
    g.titles.push(j.title.trim());
    lonely.set(k, g);
  }
  for (const g of lonely.values()) {
    const label = mostCommon(g.titles);
    const pool = seekersByArea.get(g.areaId) ?? [];
    const matches = pool.filter((s) => s.roles.length > 0 && sharesRole(label, s.roles));
    if (matches.length >= opts.lonelyMax) continue;
    out.push({
      key: `find_seekers|${g.areaId}|${g.roleKey}`,
      kind: "find_seekers",
      areaId: g.areaId,
      roleKey: g.roleKey,
      role: label,
      seekers: matches.length,
      jobs: g.titles.length,
      priority: g.titles.length >= 4 ? "high" : g.titles.length >= 2 ? "medium" : "low",
      topSkills: topSkills(matches),
      medianWaitDays: 0,
      sampleSeekerIds: matches.slice(0, 10).map((m) => m.id),
    });
  }

  if (noArea >= opts.minNoArea) {
    out.push({
      key: "fix_data|none|area",
      kind: "fix_data",
      areaId: null,
      roleKey: "area",
      role: "",
      seekers: noArea,
      jobs: 0,
      priority: noArea >= 100 ? "high" : "medium",
      topSkills: [],
      medianWaitDays: 0,
      sampleSeekerIds: seekers.filter((s) => !s.areaId).slice(0, 10).map((s) => s.id),
    });
  }

  out.sort((a, b) => b.seekers - a.seekers);
  return { suggestions: out, seekersConsidered: seekers.length, noAreaCount: noArea, noRoleCount: noRole };
}
