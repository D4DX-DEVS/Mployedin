import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const DEFAULT_WEIGHTS = {
  skills: 27, experience: 23, education: 13, location: 9,
  salary: 9, languages: 5, availability: 4, behaviorSignals: 10,
};

// GET /api/jobs/[id]/matching-weights — get per-job weights (falls back to employer default)
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId matchingWeights").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // If job has its own weights, return them
  if (job.matchingWeights && Object.keys(job.matchingWeights).length > 0) {
    return NextResponse.json({ weights: job.matchingWeights, source: "job" });
  }

  // Fall back to employer-level weights
  const employer = await Employer.findById(job.employerId).select("matchingWeights").lean();
  return NextResponse.json({
    weights: employer?.matchingWeights ?? DEFAULT_WEIGHTS,
    source: "employer",
  });
}

// PATCH /api/jobs/[id]/matching-weights — save per-job weights
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

  const body = await req.json();
  const { weights } = body;

  if (!weights || typeof weights !== "object") {
    return NextResponse.json({ error: "Weights object is required" }, { status: 400 });
  }

  // Validate total = 100
  const total = Object.values(weights as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  job.matchingWeights = weights;
  await job.save();

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job.update_matching_weights",
    resource: "jobs",
    resourceId: String(job._id),
    meta: { weights },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
