import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import { validateBody } from "@/lib/validators";
import { z } from "zod";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const revenuePermissionSchema = z.object({
  superAgentUserId: z.string().min(1, "Super agent user ID is required"),
  enabled: z.boolean(),
});

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * PATCH /api/admin/target-profiles/revenue-permission
 * Enable or disable revenue target setting for a super agent.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const body = await validateBody(req, revenuePermissionSchema);

  const superAgent = await SuperAgent.findOne({ userId: body.superAgentUserId });
  if (!superAgent) {
    return NextResponse.json({ error: "Super agent not found" }, { status: 404 });
  }

  const previous = superAgent.canSetRevenueTargets ?? false;
  superAgent.canSetRevenueTargets = body.enabled;
  await superAgent.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "super_agent.revenue_permission_update",
    resource: "targets",
    resourceId: String(superAgent._id),
    meta: {
      superAgentUserId: body.superAgentUserId,
      previous,
      enabled: body.enabled,
    },
    req,
  });

  return NextResponse.json({
    superAgentId: String(superAgent._id),
    userId: body.superAgentUserId,
    canSetRevenueTargets: body.enabled,
  });
}

export const PATCH = withAuth(patchHandler, { resource: "targets", action: "create" });
