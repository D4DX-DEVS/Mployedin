import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { commissionUpdateSchema } from "@/lib/validators/commissions";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const commission = await Commission.findById(params?.id)
    .populate("agentId", "fullName")
    .populate("placementId", "jobTitle candidateName")
    .lean();
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });
  return NextResponse.json({ commission });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const commission = await Commission.findById(params?.id);
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });

  // IDOR: non-admins can only modify their own commissions
  if (ctx.role === "agent" && String(commission.agentId) !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "super_agent" && String(commission.superAgentId) !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, commissionUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  // Auto-track approval
  if (body.status === "approved" && commission.status !== "approved") {
    update.approvedBy = ctx.userId;
    update.approvedAt = new Date();
  }
  if (body.status === "paid" && commission.status !== "paid") {
    update.paidAt = new Date();
  }

  Object.assign(commission, update);
  await commission.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.update",
    resource: "commissions",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ commission });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const commission = await Commission.findById(params?.id);
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });

  // IDOR: only admins can delete commissions
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await Commission.findByIdAndDelete(params?.id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.delete",
    resource: "commissions",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Commission deleted" });
}

export const GET = withAuth(getHandler, { resource: "commissions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "commissions", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "commissions", action: "delete" });
