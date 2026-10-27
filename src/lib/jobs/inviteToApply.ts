import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

export const inviteSchema = z.object({
  jobSeekerId: z.string().refine(isValidObjectId, "Invalid candidate ID"),
  jobId: z.string().refine(isValidObjectId, "Invalid job ID"),
  message: z.string().max(1000).optional(),
});

export interface InviteCtx {
  userId: string;
  role: string;
  locale: string;
}

export interface InviteJob {
  _id?: unknown;
  title?: string;
  employerId?: unknown;
  agentId?: unknown;
  status?: string;
}

/**
 * Decides whether this caller may invite for this job. Returns the company
 * the invite is sent in the name of, or the refusal to send back.
 */
export type InviteAuthorizer = (job: InviteJob) => Promise<{ companyName?: string } | NextResponse>;

/**
 * Invite one discoverable candidate to apply to one active job: an in-app
 * notification and an email linking straight to the job, sent through notify()
 * so the candidate's notification preferences and unsubscribe apply. Shared by
 * every role that sources candidates, so the consent and duplicate rules cannot
 * drift between them:
 *  - the candidate must allow employers to find them (profileVisibility "visible");
 *  - a candidate who already applied is not invited;
 *  - one invite per candidate per job, whoever sends it — claimed atomically
 *    before anything is sent, and released if nothing reached the candidate;
 *  - 30 invites a minute per sender.
 */
export async function inviteToApply(req: NextRequest, ctx: InviteCtx, authorize: InviteAuthorizer): Promise<NextResponse> {
  const { jobSeekerId, jobId, message } = await validateBody(req, inviteSchema);

  // Every invite sends an email; cap how fast one account can send them.
  const rl = await checkRateLimitDual(req, ctx.userId, INVITE_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many invitations. Please wait a minute." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const job = await Job.findById(jobId).select("title employerId agentId status").lean<InviteJob | null>();
  // Same answer as someone else's job, so the response does not reveal which ids exist.
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const authorized = await authorize(job);
  if (authorized instanceof NextResponse) return authorized;

  if (job.status !== "active") {
    return NextResponse.json({ error: "Job must be active to invite candidates" }, { status: 400 });
  }

  const seeker = await JobSeeker.findById(jobSeekerId).select("userId profileVisibility").lean<{ userId: unknown; profileVisibility?: string } | null>();
  if (!seeker) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (seeker.profileVisibility !== "visible") {
    return NextResponse.json({ error: "Candidate is not open to being contacted" }, { status: 400 });
  }

  if (await Application.exists({ jobId, jobSeekerId })) {
    return NextResponse.json({ error: "Candidate has already applied to this job" }, { status: 409 });
  }

  // The employer and their agent (or super agent) working the same list must
  // not mail the same person twice; a double-click or two people racing each
  // other cannot both get through.
  const claimId = await claimJobInvite({ jobId, jobSeekerId, invitedBy: ctx.userId, invitedByRole: ctx.role });
  if (!claimId) {
    return NextResponse.json({ error: "Candidate was already invited to this job" }, { status: 409 });
  }

  const jobTitle = job.title ?? "a role";
  const companyName = authorized.companyName ?? "An employer";

  try {
    await notify({
      actorId: ctx.userId,
      userId: String(seeker.userId),
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
