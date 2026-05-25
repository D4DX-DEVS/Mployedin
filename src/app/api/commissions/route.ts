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
    query.superAgentId = ctx.userId;
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

  // Agent name search — need to resolve matching agent IDs first
  let agentIdFilter: unknown[] | undefined;
  if (search && search.trim()) {
    const Agent = (await import("@/models/Agent")).default;
    const matchingAgents = await Agent.find(
      { fullName: { $regex: escapeRegex(search.trim()), $options: "i" } },
      { _id: 1 }
    ).lean();
    agentIdFilter = matchingAgents.map((a: { _id: unknown }) => a._id);
    query.agentId = ctx.role === "agent"
      ? query.agentId // already resolved Agent._id above, keep it
      : { $in: agentIdFilter };
  }

  const [commissions, total] = await Promise.all([
    Commission.find(query)
      .populate("agentId", "fullName")
      .populate("placementId", "jobTitle candidateName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Commission.countDocuments(query),
  ]);

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
