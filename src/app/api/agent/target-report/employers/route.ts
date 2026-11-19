/**
 * GET /api/agent/target-report/employers?year=&page=&pageSize=
 *
 * The signed-in agent's own employers with, for the year: the commission rate
 * in effect today (employer rate, else the agent's default), invoiced revenue
 * and the agent's own commission, per currency. Nobody else's employers are
 * reachable from here.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Employer from "@/models/Employer";
import Invoice from "@/models/Invoice";
import { employerRateView, type StoredRateChange } from "@/lib/commissions/employerRateHistory";
import { employerTotals, REVENUE_INVOICE_STATUSES, type EmployerMoney } from "@/lib/targets/agentEmployerKpis";

interface AuthCtx { userId: string; role: string; locale: string }

const PAGE_SIZES = [10, 25, 50, 100];

export interface AgentEmployerRow {
  employerUserId: string;
  companyName: string;
  rate: number;
  rateSource: "employer_rate" | "agent_default";
  money: EmployerMoney[];
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const thisYear = new Date().getFullYear();
  const year = Number.parseInt(searchParams.get("year") ?? "", 10);
  const safeYear = Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : thisYear;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(searchParams.get("pageSize") ?? "10", 10);
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 10;

  await connectDB();
  const agent = await Agent.findOne({ userId: ctx.userId })
    .select("_id commissionRate")
    .lean<{ _id: unknown; commissionRate?: number }>();
  if (!agent) return NextResponse.json({ year: safeYear, data: [], page, pageSize, total: 0, totalPages: 0 });

  const employers = await Employer.find({ agentId: agent._id })
    .select("_id userId companyName agentCommissionRates")
    .lean<{ _id: unknown; userId: unknown; companyName?: string; agentCommissionRates?: StoredRateChange[] }[]>();

  const start = new Date(Date.UTC(safeYear, 0, 1));
  const end = new Date(Date.UTC(safeYear + 1, 0, 1));
  const invoices = employers.length
    ? await Invoice.find({
        employerId: { $in: employers.map((e) => e._id) },
        category: "recruitment",
        status: { $in: REVENUE_INVOICE_STATUSES },
        $or: [{ issuedAt: { $gte: start, $lt: end } }, { issuedAt: null, createdAt: { $gte: start, $lt: end } }],
      })
        .select("employerId currency subtotal discountPercent serviceCharge totalAmount refundedAmount lineItems.amount lineItems.placementId commissions.role commissions.agentId commissions.amount commissions.status")
        .lean()
    : [];
  const totals = employerTotals(invoices as never, String(agent._id));

  const rows: AgentEmployerRow[] = employers.map((e) => {
    const current = employerRateView(e.agentCommissionRates).current;
    const hasRate = "rate" in current;
    return {
      employerUserId: String(e.userId),
      companyName: e.companyName ?? "",
      rate: hasRate ? current.rate : agent.commissionRate ?? 0,
      rateSource: hasRate ? "employer_rate" : "agent_default",
      money: totals.get(String(e._id)) ?? [],
    };
  });
  // Biggest earners first, then by name.
  rows.sort((a, b) => (b.money[0]?.revenue ?? 0) - (a.money[0]?.revenue ?? 0) || a.companyName.localeCompare(b.companyName));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const data = rows.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({ year: safeYear, data, page, pageSize, total, totalPages });
}

export const GET = withAuth(handler);
