import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import Commission from "@/models/Commission";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import Lead from "@/models/Lead";
import { taskInboxCount } from "@/lib/agentTasks/inbox";

const EMPTY = {
  pendingExhibitionReviews: 0,
  pendingCommissionApprovals: 0,
  overdueLeadFollowUps: 0,
  taskInbox: 0,
};

/**
 * GET /api/super-agent/action-counts — what is waiting on this super-agent.
 *
 * Reviewing exhibition requests is the one approval this role alone performs,
 * and it raised no badge, no bell and no count anywhere: the queue was
 * discoverable only by remembering which sidebar entry held it. These are the
 * numbers the nav badges and the dashboard queue read.
 *
 * Shaped like `/api/admin/action-counts` and `/api/job-seeker/action-counts`:
 * one small query per counter, scoped through the canonical
 * `getSuperAgentScope` (team ∪ region), and a client that resolves failures to
 * zero rather than breaking navigation.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) return NextResponse.json(EMPTY);

  const agentDocIds = scope.effectiveAgentIds;

  // ExhibitionRequest.agentId stores the Agent's User._id, not the profile id —
  // the same mapping /api/exhibitions performs.
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId).filter(Boolean);

  const [pendingExhibitionReviews, pendingCommissionApprovals, overdueLeadFollowUps, taskInbox] =
    await Promise.all([
      ExhibitionRequest.countDocuments({
        agentId: { $in: agentUserIds },
        status: { $in: ["submitted", "under_review"] },
        isDeleted: { $ne: true },
      }),
      // Commission.superAgentId references the SuperAgent profile _id, which is
      // what /api/commissions filters this role on.
      Commission.countDocuments({ superAgentId: scope.saProfileId, status: "pending" }),
      Lead.countDocuments({
        agentId: { $in: agentDocIds },
        followUpAt: { $lt: new Date() },
        status: { $nin: ["converted", "lost"] },
      }),
      // Tasks admin gave them, still open, plus reports waiting for their review.
      taskInboxCount(ctx),
    ]);

  return NextResponse.json({
    pendingExhibitionReviews,
    pendingCommissionApprovals,
    overdueLeadFollowUps,
    taskInbox,
  });
}, { resource: "exhibitions", action: "read" });

export const dynamic = "force-dynamic";

export type SuperAgentActionCounts = typeof EMPTY;
