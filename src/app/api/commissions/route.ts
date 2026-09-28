import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import SystemSettings from "@/models/SystemSettings";
import { escapeRegex } from "@/lib/security/sanitize";
import { commissionBeneficiary } from "@/lib/invoices/commissionRecords";

interface AuthCtx { userId: string; role: string; locale: string; }

const SUMMARY_STATUSES = ["pending", "approved", "paid", "disputed", "clawed_back"] as const;

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const currency = searchParams.get("currency");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  const skip = (page - 1) * limit;

  // Build query based on role
  const query: Record<string, unknown> = {};
  if (ctx.role === "agent") {
    const Agent = (await import("@/models/Agent")).default;
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    query.agentId = agentDoc._id;
  } else if (ctx.role === "super_agent") {
    // Commission.superAgentId references the SuperAgent PROFILE _id, not the User
    // _id. Resolve the profile and fail closed if none, so the previous bug
    // (querying by ctx.userId → always empty) is fixed without leaking others'.
    const SuperAgent = (await import("@/models/SuperAgent")).default;
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!sa) {
      return NextResponse.json({ commissions: [], summary: { currency: "AED" }, pagination: { page, limit, total: 0, pages: 0 } });
    }
    query.superAgentId = sa._id;
  }
  if (status && status !== "all") {
    query.status = status;
  }
  if (type && type !== "all") {
    query.type = type;
  }
  if (currency && currency !== "all") {
    query.currency = currency;
  }
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    query.createdAt = dateFilter;
  }

  // Agent / super-agent name search — names live on the linked User, not on
  // the Agent/SuperAgent document, so resolve matching users first. Restricted
  // to admin to avoid broadening the scoped query for super-agents/agents.
  if (search && search.trim() && ctx.role === "admin") {
    const Agent = (await import("@/models/Agent")).default;
    const SuperAgent = (await import("@/models/SuperAgent")).default;
    const User = (await import("@/models/User")).default;
    const matchingUsers = await User.find(
      { name: { $regex: escapeRegex(search.trim()), $options: "i" } },
      { _id: 1 }
    ).lean();
    const userIds = matchingUsers.map((u: { _id: unknown }) => u._id);
    const [agents, superAgents] = await Promise.all([
      Agent.find({ userId: { $in: userIds } }, { _id: 1 }).lean(),
      SuperAgent.find({ userId: { $in: userIds } }, { _id: 1 }).lean(),
    ]);
    query.$or = [
      { agentId: { $in: agents.map((a: { _id: unknown }) => a._id) } },
      { superAgentId: { $in: superAgents.map((s: { _id: unknown }) => s._id) } },
    ];
  }

  const [commissionsRaw, total] = await Promise.all([
    Commission.find(query)
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
      .populate({ path: "superAgentId", select: "userId", populate: { path: "userId", select: "name" } })
      .populate("placementId", "jobTitle candidateName")
      .populate("invoiceId", "invoiceNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Commission.countDocuments(query),
  ]);

  // Names are not stored on Agent/SuperAgent — resolve them from the linked User
  // and flatten onto a stable `agentName`. `recipient*` names whoever EARNS the
  // line: the agent on a placement, the super-agent on an override (a placement
  // line also names its overseeing super-agent, who does not earn it).
  type PopulatedRef = { _id: unknown; userId?: { name?: string } };
  const commissions = (commissionsRaw as unknown as Array<Record<string, unknown> & {
    type?: string; agentId?: PopulatedRef; superAgentId?: PopulatedRef;
    invoiceId?: { _id: unknown; invoiceNumber?: string } | null;
  }>).map((c) => {
    const agentName = c.agentId?.userId?.name ?? c.superAgentId?.userId?.name ?? null;
    const earner = commissionBeneficiary({ type: c.type, agentId: c.agentId?._id, superAgentId: c.superAgentId?._id });
    const recipient = earner?.role === "agent" ? c.agentId : earner?.role === "super_agent" ? c.superAgentId : null;
    return {
      ...c,
      agentName,
      recipientName: recipient?.userId?.name ?? null,
      recipientRole: earner?.role ?? null,
      invoice: c.invoiceId ? { _id: c.invoiceId._id, invoiceNumber: c.invoiceId.invoiceNumber ?? null } : null,
      invoiceId: c.invoiceId?._id ?? null,
      agentId: c.agentId ? { _id: c.agentId._id, name: c.agentId.userId?.name ?? null } : c.agentId,
      superAgentId: c.superAgentId ? { _id: c.superAgentId._id, name: c.superAgentId.userId?.name ?? null } : c.superAgentId,
    };
  });

  // Summary aggregation, per status AND currency: lines keep their invoice's
  // currency and nothing converts, so an AED line and an INR line can't be added.
  const summaryAgg = await Commission.aggregate([
    { $match: { ...query } },
    {
      $group: {
        _id: { status: "$status", currency: "$currency" },
        total: { $sum: "$amount" },
        // Record count per status, alongside the amount. Clients showing
        // "N pending" were counting the current page instead of the whole set.
        count: { $sum: 1 },
      },
    },
  ]);

  type StatusTotals = Record<(typeof SUMMARY_STATUSES)[number], number>;
  const zero = (): StatusTotals => ({ pending: 0, approved: 0, paid: 0, disputed: 0, clawed_back: 0 });
  const summary: Record<string, unknown> = { ...zero(), currency: (currency && currency !== "all") ? currency : ((await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED") };
  const counts = zero();
  const perCurrency = new Map<string, StatusTotals>();
  for (const row of summaryAgg as Array<{ _id: { status?: string; currency?: string }; total: number; count?: number }>) {
    const s = row._id.status as (typeof SUMMARY_STATUSES)[number];
    if (!SUMMARY_STATUSES.includes(s)) continue;
    // Old single-figure fields stay for the agent page; they mix currencies.
    (summary as StatusTotals)[s] += row.total;
    counts[s] += row.count ?? 0;
    summary.currency = row._id.currency ?? summary.currency;
    const code = row._id.currency ?? String(summary.currency);
    const totals = perCurrency.get(code) ?? zero();
    totals[s] += row.total;
    perCurrency.set(code, totals);
  }
  summary.counts = counts;
  /** One row per currency, largest first — the only totals safe to label with a code. */
  summary.byCurrency = [...perCurrency.entries()]
    .map(([code, totals]) => ({ currency: code, ...totals }))
    .sort((a, b) => SUMMARY_STATUSES.reduce((n, s) => n + b[s], 0) - SUMMARY_STATUSES.reduce((n, s) => n + a[s], 0));

  return NextResponse.json({
    commissions,
    summary,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 },
  });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
// No POST: commissions are created only from recruitment invoices
// (createCommissionRecordsForInvoice). A hand-made record had no recipient and
// no source invoice, and still counted towards the payout totals.
