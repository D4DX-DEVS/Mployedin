import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { validateBody } from "@/lib/validators";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { z } from "zod";

const inviteSchema = z.object({
  jobSeekerId: z.string().refine(isValidObjectId, "Invalid candidate ID"),
  jobId: z.string().refine(isValidObjectId, "Invalid job ID"),
  message: z.string().max(1000).optional(),
});

/**
 * POST /api/employer/talent-search/invite (FG-4)
 *
 * Invite a sourced candidate to apply to one of the employer's open jobs.
 * Sends an in-app + email notification linking the candidate straight to the
 * job. Guards: the job must belong to the caller's employer and be active; the
 * candidate must be discoverable (profileVisibility "visible"); candidates who
 * already applied are not re-invited.
 */
async function handler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  await connectDB();

  const { jobSeekerId, jobId, message } = await validateBody(req, inviteSchema);

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const job = await Job.findById(jobId).select("title employerId status").lean();
  if (!job || String((job as { employerId: unknown }).employerId) !== String((emp as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden: job not owned by employer" }, { status: 403 });
  }
  if ((job as { status?: string }).status !== "active") {
    return NextResponse.json({ error: "Job must be active to invite candidates" }, { status: 400 });
  }

  const seeker = await JobSeeker.findById(jobSeekerId).select("userId profileVisibility").lean();
  if (!seeker) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if ((seeker as { profileVisibility?: string }).profileVisibility !== "visible") {
    return NextResponse.json({ error: "Candidate is not open to being contacted" }, { status: 400 });
  }

  // Don't invite candidates who already applied to this job.
  const existingApplication = await Application.exists({ jobId, jobSeekerId });
  if (existingApplication) {
    return NextResponse.json({ error: "Candidate has already applied to this job" }, { status: 409 });
  }

  const jobTitle = (job as { title?: string }).title ?? "a role";
  const companyName = (emp as { companyName?: string }).companyName ?? "An employer";
  const seekerUserId = String((seeker as { userId: unknown }).userId);

  await notify({
    userId: seekerUserId,
    type: "application_invite",
    title: "You've been invited to apply",
    message: `${companyName} would like you to apply for "${jobTitle}".${message ? `\n\n"${message}"` : ""}`,
    link: `/${ctx.locale}/job-seeker/jobs/${jobId}`,
    sendEmail: true,
    metadata: { jobId, jobTitle, companyName },
  }).catch(() => {
    /* non-blocking */
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "candidate.invite",
    resource: "applications",
    resourceId: jobId,
    meta: { jobSeekerId, jobId, jobTitle },
    req,
  });

  return NextResponse.json({ success: true });
}

export const POST = withAuth(handler, { resource: "applications", action: "update" });
