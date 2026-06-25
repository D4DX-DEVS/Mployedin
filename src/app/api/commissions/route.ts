import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import SystemSettings from "@/models/SystemSettings";
import { validateBody } from "@/lib/validators";
import { commissionCreateSchema } from "@/lib/validators/commissions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import { escapeRegex } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const currency = searchParams.get("currency");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
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
      { fullName: { $regex: escapeRegex(search.trim()), $options: "i" } },
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
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "fullName" } })
      .populate({ path: "superAgentId", select: "userId", populate: { path: "userId", select: "fullName" } })
      .populate("placementId", "jobTitle candidateName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Commission.countDocuments(query),
  ]);

  // Names are not stored on Agent/SuperAgent — resolve them from the linked User
  // and flatten onto a stable `agentName` (and keep agentId.fullName for back-compat).
  type PopulatedRef = { _id: unknown; userId?: { fullName?: string } };
  const commissions = (commissionsRaw as unknown as Array<Record<string, unknown> & {
    agentId?: PopulatedRef; superAgentId?: PopulatedRef;
  }>).map((c) => {
    const agentName = c.agentId?.userId?.fullName ?? c.superAgentId?.userId?.fullName ?? null;
    return {
      ...c,
      agentName,
      agentId: c.agentId ? { _id: c.agentId._id, fullName: c.agentId.userId?.fullName ?? null } : c.agentId,
      superAgentId: c.superAgentId ? { _id: c.superAgentId._id, fullName: c.superAgentId.userId?.fullName ?? null } : c.superAgentId,
    };
  });

  // Summary aggregation
  const summaryAgg = await Commission.aggregate([
    { $match: { ...query } },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        currency: { $first: "$currency" },
      },
    },
  ]);

  const summary: Record<string, unknown> = { pending: 0, approved: 0, paid: 0, disputed: 0, clawed_back: 0, currency: (currency && currency !== "all") ? currency : ((await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED") };
  for (const row of summaryAgg) {
    const s = row._id as string;
    if (s === "pending" || s === "approved" || s === "paid" || s === "disputed" || s === "clawed_back") {
      summary[s] = row.total;
      summary.currency = row.currency ?? summary.currency;
    }
  }

  return NextResponse.json({
    commissions,
    summary,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, commissionCreateSchema);
  const { type, amount, currency, rate, agentId, superAgentId, placementId, notes } = body;

  const defaultCurrency = (await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED";

  const commission = await Commission.create({
    type,
    amount,
    currency: currency ?? defaultCurrency,
    rate,
    agentId,
    superAgentId,
    placementId,
    notes,
    status: "pending",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.create",
    resource: "commissions",
    resourceId: String(commission._id),
    meta: { type, amount, currency: currency ?? defaultCurrency, placementId },
    req,
  });

  dispatchWebhook("commission.created", {
    commissionId: String(commission._id),
    type,
    amount,
    currency: currency ?? defaultCurrency,
    rate,
    agentId,
    superAgentId,
    status: "pending",
  });

  return NextResponse.json({ commission }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
export const POST = withAuth(postHandler, { resource: "commissions", action: "create" });
