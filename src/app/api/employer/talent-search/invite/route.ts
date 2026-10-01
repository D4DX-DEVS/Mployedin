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
import { claimJobInvite, releaseJobInvite } from "@/lib/jobs/jobInvites";
import { checkRateLimitDual } from "@/lib/security/rateLimit";

const INVITE_RATE_LIMIT = { limit: 30, windowSec: 60, prefix: "rl-invite" };
import { canSourceForJob } from "@/lib/jobs/sourcingAccess";
import { z } from "zod";

const inviteSchema = z.object({
  jobSeekerId: z.string().refine(isValidObjectId, "Invalid candidate ID"),
  jobId: z.string().refine(isValidObjectId, "Invalid job ID"),
  message: z.string().max(1000).optional(),
});

/**
 * POST /api/employer/talent-search/invite (FG-4)
 *
 * Invite a sourced candidate to apply to an open job.
 * Sends an in-app + email notification linking the candidate straight to the
 * job. Guards: the job must belong to the caller's employer — or, for an
 * agent, to an employer assigned to them (any job for admin; super-agents hold
 * no applications:update, so withAuth refuses them) — and be active; the candidate must be
 * discoverable (profileVisibility "visible"); candidates who already applied,
 * or were already invited to this job, are not invited again.
 */
async function handler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  await connectDB();

  const { jobSeekerId, jobId, message } = await validateBody(req, inviteSchema);

  // Every invite sends an email; cap how fast one account can send them.
  const rl = await checkRateLimitDual(req, ctx.userId, INVITE_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many invitations. Please wait a minute." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const job = await Job.findById(jobId).select("title employerId agentId status").lean();
  // Same answer as someone else's job, so the response does not reveal which ids exist.
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let emp: { _id: unknown; companyName?: string } | null;
  if (ctx.role === "employer") {
    emp = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    if (String((job as { employerId: unknown }).employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden: job not owned by employer" }, { status: 403 });
    }
  } else {
    // Agents and admins invite on the job's employer's behalf.
    if (!(await canSourceForJob(ctx, job as { employerId?: unknown; agentId?: unknown }))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    emp = await Employer.findById((job as { employerId: unknown }).employerId).select("_id companyName").lean();
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

  // One invite per candidate per job, whoever sends it: the employer and their
  // agent working the same list must not mail the same person twice. Claimed
  // atomically BEFORE anything is sent, so a double-click or two people racing
  // each other cannot both get through.
  const claimId = await claimJobInvite({ jobId, jobSeekerId, invitedBy: ctx.userId, invitedByRole: ctx.role });
  if (!claimId) {
    return NextResponse.json({ error: "Candidate was already invited to this job" }, { status: 409 });
  }

  const jobTitle = (job as { title?: string }).title ?? "a role";
  const companyName = emp?.companyName ?? "An employer";
  const seekerUserId = String((seeker as { userId: unknown }).userId);

  try {
    await notify({
      actorId: ctx.userId,
      userId: seekerUserId,
      type: "application_invite",
      title: "You've been invited to apply",
      message: `${companyName} would like you to apply for "${jobTitle}".${message ? `\n\n"${message}"` : ""}`,
      link: `/${ctx.locale}/job-seeker/jobs/${jobId}`,
      sendEmail: true,
      metadata: { jobId, jobTitle, companyName },
    });
  } catch {
    // Nothing reached the candidate, so the invite must not count as sent:
    // release the claim and let the sender try again.
    await releaseJobInvite(claimId).catch(() => {});
    return NextResponse.json({ error: "The invitation could not be sent. Try again." }, { status: 502 });
  }

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
