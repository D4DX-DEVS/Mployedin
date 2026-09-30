import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { canAccessJob } from "@/lib/jobs/access";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import {
  RESCORE_BATCH_SIZE,
  listRescoreTargets,
  queueApplicantRescore,
  rescoreApplicantBatch,
} from "@/lib/inngest/rescoreJobApplicants";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

/** Applicants re-scored inside the request; the rest go to the queue. */
const INLINE_LIMIT = 300;

/**
 * POST /api/jobs/[id]/rescore — "Re-score all".
 *
 * A job edit queues the same work (rescore-job-applicants). This is the
 * employer's way to refresh scores on demand: "Score all" only scores
 * candidates that have no score yet, so after a criteria change a stale score
 * used to be stuck (client report 2026-09-30). Same canonical scorer, same
 * write; never rejects or shortlists anyone — those are arrival rules.
 */
async function postHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const jobId = params?.id;
  if (!isValidObjectId(jobId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(jobId).select("employerId agentId").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!(await canAccessJob(ctx, job as { employerId: unknown; agentId?: unknown }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = await listRescoreTargets(jobId!, INLINE_LIMIT + 1);
  const inline = ids.slice(0, INLINE_LIMIT);
  let rescored = 0;
  for (let i = 0; i < inline.length; i += RESCORE_BATCH_SIZE) {
    rescored += await rescoreApplicantBatch(jobId!, inline.slice(i, i + RESCORE_BATCH_SIZE));
  }
  const queuedRest = ids.length > INLINE_LIMIT;
  if (queuedRest) await queueApplicantRescore([jobId!]);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.rescore_applicants",
    resource: "jobs",
    resourceId: jobId,
    meta: { rescored, queuedRest },
  });

  return NextResponse.json({ rescored, total: ids.length, queuedRest });
}

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
