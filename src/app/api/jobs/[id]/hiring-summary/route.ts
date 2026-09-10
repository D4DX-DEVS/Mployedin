import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { isValidObjectId } from "@/lib/security/sanitize";
import { canAccessJob } from "@/lib/jobs/access";
import { ALL_APPLICATION_STATUSES, PIPELINE_STAGES } from "@/lib/hiring/pipeline";
import Job from "@/models/Job";
import Application, { type ApplicationStatus } from "@/models/Application";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import BackgroundCheck from "@/models/BackgroundCheck";
import Placement from "@/models/Placement";
import PosterGeneration from "@/models/PosterGeneration";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const count = (facet: Array<{ n?: number }> | undefined) => facet?.[0]?.n ?? 0;

/** Stages a candidate passes through before interviewing — "applied", "shortlisted". */
const STAGES_BEFORE_INTERVIEW = PIPELINE_STAGES.slice(0, PIPELINE_STAGES.indexOf("interview_scheduled"));

/**
 * GET /api/jobs/[id]/hiring-summary
 * One call per Job Workspace load: funnel counts for the header strip and the
 * "needs attention" signals for the Overview inbox. Every number is an
 * aggregate over the whole job, never over a page.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId agentId status vacancies views").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!(await canAccessJob(ctx, job))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobId = new mongoose.Types.ObjectId(params!.id);
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [[apps], [interviews], [offers], [checks], [placements], posters] = await Promise.all([
    Application.aggregate([
      { $match: { jobId } },
      { $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        unreviewed: [{ $match: { status: "applied", viewedByEmployerAt: null } }, { $count: "n" }],
      } },
    ]),
    Interview.aggregate([
      { $match: { jobId } },
      { $facet: {
        // Every interview still to be held or closed out, overdue ones included —
        // the tab count, so it matches the "Scheduled" chip on the Interviews tab.
        open: [{ $match: { status: { $in: ["scheduled", "confirmed"] } } }, { $count: "n" }],
        upcoming: [{ $match: { status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $gte: now } } }, { $count: "n" }],
        awaitingOutcome: [{ $match: { $or: [
          { status: "completed", outcome: { $in: [null, undefined] } },
          { status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $lt: now } },
        ] } }, { $count: "n" }],
        rescheduleRequests: [{ $match: { status: { $in: ["scheduled", "confirmed"] }, candidateResponse: "reschedule_requested" } }, { $count: "n" }],
        // Which applications have an interview in flight. The Overview funnel
        // needs this because an application can sit at another stage while an
        // interview is still open — someone moved the candidate back — and a
        // stage-only count then reads "Interviewing 0" beside "Interviews 1".
        openApplicationIds: [
          { $match: { status: { $in: ["scheduled", "confirmed"] } } },
          { $group: { _id: "$applicationId" } },
        ],
      } },
    ]),
    Offer.aggregate([
      { $match: { jobId } },
      { $facet: {
        pending: [{ $match: { status: "pending" } }, { $count: "n" }],
        expiringSoon: [{ $match: { status: "pending", expiresAt: { $lte: in48h } } }, { $count: "n" }],
        accepted: [{ $match: { status: "accepted" } }, { $count: "n" }],
      } },
    ]),
    BackgroundCheck.aggregate([
      { $match: { jobId } },
      { $facet: {
        inProgress: [{ $match: { status: { $in: ["pending", "in_progress"] } } }, { $count: "n" }],
        completed: [{ $match: { status: "completed" } }, { $count: "n" }],
      } },
    ]),
    Placement.aggregate([
      { $match: { jobId } },
      { $facet: {
        active: [{ $match: { status: { $in: ["active", null] } } }, { $count: "n" }],
        completed: [{ $match: { status: "completed" } }, { $count: "n" }],
      } },
    ]),
    PosterGeneration.countDocuments({ jobId }),
  ]);

  const statusCounts = Object.fromEntries(ALL_APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const row of (apps?.byStatus ?? []) as Array<{ _id: ApplicationStatus; count: number }>) {
    if (row._id in statusCounts) statusCounts[row._id] = row.count;
  }
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  // Candidates actually in interview: those at the stage, plus anyone holding an
  // open interview from another stage. Rejected and withdrawn are excluded —
  // their interview is moot even if the document is still open.
  const openInterviewAppIds = ((interviews?.openApplicationIds ?? []) as Array<{ _id: unknown }>)
    .map((row) => row._id)
    .filter(Boolean);
  // Only candidates who have been moved *back* count here. Anyone at selected,
  // offer or hired has finished with interviewing, so counting their still-open
  // interview made the same person read as both Interviewing and Offer.
  const interviewingElsewhere = openInterviewAppIds.length
    ? await Application.countDocuments({
        _id: { $in: openInterviewAppIds },
        status: { $in: STAGES_BEFORE_INTERVIEW },
      })
    : 0;
  const interviewingCandidates = statusCounts.interview_scheduled + interviewingElsewhere;

  return NextResponse.json({
    jobId: String(job._id),
    status: job.status,
    vacancies: job.vacancies ?? 1,
    views: job.views ?? 0,
    total,
    statusCounts,
    unreviewed: count(apps?.unreviewed),
    interviews: {
      open: count(interviews?.open),
      interviewingCandidates,
      upcoming: count(interviews?.upcoming),
      awaitingOutcome: count(interviews?.awaitingOutcome),
      rescheduleRequests: count(interviews?.rescheduleRequests),
    },
    offers: {
      pending: count(offers?.pending),
      expiringSoon: count(offers?.expiringSoon),
      accepted: count(offers?.accepted),
    },
    checks: { inProgress: count(checks?.inProgress), completed: count(checks?.completed) },
    placements: { active: count(placements?.active), completed: count(placements?.completed) },
    posters,
  });
}

export const GET = withAuth(getHandler);
