import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { canAccessLead } from "@/lib/leads/access";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { leadStageMoveSchema } from "@/lib/validators/leads";
import { applyStageMove, stageMoveProblems } from "@/lib/leads/applyStageMove";
import type { LeadStage } from "@/lib/leads/stageRules";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * POST /api/leads/[id]/stage — move a lead to another stage.
 *
 * The move carries the details the target stage needs (stageRules): how the
 * contact was made for Contacted, the hiring need for Interested, value and
 * next follow-up for Negotiating, final value and date for Won, the reason for
 * Lost. A move missing any of them is refused with the list, so the board, the
 * table and the workspace cannot record a stage without its facts. Each move is
 * written to the lead's activity log as a "stage_change" entry.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-2); // /api/leads/[id]/stage
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessLead(ctx, lead))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await validateBody(req, leadStageMoveSchema);
  const from = lead.status as LeadStage;
  const to = body.status;
  if (from === to) {
    return NextResponse.json({ error: "The lead is already in this stage" }, { status: 409 });
  }

  const { missing, invalid } = stageMoveProblems(lead, body);
  if (missing.length > 0) {
    return NextResponse.json({ error: "This stage needs more details", missing }, { status: 400 });
  }
  if (invalid.length > 0) {
    return NextResponse.json({ error: "Some dates in this move can't be right", invalid }, { status: 400 });
  }

  applyStageMove(lead, body, ctx.userId as unknown as Types.ObjectId);
  await lead.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.stage_change",
    resource: "leads",
    resourceId: id!,
    changes: { before: { status: from }, after: { status: to } },
    req,
  });

  return NextResponse.json(lead);
}, { resource: "leads", action: "update" });
