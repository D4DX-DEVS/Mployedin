/**
 * Company-profit achievement for target profiles.
 *
 * A target has one aim: profit. Profit is the company's NET income from
 * invoices, `Invoice.platformRevenue` (post-discount subtotal + service charge
 * − every agent / super-agent commission line, tax excluded), counted when the
 * money arrives: each payment recognises `platformRevenue × payment ÷ total`
 * in the month it was paid (cash basis). Void, cancelled, refunded and credit
 * note invoices never count, and a partial refund scales the invoice down.
 *
 * Who earns an invoice (exactly one agent, first rule that applies):
 *   1. `Invoice.agentId` — recruitment invoices, taken from the job's agent.
 *   2. otherwise the billed employer's agent (`Employer.agentId`), matched by
 *      `Invoice.employerId` or by `Invoice.userId` → `Employer.userId`.
 * A super agent earns the invoices of every agent in their team
 * (`Agent.superAgentId`, explicit assignment only — never territory overlap)
 * plus any invoice carrying one of their override commission lines. An invoice
 * is counted once per super agent, so a team never double-counts.
 *
 * Nothing converts between currencies: a profile only counts invoices in its
 * own currency (a missing currency is AED, the schema default).
 *
 * Known limits: `platformRevenue` is recomputed only when an invoice is saved
 * (credit notes `$inc` `refundedAmount` instead, which the refund factor
 * covers), and the bulk recruitment route commissions on a slightly different
 * base than the single route, so those invoices' profit differs a little.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import Employer from "@/models/Employer";
import Placement from "@/models/Placement";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import type { PeriodBounds } from "./schedule";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A profile whose profit is wanted. `userId` is the User id, as on TargetProfile.assigneeId. */
export interface ProfitSource {
  userId: string;
  role: "agent" | "super_agent";
  currency: string;
  /** The profile's schedule, when profit per period is wanted too. */
  periods?: PeriodBounds[];
}

export interface ProfitMonth {
  month: number;
  /** Net company income recognised in the month. */
  profit: number;
  /** Income before commissions, tax excluded (profit + commissionCost). */
  revenue: number;
  commissionCost: number;
  /** Distinct invoices that received a payment in the month. */
  invoicesPaid: number;
  placements: number;
  newEmployers: number;
}

export type ProfitDrivers = Omit<ProfitMonth, "month">;

/** Profit recognised inside one period of a schedule. */
export interface ProfitPeriod extends PeriodBounds {
  profit: number;
  revenue: number;
  commissionCost: number;
  invoicesPaid: number;
}

export interface OwnerProfit {
  months: ProfitMonth[];
  /** One entry per period of the profile's schedule, in order; empty when none was asked for. */
  periods: ProfitPeriod[];
  totals: ProfitDrivers;
  /** Profit by invoice category, largest first. */
  byCategory: { category: string; profit: number }[];
}

/** One aggregated invoice-payment row, keyed by who could own it. */
export interface ProfitRow {
  agentId?: string | null;
  employerId?: string | null;
  userId?: string | null;
  /** SuperAgent ids on the invoice's commission lines. */
  saIds: string[];
  /** The UTC calendar day the payment was made, `YYYY-MM-DD`. */
  day: string;
  currency: string;
  category: string;
  profit: number;
  commissionCost: number;
  invoiceIds: string[];
}

export interface ProfitOwner {
  key: string;
  role: "agent" | "super_agent";
  currency: string;
  /** Agent ids whose invoices count: the agent itself, or a super agent's team. */
  agentIds: Set<string>;
  /** SuperAgent doc id; its override lines count whoever the earning agent is. */
  saId?: string;
  /** The schedule's periods, to bucket profit by. */
  periods?: PeriodBounds[];
}

export interface OwnershipIndex {
  employerAgent: Map<string, string>;
  employerUserAgent: Map<string, string>;
}

export interface ActivityRow {
  agentId: string;
  month: number;
  count: number;
}

const DEFAULT_CURRENCY = "AED";
const MONTHS = 12;
const round2 = (value: number) => Math.round(value * 100) / 100;

export const profitOwnerKey = (role: "agent" | "super_agent", userId: string) => `${role}:${userId}`;

/** Calendar year in UTC, matching the `$month` buckets of the aggregations below. */
function yearRange(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
}

const toObjectIds = (ids: Iterable<string>) => [...ids].map((id) => new mongoose.Types.ObjectId(id));

/* ------------------------------------------------------------------ */
/*  Pure attribution                                                   */
/* ------------------------------------------------------------------ */

/** The one agent an invoice row belongs to, or null when nobody earns it. */
export function earningAgentOf(row: ProfitRow, index: OwnershipIndex): string | null {
  if (row.agentId) return String(row.agentId);
  return (
    (row.employerId ? index.employerAgent.get(String(row.employerId)) : undefined) ??
    (row.userId ? index.employerUserAgent.get(String(row.userId)) : undefined) ??
    null
  );
}

interface OwnerAccumulator {
  months: {
    month: number;
    profit: number;
    commissionCost: number;
    placements: number;
    newEmployers: number;
    invoices: Set<string>;
  }[];
  periods: { profit: number; commissionCost: number; invoices: Set<string> }[];
  invoices: Set<string>;
  categories: Map<string, number>;
}

function newAccumulator(periodCount = 0): OwnerAccumulator {
  return {
    periods: Array.from({ length: periodCount }, () => ({ profit: 0, commissionCost: 0, invoices: new Set<string>() })),
    months: Array.from({ length: MONTHS }, (_, i) => ({
      month: i + 1,
      profit: 0,
      commissionCost: 0,
      placements: 0,
      newEmployers: 0,
      invoices: new Set<string>(),
    })),
    invoices: new Set<string>(),
    categories: new Map<string, number>(),
  };
}

function indexOwners(owners: ProfitOwner[]) {
  const byAgent = new Map<string, ProfitOwner[]>();
  const bySuperAgent = new Map<string, ProfitOwner[]>();
  for (const owner of owners) {
    for (const agentId of owner.agentIds) {
      const list = byAgent.get(agentId) ?? [];
      list.push(owner);
      byAgent.set(agentId, list);
    }
    if (owner.saId) {
      const list = bySuperAgent.get(owner.saId) ?? [];
      list.push(owner);
      bySuperAgent.set(owner.saId, list);
    }
  }
  return { byAgent, bySuperAgent };
}

/** Credit each invoice row to every owner it belongs to, once per owner. */
export function attributeProfitRows(
  rows: ProfitRow[],
  owners: ProfitOwner[],
  index: OwnershipIndex,
): Map<string, OwnerAccumulator> {
  const accumulators = new Map(owners.map((owner) => [owner.key, newAccumulator(owner.periods?.length ?? 0)]));
  const { byAgent, bySuperAgent } = indexOwners(owners);

  for (const row of rows) {
    const currency = row.currency || DEFAULT_CURRENCY;
    const earner = earningAgentOf(row, index);

    const credited = new Set<ProfitOwner>();
    if (earner) for (const owner of byAgent.get(earner) ?? []) credited.add(owner);
    for (const saId of row.saIds) for (const owner of bySuperAgent.get(String(saId)) ?? []) credited.add(owner);

    for (const owner of credited) {
      if ((owner.currency || DEFAULT_CURRENCY) !== currency) continue;
      const acc = accumulators.get(owner.key);
      const month = acc?.months[Number(row.day.slice(5, 7)) - 1];
      if (!acc || !month) continue;

      month.profit += row.profit;
      month.commissionCost += row.commissionCost;
      for (const id of row.invoiceIds) {
        month.invoices.add(String(id));
        acc.invoices.add(String(id));
      }
      acc.categories.set(row.category, (acc.categories.get(row.category) ?? 0) + row.profit);

      // Day strings compare like the dates they are, so a period holds a day by plain comparison.
      owner.periods?.forEach((period, i) => {
        if (row.day < period.startDate || row.day > period.endDate) return;
        const bucket = acc.periods[i];
        bucket.profit += row.profit;
        bucket.commissionCost += row.commissionCost;
        for (const id of row.invoiceIds) bucket.invoices.add(String(id));
      });
    }
  }

  return accumulators;
}

/** Add placement / new-employer counts of each owner's agents. */
function attributeActivity(
  owners: ProfitOwner[],
  accumulators: Map<string, OwnerAccumulator>,
  field: "placements" | "newEmployers",
  rows: ActivityRow[],
) {
  const byAgent = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const list = byAgent.get(String(row.agentId)) ?? [];
    list.push(row);
    byAgent.set(String(row.agentId), list);
  }
  for (const owner of owners) {
    const acc = accumulators.get(owner.key);
    if (!acc) continue;
    for (const agentId of owner.agentIds) {
      for (const row of byAgent.get(agentId) ?? []) {
        const month = acc.months[row.month - 1];
        if (month) month[field] += row.count;
      }
    }
  }
}

function finalize(acc: OwnerAccumulator, periodBounds: PeriodBounds[] = []): OwnerProfit {
  const months: ProfitMonth[] = acc.months.map((m) => ({
    month: m.month,
    profit: round2(m.profit),
    revenue: round2(m.profit + m.commissionCost),
    commissionCost: round2(m.commissionCost),
    invoicesPaid: m.invoices.size,
    placements: m.placements,
    newEmployers: m.newEmployers,
  }));
  const profit = acc.months.reduce((sum, m) => sum + m.profit, 0);
  const commissionCost = acc.months.reduce((sum, m) => sum + m.commissionCost, 0);

  return {
    months,
    periods: periodBounds.map((bounds, i) => ({
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      profit: round2(acc.periods[i]?.profit ?? 0),
      revenue: round2((acc.periods[i]?.profit ?? 0) + (acc.periods[i]?.commissionCost ?? 0)),
      commissionCost: round2(acc.periods[i]?.commissionCost ?? 0),
      invoicesPaid: acc.periods[i]?.invoices.size ?? 0,
    })),
    totals: {
      profit: round2(profit),
      revenue: round2(profit + commissionCost),
      commissionCost: round2(commissionCost),
      invoicesPaid: acc.invoices.size,
      placements: months.reduce((sum, m) => sum + m.placements, 0),
      newEmployers: months.reduce((sum, m) => sum + m.newEmployers, 0),
    },
    byCategory: [...acc.categories.entries()]
      .map(([category, value]) => ({ category, profit: round2(value) }))
      .sort((left, right) => right.profit - left.profit),
  };
}

/* ------------------------------------------------------------------ */
/*  Aggregations                                                       */
/* ------------------------------------------------------------------ */

interface InvoiceScope {
  agentIds: string[];
  employerIds: string[];
  employerUserIds: string[];
  saIds: string[];
}

/**
 * Per invoice and payment day, what the payments recognised; then collapsed to
 * one row per (possible owner, day, currency, category). A day is the finest
 * grain any schedule needs: months and the weeks or custom ranges of each
 * profile are all cut from it afterwards. Pro-rata share is `payment ÷ total`,
 * scaled by the share of the invoice not refunded.
 */
export function profitInvoicePipeline(scope: InvoiceScope, year: number): mongoose.PipelineStage[] {
  const { start, end } = yearRange(year);
  const ownerArms: Record<string, unknown>[] = [];
  if (scope.agentIds.length) ownerArms.push({ agentId: { $in: toObjectIds(scope.agentIds) } });
  if (scope.employerIds.length) ownerArms.push({ employerId: { $in: toObjectIds(scope.employerIds) } });
  if (scope.employerUserIds.length) ownerArms.push({ userId: { $in: toObjectIds(scope.employerUserIds) } });
  if (scope.saIds.length) ownerArms.push({ "commissions.superAgentId": { $in: toObjectIds(scope.saIds) } });

  const inRange = { $gte: start, $lte: end };

  return [
    {
      $match: {
        status: { $nin: NON_REVENUE_INVOICE_STATUSES },
        "payments.paymentDate": inRange,
        $or: ownerArms,
      },
    },
    {
      $addFields: {
        commissionTotal: { $sum: "$commissions.amount" },
        saIds: {
          $filter: {
            input: { $map: { input: { $ifNull: ["$commissions", []] }, as: "c", in: "$$c.superAgentId" } },
            as: "s",
            cond: { $ne: ["$$s", null] },
          },
        },
      },
    },
    { $unwind: "$payments" },
    { $match: { "payments.paymentDate": inRange } },
    {
      $addFields: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$payments.paymentDate", timezone: "UTC" } },
        share: {
          $cond: [
            { $gt: ["$totalAmount", 0] },
            {
              $multiply: [
                { $divide: ["$payments.amount", "$totalAmount"] },
                {
                  $max: [
                    0,
                    { $min: [1, { $divide: [{ $subtract: ["$totalAmount", { $ifNull: ["$refundedAmount", 0] }] }, "$totalAmount"] }] },
                  ],
                },
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: { invoiceId: "$_id", day: "$day" },
        agentId: { $first: "$agentId" },
        employerId: { $first: "$employerId" },
        userId: { $first: "$userId" },
        saIds: { $first: "$saIds" },
        currency: { $first: { $ifNull: ["$currency", DEFAULT_CURRENCY] } },
        category: { $first: { $ifNull: ["$category", "subscription"] } },
        profit: { $sum: { $multiply: [{ $ifNull: ["$platformRevenue", 0] }, "$share"] } },
        commissionCost: { $sum: { $multiply: ["$commissionTotal", "$share"] } },
      },
    },
    {
      $group: {
        _id: {
          agentId: "$agentId",
          employerId: "$employerId",
          userId: "$userId",
          saIds: "$saIds",
          day: "$_id.day",
          currency: "$currency",
          category: "$category",
        },
        profit: { $sum: "$profit" },
        commissionCost: { $sum: "$commissionCost" },
        invoiceIds: { $addToSet: "$_id.invoiceId" },
      },
    },
  ];
}

interface AggregatedProfitRow {
  _id: {
    agentId?: mongoose.Types.ObjectId | null;
    employerId?: mongoose.Types.ObjectId | null;
    userId?: mongoose.Types.ObjectId | null;
    saIds?: mongoose.Types.ObjectId[];
    day: string;
    currency: string;
    category: string;
  };
  profit: number;
  commissionCost: number;
  invoiceIds: mongoose.Types.ObjectId[];
}

const idString = (id: unknown) => (id ? String(id) : null);

function toProfitRow(row: AggregatedProfitRow): ProfitRow {
  return {
    agentId: idString(row._id.agentId),
    employerId: idString(row._id.employerId),
    userId: idString(row._id.userId),
    saIds: (row._id.saIds ?? []).map(String),
    day: row._id.day,
    currency: row._id.currency,
    category: row._id.category,
    profit: row.profit,
    commissionCost: row.commissionCost,
    invoiceIds: row.invoiceIds.map(String),
  };
}

async function loadActivity(agentIds: string[], year: number): Promise<{ placements: ActivityRow[]; employers: ActivityRow[] }> {
  if (agentIds.length === 0) return { placements: [], employers: [] };
  const { start, end } = yearRange(year);
  const agents = toObjectIds(agentIds);

  const [placements, employers] = await Promise.all([
    Placement.aggregate<{ _id: { agentId: mongoose.Types.ObjectId; month: number }; count: number }>([
      { $match: { agentId: { $in: agents }, status: { $ne: "terminated" }, placedAt: { $gte: start, $lte: end } } },
      { $group: { _id: { agentId: "$agentId", month: { $month: "$placedAt" } }, count: { $sum: 1 } } },
    ]),
    Employer.aggregate<{ _id: { agentId: mongoose.Types.ObjectId; month: number }; count: number }>([
      { $match: { agentId: { $in: agents }, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: { agentId: "$agentId", month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
  ]);

  const toRows = (rows: { _id: { agentId: mongoose.Types.ObjectId; month: number }; count: number }[]): ActivityRow[] =>
    rows.map((r) => ({ agentId: String(r._id.agentId), month: r._id.month, count: r.count }));
  return { placements: toRows(placements), employers: toRows(employers) };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Profit for a set of profiles in one calendar year, in a fixed number of
 * queries however many profiles there are. Keyed by `profitOwnerKey`.
 */
export async function calculateProfits(sources: ProfitSource[], year: number): Promise<Map<string, OwnerProfit>> {
  if (sources.length === 0) return new Map();
  await connectDB();

  const agentUserIds = [...new Set(sources.filter((s) => s.role === "agent").map((s) => s.userId))];
  const saUserIds = [...new Set(sources.filter((s) => s.role === "super_agent").map((s) => s.userId))];

  const [ownAgents, superAgents] = await Promise.all([
    agentUserIds.length ? Agent.find({ userId: { $in: agentUserIds } }).select("_id userId").lean() : [],
    saUserIds.length ? SuperAgent.find({ userId: { $in: saUserIds } }).select("_id userId").lean() : [],
  ]);
  const saProfileIds = superAgents.map((sa) => sa._id);
  // The team is who points at the super agent (Agent.superAgentId), not SuperAgent.agentIds or territory.
  const teamAgents = saProfileIds.length
    ? await Agent.find({ superAgentId: { $in: saProfileIds } }).select("_id superAgentId").lean()
    : [];

  const agentByUser = new Map(ownAgents.map((a) => [String(a.userId), String(a._id)]));
  const saByUser = new Map(superAgents.map((sa) => [String(sa.userId), String(sa._id)]));
  const teamBySa = new Map<string, Set<string>>();
  for (const agent of teamAgents) {
    const saId = String(agent.superAgentId);
    const set = teamBySa.get(saId) ?? new Set<string>();
    set.add(String(agent._id));
    teamBySa.set(saId, set);
  }

  const owners: ProfitOwner[] = sources.map((source) => {
    const currency = source.currency || DEFAULT_CURRENCY;
    const key = profitOwnerKey(source.role, source.userId);
    if (source.role === "agent") {
      const agentId = agentByUser.get(source.userId);
      return { key, role: "agent", currency, agentIds: new Set(agentId ? [agentId] : []), periods: source.periods };
    }
    const saId = saByUser.get(source.userId);
    return { key, role: "super_agent", currency, agentIds: new Set(saId ? teamBySa.get(saId) ?? [] : []), saId, periods: source.periods };
  });

  const allAgentIds = [...new Set(owners.flatMap((owner) => [...owner.agentIds]))];
  const allSaIds = [...new Set(owners.flatMap((owner) => (owner.saId ? [owner.saId] : [])))];

  const employers = allAgentIds.length
    ? await Employer.find({ agentId: { $in: toObjectIds(allAgentIds) } }).select("_id userId agentId").lean()
    : [];
  const index: OwnershipIndex = { employerAgent: new Map(), employerUserAgent: new Map() };
  for (const employer of employers) {
    index.employerAgent.set(String(employer._id), String(employer.agentId));
    if (employer.userId) index.employerUserAgent.set(String(employer.userId), String(employer.agentId));
  }

  const invoiceRows =
    allAgentIds.length || allSaIds.length
      ? await Invoice.aggregate<AggregatedProfitRow>(
          profitInvoicePipeline(
            {
              agentIds: allAgentIds,
              employerIds: [...index.employerAgent.keys()],
              employerUserIds: [...index.employerUserAgent.keys()],
              saIds: allSaIds,
            },
            year,
          ),
        )
      : [];

  const accumulators = attributeProfitRows(invoiceRows.map(toProfitRow), owners, index);

  const activity = await loadActivity(allAgentIds, year);
  attributeActivity(owners, accumulators, "placements", activity.placements);
  attributeActivity(owners, accumulators, "newEmployers", activity.employers);

  return new Map(
    owners.map((owner) => [
      owner.key,
      finalize(accumulators.get(owner.key) ?? newAccumulator(owner.periods?.length ?? 0), owner.periods),
    ]),
  );
}
