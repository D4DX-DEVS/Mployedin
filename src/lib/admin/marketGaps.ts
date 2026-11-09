/** Read side of the admin Market gaps tab: list with filters, KPIs, and one suggestion's detail. */
import mongoose from "mongoose";
import MarketSuggestion, { type IMarketSuggestion } from "@/models/MarketSuggestion";
import MarketGapSnapshot from "@/models/MarketGapSnapshot";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

import { GAP_KINDS, GAP_PRIORITIES, GAP_SORTS, GAP_STATUS_FILTERS } from "./marketGapsConstants";
export { GAP_KINDS, GAP_PRIORITIES, GAP_SORTS, GAP_STATUS_FILTERS };

export interface GapListQuery {
  kind?: (typeof GAP_KINDS)[number];
  status: (typeof GAP_STATUS_FILTERS)[number];
  priority?: (typeof GAP_PRIORITIES)[number];
  /** Super agent user id. */
  territory?: string;
  area?: string;
  search?: string;
  sort: (typeof GAP_SORTS)[number];
  page: number;
  pageSize: number;
}

function statusFilter(s: GapListQuery["status"]): Record<string, unknown> {
  if (s === "all") return {};
  if (s === "open") return { status: { $in: ["new", "assigned"] } };
  return { status: s };
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export async function listMarketGaps(q: GapListQuery) {
  const filter: Record<string, unknown> = { ...statusFilter(q.status) };
  if (q.kind) filter.kind = q.kind;
  if (q.priority) filter.priority = q.priority;
  if (q.territory) filter.saUserId = new mongoose.Types.ObjectId(q.territory);
  if (q.area) filter.areaId = new mongoose.Types.ObjectId(q.area);
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ role: re }, { areaName: re }, { "topSkills.skill": re }];
  }

  const sort: Record<string, 1 | -1> =
    q.sort === "wait" ? { medianWaitDays: -1, seekers: -1 } : q.sort === "recent" ? { firstSeenAt: -1 } : { seekers: -1 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [snapshot, total, rows, kpiRows, newThisWeek, territories, top] = await Promise.all([
    MarketGapSnapshot.findOne().sort({ generatedAt: -1 }).lean(),
    MarketSuggestion.countDocuments(filter),
    MarketSuggestion.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean<IMarketSuggestion[]>(),
    MarketSuggestion.aggregate([
      { $match: { status: { $in: ["new", "assigned"] } } },
      { $group: { _id: "$kind", n: { $sum: 1 }, seekers: { $sum: "$seekers" }, areas: { $addToSet: "$areaId" } } },
    ]),
    MarketSuggestion.countDocuments({ status: "new", firstSeenAt: { $gte: weekAgo } }),
    MarketSuggestion.aggregate([
      { $match: { saUserId: { $ne: null } } },
      { $group: { _id: "$saUserId", name: { $first: "$saName" } } },
      { $sort: { name: 1 } },
    ]),
    MarketSuggestion.find({ status: "new", kind: { $ne: "fix_data" } })
      .sort({ seekers: -1 })
      .limit(40)
      .lean<IMarketSuggestion[]>(),
  ]);

  const byKind = new Map(kpiRows.map((r) => [r._id as string, r]));
  const unplaced = (byKind.get("find_employers")?.seekers ?? 0) + (byKind.get("thin_supply")?.seekers ?? 0);
  const areaSet = new Set<string>();
  for (const k of ["find_employers", "thin_supply", "find_seekers"]) for (const a of byKind.get(k)?.areas ?? []) if (a) areaSet.add(String(a));

  const doFirst = top
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.seekers * (1 + b.medianWaitDays / 30) - a.seekers * (1 + a.medianWaitDays / 30))
    .slice(0, 5);
  const fix = await MarketSuggestion.findOne({ kind: "fix_data", status: "new" }).lean<IMarketSuggestion | null>();
  if (fix) doFirst.splice(Math.min(2, doFirst.length), 0, fix);

  return {
    snapshot: snapshot
      ? { generatedAt: snapshot.generatedAt, seekersConsidered: snapshot.seekersConsidered, noAreaCount: snapshot.noAreaCount, activeJobs: snapshot.activeJobs, areas: snapshot.areas }
      : null,
    kpis: {
      unplacedSeekers: unplaced,
      rolesWithNoJobs: byKind.get("find_employers")?.n ?? 0,
      areasAffected: areaSet.size,
      openSuggestions: kpiRows.reduce((s, r) => s + (r.n as number), 0),
      newThisWeek,
    },
    territories: territories.map((t) => ({ id: String(t._id), name: t.name as string })),
    doFirst: doFirst.slice(0, 5).map(toRow),
    data: rows.map(toRow),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export function toRow(s: IMarketSuggestion) {
  const t = s.trend ?? [];
  const prev = t.length >= 2 ? t[t.length - 2].seekers : null;
  return {
    id: String(s._id),
    kind: s.kind,
    areaId: s.areaId ? String(s.areaId) : null,
    areaName: s.areaName,
    saName: s.saName,
    role: s.role,
    seekers: s.seekers,
    jobs: s.jobs,
    priority: s.priority,
    topSkills: s.topSkills ?? [],
    medianWaitDays: s.medianWaitDays,
    status: s.status,
    seekersChange: prev === null ? null : s.seekers - prev,
  };
}

export async function getMarketGap(id: string) {
  const s = await MarketSuggestion.findById(id).lean<IMarketSuggestion | null>();
  if (!s) return null;
  const seekers = await JobSeeker.find({ _id: { $in: s.sampleSeekerIds } })
    .select("userId skills preferredRoles createdAt")
    .lean<{ _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; skills?: string[]; preferredRoles?: string[]; createdAt: Date }[]>();
  const users = await User.find({ _id: { $in: seekers.map((x) => x.userId) } })
    .select("name")
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
  const userIds = [...(s.history ?? []).map((h) => h.by).filter(Boolean)];
  const actors = await User.find({ _id: { $in: userIds } }).select("name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
  const actorName = new Map(actors.map((u) => [String(u._id), u.name]));
  return {
    ...toRow(s),
    trend: s.trend ?? [],
    firstSeenAt: s.firstSeenAt,
    assignedTo: s.assignedTo ? String(s.assignedTo) : null,
    saUserId: s.saUserId ? String(s.saUserId) : null,
    history: (s.history ?? []).map((h) => ({ at: h.at, action: h.action, note: h.note ?? "", by: h.by ? (actorName.get(String(h.by)) ?? "") : "" })),
    seekerSample: seekers.map((k) => ({
      id: String(k._id),
      name: nameOf.get(String(k.userId)) ?? "—",
      skills: (k.skills ?? []).slice(0, 4),
      waitDays: Math.max(0, Math.floor((Date.now() - new Date(k.createdAt).getTime()) / 86400000)),
    })),
  };
}
