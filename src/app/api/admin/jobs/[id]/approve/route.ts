import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobApprovalSchema } from "@/lib/validators/misc";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Agents can only approve jobs they manage (own or from assigned employers)
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedEmployerIds")
      .lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    const ownsJob = job.agentId && String(job.agentId) === String(agentDoc._id);
    const managesEmployer = job.employerId && agentDoc.assignedEmployerIds?.map(String).includes(String(job.employerId));
    if (!ownsJob && !managesEmployer) {
      return NextResponse.json({ error: "You can only approve jobs you manage" }, { status: 403 });
    }
  }

  const { approved } = await validateBody(req, jobApprovalSchema);

  job.set("poster.approvalStatus", approved ? "approved" : "rejected");
  if (approved) job.status = "active";
  else job.status = "closed";

  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: approved ? "job.approved" : "job.rejected",
    resource: "jobs",
    resourceId: String(job._id),
    meta: { title: job.title },
    req,
  });

  return NextResponse.json({ job });
}

export const POST = withAuth(handler, { resource: "jobs", action: "update" });
