import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Placement from "@/models/Placement";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { placementUpdateSchema } from "@/lib/validators/placements";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * Verify the caller owns the placement.
 * Admins bypass. Employers must own via their employer profile.
 * Agents must own via their agent profile.
 */
async function verifyOwnership(
  placement: { employerId?: unknown; agentId?: unknown },
  ctx: AuthCtx
): Promise<NextResponse | null> {
  if (ctx.role === "admin") return null; // admins can access all

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(placement.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agent || String(placement.agentId) !== String(agent._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "super_agent") {
    // S1: scope super_agent to placements whose agent is within their book of business
    // (team + region). No platform-wide read of candidate PII + salary.
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const scope = await getSuperAgentScope(ctx.userId);
    const inScope = Boolean(
      placement.agentId && scope?.effectiveAgentIds.some((id) => String(id) === String(placement.agentId))
    );
    if (!inScope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return null;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const placement = await Placement.findById(params?.id)
    .populate("jobId", "title location")
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
    .lean();
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  // H2: enforce the same ownership check used on PATCH/DELETE — closes employer↔employer
  // and agent↔agent IDOR exposing candidate PII + salary.
  const forbidden = await verifyOwnership(placement, ctx);
  if (forbidden) return forbidden;

  return NextResponse.json({ placement });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const body = await validateBody(req, placementUpdateSchema);

  await connectDB();
  const placement = await Placement.findById(params?.id);
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  const forbidden = await verifyOwnership(placement, ctx);
  if (forbidden) return forbidden;

  Object.assign(placement, body);
  await placement.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.update",
    resource: "placements",
    resourceId: params?.id,
    changes: { after: body },
    req,
  });

  return NextResponse.json({ placement });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const placement = await Placement.findById(params?.id);
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  const forbidden = await verifyOwnership(placement, ctx);
  if (forbidden) return forbidden;

  await Placement.findByIdAndDelete(params?.id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.delete",
    resource: "placements",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Placement deleted" });
}

export const GET = withAuth(getHandler, { resource: "placements", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "placements", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "placements", action: "delete" });
