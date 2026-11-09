/**
 * Read side of AI usage for the admin report: totals, per-group tables and the
 * per-employer drill-down. Totals come from AiUsageMonthly (small rows kept
 * current with $inc); only the daily chart and the call log read AiUsageLog.
 */
import mongoose from "mongoose";
import AiUsageLog from "@/models/AiUsageLog";
import AiUsageMonthly, { type IAiUsageMonthly } from "@/models/AiUsageMonthly";
import Employer from "@/models/Employer";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Territory from "@/models/Territory";

import { type AiUsageGroup } from "./aiUsageConstants";
export { AI_USAGE_GROUPS, MONTH_RE, type AiUsageGroup } from "./aiUsageConstants";

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** [start, end) of a UTC month. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

type Row = Pick<
  IAiUsageMonthly,
  | "refId"
  | "role"
  | "feature"
  | "calls"
  | "failed"
  | "cacheHits"
  | "unpriced"
  | "inputTokens"
  | "outputTokens"
  | "costUsd"
  | "behalfCalls"
  | "behalfCostUsd"
  | "employerIds"
>;

interface Agg {
  id: string;
  calls: number;
  tokens: number;
  costUsd: number;
  behalfCostUsd: number;
  behalfCalls: number;
  employers: Set<string>;
  byFeature: Map<string, number>;
}

function aggregate(rows: Row[]): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const r of rows) {
    const id = String(r.refId);
    const a =
      out.get(id) ??
      ({ id, calls: 0, tokens: 0, costUsd: 0, behalfCostUsd: 0, behalfCalls: 0, employers: new Set(), byFeature: new Map() } as Agg);
    a.calls += r.calls;
    a.tokens += r.inputTokens + r.outputTokens;
    a.costUsd += r.costUsd;
    a.behalfCostUsd += r.behalfCostUsd ?? 0;
    a.behalfCalls += r.behalfCalls ?? 0;
    for (const e of r.employerIds ?? []) a.employers.add(String(e));
    a.byFeature.set(r.feature, (a.byFeature.get(r.feature) ?? 0) + r.costUsd);
    out.set(id, a);
  }
  return out;
}

function mix(a: Agg): { feature: string; share: number }[] {
  const total = a.costUsd || 1;
  return [...a.byFeature.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([feature, cost]) => ({ feature, share: Math.round((cost / total) * 100) }));
}

const ROLE_OF: Record<Exclude<AiUsageGroup, "employer">, string> = {
  super_agent: "super_agent",
  agent: "agent",
  jobseeker: "job_seeker",
};

export interface UsageQuery {
  month: string;
  group: AiUsageGroup;
  search?: string;
  page: number;
  pageSize: number;
}

export async function getUsageSummary(q: UsageQuery) {
  const prev = previousMonth(q.month);
  const { from, to } = monthRange(q.month);

  const [rows, prevRows, totals, daily, featureRows] = await Promise.all([
    q.group === "employer"
      ? AiUsageMonthly.find({ month: q.month, scope: "employer" }).lean<Row[]>()
      : AiUsageMonthly.find({ month: q.month, scope: "user", role: ROLE_OF[q.group] }).lean<Row[]>(),
    q.group === "employer"
      ? AiUsageMonthly.find({ month: prev, scope: "employer" }).select("refId costUsd feature").lean<Row[]>()
      : AiUsageMonthly.find({ month: prev, scope: "user", role: ROLE_OF[q.group] })
          .select("refId costUsd feature")
          .lean<Row[]>(),
    AiUsageLog.aggregate([
      { $match: { at: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: null,
          calls: { $sum: 1 },
          failed: { $sum: { $cond: ["$ok", 0, 1] } },
          cacheHits: { $sum: { $cond: ["$cacheHit", 1, 0] } },
          unpriced: { $sum: { $cond: ["$priced", 0, 1] } },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          costUsd: { $sum: "$costUsd" },
        },
      },
    ]),
    AiUsageLog.aggregate([
      { $match: { at: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, feature: "$feature" },
          costUsd: { $sum: "$costUsd" },
        },
      },
    ]),
    AiUsageLog.aggregate([
      { $match: { at: { $gte: from, $lt: to } } },
      { $group: { _id: "$feature", costUsd: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
      { $sort: { costUsd: -1 } },
    ]),
  ]);
  const prevTotal = await AiUsageLog.aggregate([
    { $match: { at: { $gte: monthRange(prev).from, $lt: monthRange(prev).to } } },
    { $group: { _id: null, costUsd: { $sum: "$costUsd" } } },
  ]);

  // Group tab totals (one cheap query per tab so each tab can show its spend).
  const tabTotals = await AiUsageMonthly.aggregate([
    { $match: { month: q.month } },
    {
      $group: {
        _id: { scope: "$scope", role: "$role" },
        costUsd: { $sum: "$costUsd" },
      },
    },
  ]);
  const tabCost = (scope: string, role?: string) =>
    tabTotals.filter((t) => t._id.scope === scope && (role === undefined || t._id.role === role)).reduce((s, t) => s + t.costUsd, 0);

  const aggs = aggregate(rows);
  const prevAggs = aggregate(prevRows);

  // Names
  const ids = [...aggs.keys()];
  const names = new Map<string, { name: string; sub?: string }>();
  if (q.group === "employer") {
    const emps = await Employer.find({ _id: { $in: ids } }).select("companyName city").lean<{ _id: unknown; companyName: string; city?: string }[]>();
    for (const e of emps) names.set(String(e._id), { name: e.companyName, sub: e.city });
  } else {
    const users = await User.find({ _id: { $in: ids } }).select("name email").lean<{ _id: unknown; name: string; email: string }[]>();
    for (const u of users) names.set(String(u._id), { name: u.name, sub: u.email });
    if (q.group === "agent") {
      const agents = await Agent.find({ userId: { $in: ids } }).select("userId superAgentId").lean<{ userId: unknown; superAgentId?: unknown }[]>();
      const saIds = agents.map((a) => a.superAgentId).filter(Boolean);
      const sas = await SuperAgent.find({ _id: { $in: saIds } }).select("userId").lean<{ _id: unknown; userId: unknown }[]>();
      const saUsers = await User.find({ _id: { $in: sas.map((s) => s.userId) } }).select("name").lean<{ _id: unknown; name: string }[]>();
      const saName = new Map(saUsers.map((u) => [String(u._id), u.name]));
      const saUser = new Map(sas.map((s) => [String(s._id), String(s.userId)]));
      for (const a of agents) {
        const cur = names.get(String(a.userId));
        const sa = a.superAgentId ? saName.get(saUser.get(String(a.superAgentId)) ?? "") : undefined;
        if (cur) cur.sub = sa ? `Super agent: ${sa}` : cur.sub;
      }
    } else if (q.group === "super_agent") {
      const terr = await Territory.find({ superAgentId: { $in: ids } }).select("name superAgentId").lean<{ name: string; superAgentId: unknown }[]>();
      for (const t of terr) {
        const cur = names.get(String(t.superAgentId));
        if (cur) cur.sub = t.name;
      }
    }
  }

  let list = [...aggs.values()].map((a) => {
    const n = names.get(a.id);
    const prevCost = prevAggs.get(a.id)?.costUsd ?? 0;
    return {
      id: a.id,
      name: n?.name ?? "Unknown",
      sub: n?.sub ?? "",
      calls: a.calls,
      tokens: a.tokens,
      costUsd: a.costUsd,
      prevCostUsd: prevCost,
      mix: mix(a),
      behalfCostUsd: a.behalfCostUsd,
      ownCostUsd: Math.max(0, a.costUsd - a.behalfCostUsd),
      employerCount: a.employers.size,
    };
  });
  if (q.search) {
    const s = q.search.toLowerCase();
    list = list.filter((r) => r.name.toLowerCase().includes(s) || r.sub.toLowerCase().includes(s));
  }
  list.sort((a, b) => b.costUsd - a.costUsd);
  const total = list.length;
  const groupTotal = list.reduce((s, r) => s + r.costUsd, 0) || 1;
  const pageRows = list
    .slice((q.page - 1) * q.pageSize, q.page * q.pageSize)
    .map((r) => ({ ...r, share: Math.round((r.costUsd / groupTotal) * 100) }));

  // Seeker tab is by feature, not by person.
  const seekerFeatures =
    q.group === "jobseeker"
      ? [...new Set(rows.map((r) => r.feature))].map((feature) => {
          const fr = rows.filter((r) => r.feature === feature);
          return {
            feature,
            users: new Set(fr.map((r) => String(r.refId))).size,
            calls: fr.reduce((s, r) => s + r.calls, 0),
            costUsd: fr.reduce((s, r) => s + r.costUsd, 0),
          };
        }).sort((a, b) => b.costUsd - a.costUsd)
      : [];

  const t = totals[0] ?? { calls: 0, failed: 0, cacheHits: 0, unpriced: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return {
    month: q.month,
    kpis: {
      costUsd: t.costUsd,
      prevCostUsd: prevTotal[0]?.costUsd ?? 0,
      calls: t.calls,
      failed: t.failed,
      cacheHits: t.cacheHits,
      unpriced: t.unpriced,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
    },
    tabs: {
      employer: tabCost("employer"),
      super_agent: tabCost("user", "super_agent"),
      agent: tabCost("user", "agent"),
      jobseeker: tabCost("user", "job_seeker"),
    },
    features: featureRows.map((f) => ({ feature: f._id as string, costUsd: f.costUsd as number, calls: f.calls as number })),
    daily: daily.map((d) => ({ day: d._id.day as string, feature: d._id.feature as string, costUsd: d.costUsd as number })),
    rows: pageRows,
    seekerFeatures,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getEmployerUsage(employerId: string, month: string) {
  const id = new mongoose.Types.ObjectId(employerId);
  const { from, to } = monthRange(month);
  const prev = previousMonth(month);
  const [emp, rows, prevRows, byUser] = await Promise.all([
    Employer.findById(id).select("companyName city").lean<{ companyName: string; city?: string } | null>(),
    AiUsageMonthly.find({ month, scope: "employer", refId: id }).lean<Row[]>(),
    AiUsageMonthly.find({ month: prev, scope: "employer", refId: id }).select("costUsd").lean<Row[]>(),
    AiUsageLog.aggregate([
      { $match: { employerId: id, at: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { userId: "$userId", onBehalf: "$onBehalf", role: "$role" },
          calls: { $sum: 1 },
          costUsd: { $sum: "$costUsd" },
        },
      },
      { $sort: { costUsd: -1 } },
    ]),
  ]);
  if (!emp) return null;
  const users = await User.find({ _id: { $in: byUser.map((u) => u._id.userId).filter(Boolean) } })
    .select("name")
    .lean<{ _id: unknown; name: string }[]>();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
  const sum = (k: "calls" | "failed" | "inputTokens" | "outputTokens" | "costUsd") => rows.reduce((s, r) => s + r[k], 0);
  return {
    employer: { id: employerId, name: emp.companyName, city: emp.city ?? "" },
    month,
    kpis: {
      costUsd: sum("costUsd"),
      prevCostUsd: prevRows.reduce((s, r) => s + r.costUsd, 0),
      calls: sum("calls"),
      failed: sum("failed"),
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
    },
    features: rows.map((r) => ({ feature: r.feature, calls: r.calls, costUsd: r.costUsd })).sort((a, b) => b.costUsd - a.costUsd),
    people: byUser.map((u) => ({
      userId: u._id.userId ? String(u._id.userId) : null,
      name: u._id.userId ? (nameOf.get(String(u._id.userId)) ?? "Unknown") : "System",
      role: u._id.role as string,
      onBehalf: Boolean(u._id.onBehalf),
      calls: u.calls as number,
      costUsd: u.costUsd as number,
    })),
  };
}

export interface CallLogQuery {
  employerId?: string;
  userId?: string;
  month: string;
  feature?: string;
  ok?: boolean;
  page: number;
  pageSize: number;
}

export async function getCallLog(q: CallLogQuery) {
  const { from, to } = monthRange(q.month);
  const filter: Record<string, unknown> = { at: { $gte: from, $lt: to } };
  if (q.employerId) filter.employerId = new mongoose.Types.ObjectId(q.employerId);
  if (q.userId) filter.userId = new mongoose.Types.ObjectId(q.userId);
  if (q.feature) filter.feature = q.feature;
  if (q.ok !== undefined) filter.ok = q.ok;
  const [items, total] = await Promise.all([
    AiUsageLog.find(filter)
      .sort({ at: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean<Array<Record<string, unknown>>>(),
    AiUsageLog.countDocuments(filter),
  ]);
  const users = await User.find({ _id: { $in: items.map((i) => i.userId).filter(Boolean) } })
    .select("name")
    .lean<{ _id: unknown; name: string }[]>();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
  return {
    data: items.map((i) => ({
      id: String(i._id),
      at: i.at as Date,
      user: i.userId ? (nameOf.get(String(i.userId)) ?? "Unknown") : "System",
      role: i.role as string,
      onBehalf: Boolean(i.onBehalf),
      feature: i.feature as string,
      model: i.modelId as string,
      inputTokens: i.inputTokens as number,
      outputTokens: i.outputTokens as number,
      costUsd: i.costUsd as number,
      priced: i.priced as boolean,
      cacheHit: i.cacheHit as boolean,
      ok: i.ok as boolean,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
