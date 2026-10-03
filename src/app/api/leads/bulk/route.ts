import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { canAccess } from "@/lib/permissions/matrix";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { applyStageMove, stageMoveProblems } from "@/lib/leads/applyStageMove";
import type { StageField } from "@/lib/leads/stageRules";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const bulkActionSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(50),
  // "assign" was accepted here but had no case in the switch below, so it fell to
  // default and returned 400 "Unknown action" — advertising an action that does not
  // exist. Dropped until lead reassignment is actually implemented (who may reassign,
  // and whether the new owner is notified, are open questions).
  action: z.enum(["move_status", "delete"]),
  params: z.object({
    status: z.enum(["new", "contacted", "interested", "negotiating", "converted", "lost"]).optional(),
    lostReason: z.string().max(500).optional(),
  }).optional(),
});

/**
 * POST /api/leads/bulk
 * Bulk actions on leads: move_status, delete
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const body = await validateBody(req, bulkActionSchema);
  const { leadIds, action, params } = body;

  // Build filter — agents act only on their own leads; super-agents only on
  // leads within their team/region scope (mirrors GET /api/leads). Without the
  // super_agent branch the filter was unscoped, letting a super-agent bulk
  // move/delete ANY lead platform-wide.
  const filter: Record<string, unknown> = { _id: { $in: leadIds } };
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    filter.agentId = String(agentDoc._id);
  } else if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    if (!scope) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    filter.$or = [
      { superAgentId: scope.saProfileId },
      { agentId: { $in: scope.effectiveAgentIds } },
    ];
  }

  const result: {
    modified: number;
    deleted: number;
    skipped: { id: string; missing: StageField[] }[];
    failed: string[];
  } = { modified: 0, deleted: 0, skipped: [], failed: [] };

  switch (action) {
    case "move_status": {
      if (!params?.status) {
        return NextResponse.json({ error: "Status is required for move_status action" }, { status: 400 });
      }
      // Each lead moves through the same rules as the Move dialog. A bulk move
      // carries no details, so a lead whose target stage needs some it does
      // not hold (every Won; Lost without a reason category) is left where it
      // is and reported back, instead of landing in a stage it cannot prove.
      const to = params.status;
      const leads = await Lead.find(filter);
      const by = ctx.userId as unknown as Types.ObjectId;
      for (const lead of leads) {
        if (lead.status === to) continue;
        const move = { status: to, note: params.lostReason };
        const { missing } = stageMoveProblems(lead, move);
        if (missing.length > 0) {
          result.skipped.push({ id: String(lead._id), missing });
          continue;
        }
        // One legacy document failing validation must not abort the rest
        // half-done with no record of which leads moved.
        try {
          applyStageMove(lead, move, by);
          await lead.save();
          result.modified += 1;
        } catch {
          result.failed.push(String(lead._id));
        }
      }
      break;
    }
    case "delete": {
      // The route guard is leads:update, so without this the destructive branch
      // would run for any role holding only update — a hard deleteMany laundered
      // through a weaker permission.
      if (!canAccess(ctx.role, "leads", "delete")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const res = await Lead.deleteMany(filter);
      result.deleted = res.deletedCount;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: `lead.bulk_${action}`,
    resource: "leads",
    meta: { leadIds, action, params, result },
    req,
  });

  return NextResponse.json({ success: true, ...result });
}, { resource: "leads", action: "update" });
