import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { approvalDecisionSchema } from "@/lib/validators/super-agent";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = params?.id;
  if (!isValidObjectId(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  const job = await Job.findById(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Ownership validation: job must be under this super agent's agents
  if (ctx.role === "super_agent") {
    // Auto-create profile if it doesn't exist yet (e.g. onboarding gap)
    const saProfile = await SuperAgent.findOneAndUpdate(
      { userId: ctx.userId },
      { $setOnInsert: { userId: ctx.userId, agentIds: [], assignedCityIds: [], assignedStateIds: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .select("agentIds")
      .lean();

    const agentIds = (saProfile.agentIds ?? []).map(String);

    // If the super-agent has assigned agents, enforce ownership
    if (agentIds.length > 0) {
      let isOwnedJob = false;

      if (job.agentId && agentIds.includes(String(job.agentId))) {
        isOwnedJob = true;
      }

      if (!isOwnedJob) {
        const managedAgents = await Agent.find({
          _id: { $in: saProfile.agentIds ?? [] },
        })
          .select("assignedEmployerIds")
          .lean();
        const managedEmployerIds = managedAgents
          .flatMap((a) => a.assignedEmployerIds ?? [])
          .map(String);

        if (
          job.employerId &&
          managedEmployerIds.includes(String(job.employerId))
        ) {
          isOwnedJob = true;
        }
      }

      if (!isOwnedJob) {
        return NextResponse.json(
          { error: "Forbidden — this job is not under your agents" },
          { status: 403 }
        );
      }
    }
    // If agentIds is empty, allow action (matches GET route scoping behavior)
  }

  const body = await validateBody(req, approvalDecisionSchema);
  const { status, reason } = body;

  const prevApprovalStatus = job.poster?.approvalStatus ?? "pending";

  job.poster = job.poster ?? { approvalStatus: "pending" };
  job.poster.approvalStatus = status as "approved" | "rejected";

  if (status === "approved") {
    job.status = "active";
    job.approvedBy = ctx.userId as unknown as typeof job.approvedBy;
    job.approvedAt = new Date();
  } else if (status === "rejected") {
    job.status = "draft";
  }

  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: status === "approved" ? "job.approve" : "job.reject",
    resource: "jobs",
    resourceId: String(job._id),
    changes: {
      before: { approvalStatus: prevApprovalStatus },
      after: { approvalStatus: status },
    },
    meta: reason ? { reason } : undefined,
    req,
  });

  // Notify the agent who posted the job
  if (job.agentId) {
    const agentDoc = await Agent.findById(job.agentId)
      .select("userId")
      .lean();
    if (agentDoc?.userId) {
      await notify({
        userId: String(agentDoc.userId),
        type: status === "approved" ? "job_approved" : "job_rejected",
        title: status === "approved" ? "Job Approved" : "Job Rejected",
        message:
          status === "approved"
            ? `Your job "${job.title}" has been approved and is now live.`
            : `Your job "${job.title}" was rejected.${reason ? ` Reason: ${reason}` : ""}`,
        link: `/${ctx.locale}/agent/jobs`,
        sendEmail: true,
        metadata: { jobId: String(job._id), reason },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    job: {
      _id: job._id,
      title: job.title,
      status: job.status,
      poster: job.poster,
      approvedBy: job.approvedBy,
      approvedAt: job.approvedAt,
    },
    message: `Job ${status} successfully`,
  });
}

export const PATCH = withAuth(patchHandler, {
  resource: "jobs",
  action: "approve",
});
