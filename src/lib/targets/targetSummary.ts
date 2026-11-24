/**
 * The three targets for the current period, as the invoice screens show them
 * (docs/plans/2026-11-24-agent-invoice-hires-target.md, T5).
 *
 * "achieved" comes from calculateKpis — the same figures the target report
 * shows. The extra figures explain what is not counted yet:
 *  - hires.hiredOnOpenJobs: hired candidates on the owner's jobs that are not
 *    closed (a hire counts once its job is closed).
 *  - revenue.awaitingApproval: hire-linked line revenue on pending_approval
 *    invoices (counts on the day it is approved).
 *  - revenue.leftOutNoHire: fee lines issued in this period that name no hire
 *    (never counted until linked); "other" charges are excluded.
 * Crediting follows kpiCalculator: an agent's own Agent doc; a super agent's
 * team is the agents pointing at them (Agent.superAgentId), never territory.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import TargetProfile, { type ITargetPeriod } from "@/models/TargetProfile";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Invoice from "@/models/Invoice";
import { utcToday } from "@/lib/targets/schedule";
import { calculateKpis, kpiOwnerKey, type KpiRole } from "@/lib/targets/kpiCalculator";
import { lineRevenue } from "@/lib/targets/lineRevenue";

export interface TargetSummary {
  currency: string;
  period: { start: string; end: string; label?: string };
  jobs: { target: number; achieved: number };
  hires: { target: number; achieved: number; hiredOnOpenJobs: number };
  revenue: { target: number; achieved: number; awaitingApproval: number; leftOutNoHire: number };
}

const REVENUE_STATUSES = ["issued", "sent", "paid", "partially_paid", "overdue"];
const DEFAULT_CURRENCY = "AED";
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface SummaryInvoice {
  status: string;
  issuedAt?: Date;
  createdAt?: Date;
  currency?: string;
  subtotal?: number;
  discountPercent?: number;
  serviceCharge?: number;
  totalAmount?: number;
  refundedAmount?: number;
  lineItems?: { amount: number; placementId?: unknown; chargeType?: string }[];
}

/** Agent doc ids whose work counts for this owner (same rule as calculateKpis). */
async function creditedAgentIds(userId: string, role: KpiRole): Promise<mongoose.Types.ObjectId[]> {
  if (role === "agent") {
    const agent = await Agent.findOne({ userId }).select("_id").lean();
    return agent ? [agent._id as mongoose.Types.ObjectId] : [];
  }
  const sa = await SuperAgent.findOne({ userId }).select("_id").lean();
  if (!sa) return [];
  const team = await Agent.find({ superAgentId: sa._id }).select("_id").lean();
  return team.map((a) => a._id as mongoose.Types.ObjectId);
}

const valueOf = (inv: SummaryInvoice, lineAmount: number) =>
  lineRevenue({
    lineAmount,
    subtotal: inv.subtotal ?? 0,
    discountPercent: inv.discountPercent,
    serviceCharge: inv.serviceCharge,
    totalAmount: inv.totalAmount,
    refundedAmount: inv.refundedAmount,
  });

/** Pure: split invoices into awaiting-approval and left-out revenue for one period. */
export function uncountedRevenue(
  invoices: SummaryInvoice[],
  currency: string,
  period: { start: string; end: string },
): { awaitingApproval: number; leftOutNoHire: number } {
  let awaitingApproval = 0;
  let leftOutNoHire = 0;
  for (const inv of invoices) {
    if ((inv.currency || DEFAULT_CURRENCY) !== currency) continue;
    if (inv.status === "pending_approval") {
      for (const line of inv.lineItems ?? []) {
        if (line.placementId && line.chargeType !== "other") awaitingApproval += valueOf(inv, line.amount);
      }
      continue;
    }
    if (!REVENUE_STATUSES.includes(inv.status)) continue;
    const day = toDay(inv.issuedAt ?? inv.createdAt ?? new Date(0));
    if (day < period.start || day > period.end) continue;
    for (const line of inv.lineItems ?? []) {
      if (!line.placementId && line.chargeType !== "other") leftOutNoHire += valueOf(inv, line.amount);
    }
  }
  return { awaitingApproval: round2(awaitingApproval), leftOutNoHire: round2(leftOutNoHire) };
}

/** The caller's current-period summary, or null when they have no live kpi3 target for today. */
export async function buildTargetSummary(userId: string, role: KpiRole): Promise<TargetSummary | null> {
  await connectDB();
  const today = utcToday();
  const year = Number(today.slice(0, 4));

  const profile = (await TargetProfile.findOne({
    targetType: "kpi3",
    assigneeId: userId,
    assigneeRole: role,
    year,
    status: { $ne: "cancelled" },
  }).lean()) as { currency?: string; periods?: ITargetPeriod[] } | null;
  const periods = profile?.periods ?? [];
  const index = periods.findIndex((p) => toDay(p.startDate) <= today && today <= toDay(p.endDate));
  if (!profile || index < 0) return null;
  const current = periods[index];
  const currency = profile.currency || DEFAULT_CURRENCY;
  const bounds = { start: toDay(current.startDate), end: toDay(current.endDate) };
  const periodEnd = new Date(`${bounds.end}T23:59:59.999Z`);

  const [kpis, agentIds] = await Promise.all([
    calculateKpis([{ userId, role, currency, periods: periods.map((p) => ({ startDate: toDay(p.startDate), endDate: toDay(p.endDate) })) }], year),
    creditedAgentIds(userId, role),
  ]);
  const achieved = kpis.get(kpiOwnerKey(role, userId))?.periods[index];

  let hiredOnOpenJobs = 0;
  let uncounted = { awaitingApproval: 0, leftOutNoHire: 0 };
  if (agentIds.length) {
    const openJobs = await Job.find({
      status: { $ne: "closed" },
      deletedAt: null,
      $or: [{ acquiredByAgentId: { $in: agentIds } }, { acquiredByAgentId: { $exists: false }, agentId: { $in: agentIds } }],
    }).select("_id").lean();
    const [hired, invoices] = await Promise.all([
      openJobs.length ? Application.countDocuments({ jobId: { $in: openJobs.map((j) => j._id) }, status: "hired" }) : 0,
      Invoice.find({
        category: "recruitment",
        agentId: { $in: agentIds },
        $or: [
          { status: "pending_approval" },
          {
            status: { $in: REVENUE_STATUSES },
            // Older invoices may lack issuedAt; kpiCalculator dates them by createdAt.
            $or: [
              { issuedAt: { $gte: current.startDate, $lte: periodEnd } },
              { issuedAt: null, createdAt: { $gte: current.startDate, $lte: periodEnd } },
            ],
          },
        ],
      })
        .select("status issuedAt createdAt currency subtotal discountPercent serviceCharge totalAmount refundedAmount lineItems")
        .lean() as Promise<SummaryInvoice[]>,
    ]);
    hiredOnOpenJobs = hired;
    uncounted = uncountedRevenue(invoices, currency, bounds);
  }

  return {
    currency,
    period: { ...bounds, ...(current.label ? { label: current.label } : {}) },
    jobs: { target: current.jobTarget ?? 0, achieved: achieved?.jobs ?? 0 },
    hires: { target: current.conversionTarget ?? 0, achieved: achieved?.onboarded ?? 0, hiredOnOpenJobs },
    revenue: { target: current.revenueTarget ?? 0, achieved: achieved?.revenue ?? 0, ...uncounted },
  };
}
