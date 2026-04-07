import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { validateBody } from "@/lib/validators";
import { commissionCreateSchema } from "@/lib/validators/commissions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  // Build query based on role
  const query: Record<string, unknown> = {};
  if (ctx.role === "agent") {
    query.agentId = ctx.userId;
  } else if (ctx.role === "super_agent") {
    query.superAgentId = ctx.userId;
  }
  if (status && status !== "all") {
    query.status = status;
  }

  const [commissions, total] = await Promise.all([
    Commission.find(query)
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

  const summary = { pending: 0, approved: 0, paid: 0, currency: "AED" };
  for (const row of summaryAgg) {
    const s = row._id as string;
    if (s === "pending" || s === "approved" || s === "paid") {
      summary[s] = row.total;
      summary.currency = row.currency ?? "AED";
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

  const commission = await Commission.create({
    type,
    amount,
    currency: currency ?? "AED",
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
    meta: { type, amount, currency: currency ?? "AED", placementId },
    req,
  });

  return NextResponse.json({ commission }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
export const POST = withAuth(postHandler, { resource: "commissions", action: "create" });
