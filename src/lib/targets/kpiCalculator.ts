/**
 * The three performance pillars of agent targets
 * (docs/plans/2026-11-18-target-management-v2.md, owner rules of 2026-11-18):
 *
 *  1. Jobs acquired — a job counts once, in the month of its first publish
 *     (`Job.firstPublishedAt`), for the agent frozen on it then
 *     (`Job.acquiredByAgentId`). Drafts and deleted jobs never count.
 *  2. Onboarded — Hired is Onboarded (no separate status). A hired application
 *     counts once its job is closed, in the month of the later of the hire and
 *     the close. Credited to the job's acquiring agent (else its current agent).
 *  3. Invoiced revenue — invoice lines linked to a hire (`lineItems[].placementId`),
 *     dated by the invoice issue date, valued at the invoice total minus tax: the
 *     line after the invoice discount plus its share of the service charge. A
 *     partial refund scales it down. Draft, pending-approval, void, cancelled,
 *     refunded and credit-note invoices never count. Credited to the invoice's
 *     agent (else the hire's agent). Only the profile's currency counts toward the
 *     target; other currencies are reported beside it, never converted.
 *
 * A super agent never owns employers (owner, 2026-11-18): their figures are
 * their team's (`Agent.superAgentId`, explicit assignment only), each item
 * counted once. Commission totals come from the invoices' commission lines —
 * the agent's own lines, or the super agent's override lines.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Invoice from "@/models/Invoice";
import Placement from "@/models/Placement";
import type { PeriodBounds } from "./schedule";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type KpiRole = "agent" | "super_agent";

export interface KpiSource {
  /** User id, as on TargetProfile.assigneeId. */
  userId: string;
  role: KpiRole;
  currency: string;
  /** The profile's schedule, when figures per period are wanted. */
  periods?: PeriodBounds[];
}

export interface KpiCounts {
  jobs: number;
  onboarded: number;
  /** Invoiced revenue in the profile's currency. */
  revenue: number;
}

export interface KpiMonth extends KpiCounts {
  month: number;
}

export type KpiPeriod = PeriodBounds & KpiCounts;

export type CommissionStatusKey = "pending" | "approved" | "paid" | "disputed";

export interface OwnerKpi {
  months: KpiMonth[];
  periods: KpiPeriod[];
  totals: KpiCounts;
  /** Revenue in other currencies, never converted or added to `totals.revenue`. */
  otherCurrencies: { currency: string; revenue: number }[];
  /** The owner's own commission lines in the profile's currency, by status. */
  commission: Record<CommissionStatusKey, number>;
  /** Per team agent (super agents only), keyed by Agent id. */
  byAgent: Map<string, KpiCounts>;
}

/** One dated, credited item. `agentId` is the Agent doc id. */
export interface KpiEvent {
  kind: "jobs" | "onboarded" | "revenue";
  agentId: string;
  /** UTC day `YYYY-MM-DD`. */
  day: string;
  amount: number;
  currency?: string;
}

interface OwnerScope {
  key: string;
  role: KpiRole;
  currency: string;
  agentIds: Set<string>;
  periods?: PeriodBounds[];
}

const DEFAULT_CURRENCY = "AED";
const REVENUE_STATUSES = ["issued", "sent", "paid", "partially_paid", "overdue"];
const round2 = (value: number) => Math.round(value * 100) / 100;

export const kpiOwnerKey = (role: KpiRole, userId: string) => `${role}:${userId}`;

const toDay = (date: Date) => date.toISOString().slice(0, 10);
const toObjectIds = (ids: Iterable<string>) => [...ids].map((id) => new mongoose.Types.ObjectId(id));

function yearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
}

/* ------------------------------------------------------------------ */
/*  Pure parts                                                         */
/* ------------------------------------------------------------------ */

const emptyCounts = (): KpiCounts => ({ jobs: 0, onboarded: 0, revenue: 0 });

import { lineRevenue } from "./lineRevenue";
export { lineRevenue };

/** The month a hire counts in: the later of the hire and the job's close. */
export function onboardedDate(hiredAt: Date | null | undefined, closedAt: Date | null | undefined): Date | null {
  if (!hiredAt || !closedAt) return null;
  return hiredAt.getTime() >= closedAt.getTime() ? hiredAt : closedAt;
}

/** The latest time an application entered `hired`, else its last update. */
export function hiredAtOf(app: { statusHistory?: { status: string; changedAt?: Date }[]; updatedAt?: Date }): Date | null {
  const entries = (app.statusHistory ?? []).filter((h) => h.status === "hired" && h.changedAt);
  if (entries.length) {
    return entries.reduce((latest, h) => (h.changedAt! > latest ? h.changedAt! : latest), entries[0].changedAt!);
  }
  return app.updatedAt ?? null;
}

/** Add events to an owner's months, periods, totals and per-agent figures. */
export function bucketKpiEvents(owner: OwnerScope, events: KpiEvent[], year: number): Omit<OwnerKpi, "commission"> {
  const months: KpiMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...emptyCounts() }));
  const periods: KpiPeriod[] = (owner.periods ?? []).map((p) => ({ startDate: p.startDate, endDate: p.endDate, ...emptyCounts() }));
  const totals = emptyCounts();
  const other = new Map<string, number>();
  const byAgent = new Map<string, KpiCounts>();
  const yearPrefix = String(year);

  for (const event of events) {
    if (!owner.agentIds.has(event.agentId) || !event.day.startsWith(yearPrefix)) continue;
    if (event.kind === "revenue" && (event.currency || DEFAULT_CURRENCY) !== owner.currency) {
      const cur = event.currency || DEFAULT_CURRENCY;
      other.set(cur, round2((other.get(cur) ?? 0) + event.amount));
      continue;
    }
    const month = Number(event.day.slice(5, 7));
    const add = (counts: KpiCounts) => {
      counts[event.kind] = round2(counts[event.kind] + event.amount);
    };
    add(months[month - 1]);
    add(totals);
    for (const period of periods) {
      if (event.day >= period.startDate && event.day <= period.endDate) add(period);
    }
    if (owner.role === "super_agent") {
      const counts = byAgent.get(event.agentId) ?? emptyCounts();
      add(counts);
      byAgent.set(event.agentId, counts);
    }
  }

  return {
    months,
    periods,
    totals,
    otherCurrencies: [...other.entries()].map(([currency, revenue]) => ({ currency, revenue })).sort((a, b) => b.revenue - a.revenue),
    byAgent,
  };
}

/* ------------------------------------------------------------------ */
/*  Loading                                                            */
/* ------------------------------------------------------------------ */

type Lean<T> = T & { _id: mongoose.Types.ObjectId };

async function loadJobEvents(agentIds: string[], year: number): Promise<KpiEvent[]> {
  const { start, end } = yearRange(year);
  const jobs = (await Job.find({
    acquiredByAgentId: { $in: toObjectIds(agentIds) },
    firstPublishedAt: { $gte: start, $lte: end },
    deletedAt: null,
  })
    .select("acquiredByAgentId firstPublishedAt")
    .lean()) as Lean<{ acquiredByAgentId: mongoose.Types.ObjectId; firstPublishedAt: Date }>[];
  return jobs.map((j) => ({ kind: "jobs", agentId: String(j.acquiredByAgentId), day: toDay(j.firstPublishedAt), amount: 1 }));
}

async function loadOnboardedEvents(agentIds: string[], year: number): Promise<KpiEvent[]> {
  const ids = toObjectIds(agentIds);
  const jobs = (await Job.find({
    status: "closed",
    deletedAt: null,
    $or: [{ acquiredByAgentId: { $in: ids } }, { acquiredByAgentId: { $exists: false }, agentId: { $in: ids } }],
  })
    .select("acquiredByAgentId agentId closedAt updatedAt")
    .lean()) as Lean<{ acquiredByAgentId?: mongoose.Types.ObjectId; agentId?: mongoose.Types.ObjectId; closedAt?: Date; updatedAt?: Date }>[];
  if (!jobs.length) return [];

  const jobInfo = new Map(
    jobs.map((j) => [String(j._id), { agentId: String(j.acquiredByAgentId ?? j.agentId), closedAt: j.closedAt ?? j.updatedAt ?? null }]),
  );
  const apps = (await Application.find({ jobId: { $in: jobs.map((j) => j._id) }, status: "hired" })
    .select("jobId statusHistory updatedAt")
    .lean()) as Lean<{ jobId: mongoose.Types.ObjectId; statusHistory?: { status: string; changedAt?: Date }[]; updatedAt?: Date }>[];

  const events: KpiEvent[] = [];
  for (const app of apps) {
    const info = jobInfo.get(String(app.jobId));
    if (!info) continue;
    const date = onboardedDate(hiredAtOf(app), info.closedAt);
    if (date && date.getUTCFullYear() === year) events.push({ kind: "onboarded", agentId: info.agentId, day: toDay(date), amount: 1 });
  }
  return events;
}

interface RevenueInvoice {
  _id: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  issuedAt?: Date;
  createdAt?: Date;
  currency?: string;
  subtotal?: number;
  discountPercent?: number;
  serviceCharge?: number;
  totalAmount?: number;
  refundedAmount?: number;
  lineItems?: { amount: number; placementId?: mongoose.Types.ObjectId }[];
  commissions?: { role: "agent" | "super_agent"; agentId?: mongoose.Types.ObjectId; superAgentId?: mongoose.Types.ObjectId; amount: number; status: CommissionStatusKey }[];
}

async function loadRevenueInvoices(agentIds: string[], saIds: string[], year: number): Promise<RevenueInvoice[]> {
  const { start, end } = yearRange(year);
  const agentOids = toObjectIds(agentIds);
  // Lines may credit an agent through their hire even when the invoice names none.
  const placementIds = agentOids.length
    ? (await Placement.find({ agentId: { $in: agentOids } }).select("_id").lean()).map((p) => p._id)
    : [];
  const or: Record<string, unknown>[] = [];
  if (agentOids.length) or.push({ agentId: { $in: agentOids } });
  if (placementIds.length) or.push({ "lineItems.placementId": { $in: placementIds } });
  if (saIds.length) or.push({ "commissions.superAgentId": { $in: toObjectIds(saIds) } });
  if (!or.length) return [];
  return (await Invoice.find({
    status: { $in: REVENUE_STATUSES },
    $and: [{ $or: or }, { $or: [{ issuedAt: { $gte: start, $lte: end } }, { issuedAt: null, createdAt: { $gte: start, $lte: end } }] }],
  })
    .select("agentId issuedAt createdAt currency subtotal discountPercent serviceCharge totalAmount refundedAmount lineItems commissions")
    .lean()) as RevenueInvoice[];
}

async function revenueEvents(invoices: RevenueInvoice[]): Promise<KpiEvent[]> {
  const linkedIds = invoices.flatMap((inv) => (inv.lineItems ?? []).flatMap((li) => (li.placementId ? [li.placementId] : [])));
  const placementAgent = new Map(
    linkedIds.length
      ? ((await Placement.find({ _id: { $in: linkedIds } }).select("agentId").lean()) as Lean<{ agentId?: mongoose.Types.ObjectId }>[]).map((p) => [
          String(p._id),
          p.agentId ? String(p.agentId) : null,
        ])
      : [],
  );
  const events: KpiEvent[] = [];
  for (const inv of invoices) {
    const day = toDay(inv.issuedAt ?? inv.createdAt ?? new Date(0));
    for (const line of inv.lineItems ?? []) {
      if (!line.placementId) continue;
      const agentId = inv.agentId ? String(inv.agentId) : placementAgent.get(String(line.placementId)) ?? null;
      if (!agentId) continue;
      const amount = lineRevenue({
        lineAmount: line.amount,
        subtotal: inv.subtotal ?? 0,
        discountPercent: inv.discountPercent,
        serviceCharge: inv.serviceCharge,
        totalAmount: inv.totalAmount,
        refundedAmount: inv.refundedAmount,
      });
      if (amount > 0) events.push({ kind: "revenue", agentId, day, amount, currency: inv.currency || DEFAULT_CURRENCY });
    }
  }
  return events;
}

function commissionFor(owner: OwnerScope, saId: string | undefined, invoices: RevenueInvoice[]): Record<CommissionStatusKey, number> {
  const out: Record<CommissionStatusKey, number> = { pending: 0, approved: 0, paid: 0, disputed: 0 };
  for (const inv of invoices) {
    if ((inv.currency || DEFAULT_CURRENCY) !== owner.currency) continue;
    for (const line of inv.commissions ?? []) {
      const mine =
        owner.role === "agent"
          ? line.role === "agent" && line.agentId && owner.agentIds.has(String(line.agentId))
          : line.role === "super_agent" && saId && String(line.superAgentId) === saId;
      if (mine && line.status in out) out[line.status] = round2(out[line.status] + (line.amount || 0));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export async function calculateKpis(sources: KpiSource[], year: number): Promise<Map<string, OwnerKpi>> {
  if (sources.length === 0) return new Map();
  await connectDB();

  const agentUserIds = [...new Set(sources.filter((s) => s.role === "agent").map((s) => s.userId))];
  const saUserIds = [...new Set(sources.filter((s) => s.role === "super_agent").map((s) => s.userId))];
  const [ownAgents, superAgents] = await Promise.all([
    agentUserIds.length ? Agent.find({ userId: { $in: agentUserIds } }).select("_id userId").lean() : [],
    saUserIds.length ? SuperAgent.find({ userId: { $in: saUserIds } }).select("_id userId").lean() : [],
  ]);
  // A super agent's team is who points at them (Agent.superAgentId), as in profitCalculator.
  const teamAgents = superAgents.length
    ? await Agent.find({ superAgentId: { $in: superAgents.map((sa) => sa._id) } }).select("_id superAgentId").lean()
    : [];
  const agentByUser = new Map(ownAgents.map((a) => [String(a.userId), String(a._id)]));
  const saByUser = new Map(superAgents.map((sa) => [String(sa.userId), String(sa._id)]));
  const teamBySa = new Map<string, Set<string>>();
  for (const agent of teamAgents) {
    const set = teamBySa.get(String(agent.superAgentId)) ?? new Set<string>();
    set.add(String(agent._id));
    teamBySa.set(String(agent.superAgentId), set);
  }

  const owners = sources.map((source) => {
    const saId = source.role === "super_agent" ? saByUser.get(source.userId) : undefined;
    const agentIds =
      source.role === "agent"
        ? new Set(agentByUser.get(source.userId) ? [agentByUser.get(source.userId)!] : [])
        : new Set(saId ? teamBySa.get(saId) ?? [] : []);
    const scope: OwnerScope = {
      key: kpiOwnerKey(source.role, source.userId),
      role: source.role,
      currency: source.currency || DEFAULT_CURRENCY,
      agentIds,
      periods: source.periods,
    };
    return { scope, saId };
  });

  const allAgentIds = [...new Set(owners.flatMap((o) => [...o.scope.agentIds]))];
  const allSaIds = [...new Set(owners.flatMap((o) => (o.saId ? [o.saId] : [])))];
  const [jobs, onboarded, invoices] = await Promise.all([
    allAgentIds.length ? loadJobEvents(allAgentIds, year) : [],
    allAgentIds.length ? loadOnboardedEvents(allAgentIds, year) : [],
    loadRevenueInvoices(allAgentIds, allSaIds, year),
  ]);
  const events = [...jobs, ...onboarded, ...(await revenueEvents(invoices))];

  return new Map(
    owners.map(({ scope, saId }) => [
      scope.key,
      { ...bucketKpiEvents(scope, events, year), commission: commissionFor(scope, saId, invoices) },
    ]),
  );
}

// Pure, so client pages can import it without pulling Mongoose into the browser.
export { achievement } from "./achievement";
