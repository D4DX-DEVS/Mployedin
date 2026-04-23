import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { workflowUpdateSchema } from "@/lib/validators/misc";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const DEFAULT_SETTINGS = { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 };

// GET /api/jobs/[id]/workflow — get per-job workflow (falls back to employer default)
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId workflow").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // If job has its own workflow, return it
  if (job.workflow?.stages && job.workflow.stages.length > 0) {
    return NextResponse.json({
      stages: job.workflow.stages,
      settings: job.workflow.settings ?? DEFAULT_SETTINGS,
      source: "job",
    });
  }

  // Fall back to employer-level workflow
  const employer = await Employer.findById(job.employerId).select("workflow").lean();
  const stages = employer?.workflow?.stages;

  return NextResponse.json({
    stages: Array.isArray(stages) && stages.length > 0 ? stages : null,
    settings: employer?.workflow?.settings ?? DEFAULT_SETTINGS,
    source: "employer",
  });
}

// PATCH /api/jobs/[id]/workflow — save per-job workflow
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Ownership check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, workflowUpdateSchema);
  const { stages, settings } = body;

  job.workflow = { stages, settings: settings ?? DEFAULT_SETTINGS };
  await job.save();

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job.update_workflow",
    resource: "jobs",
    resourceId: String(job._id),
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
