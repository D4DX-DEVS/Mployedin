import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import AuditLog from "@/models/AuditLog";
import { Employer } from "@/models/Employer";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/applications/[id]/timeline
// Returns audit log entries for the given application, ordered newest-first.
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const application = await Application.findById(params?.id).select("employerId jobSeekerId").lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Access control
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(application.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "job_seeker") {
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (["agent", "super_agent"].includes(ctx.role)) {
    const Job = (await import("@/models/Job")).default;
    const Agent = (await import("@/models/Agent")).default;
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const job = await Job.findById(application.jobId).select("agentId employerId").lean();
    if (!agent || !job) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const hasAccess = String(job.agentId) === String(agent._id) ||
      (agent.assignedEmployerIds ?? []).some((id: unknown) => String(id) === String(job.employerId));
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entries = await AuditLog.find({
    resource: "applications",
    resourceId: params?.id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("actorId", "name")
    .lean();

  // Shape entries into a user-friendly timeline format
  const timeline = entries.map((entry) => {
    const actor = entry.actorId as unknown as { name?: string } | null;
    return {
      id: entry._id,
      action: entry.action,
      actorName: actor?.name ?? entry.actorRole,
      actorRole: entry.actorRole,
      changes: entry.changes,
      createdAt: entry.createdAt,
    };
  });

  return NextResponse.json({ timeline });
}

export const GET = withAuth(getHandler);
