/**
 * Who may open a seeker's CV — one gate for every surface that shows or
 * exports it (the file stream, the Mployedin-CV JSON, the standardised CV), so
 * none can show more than another.
 *
 *  - job seeker: their own profile only (the id asked for is ignored)
 *  - admin: any seeker
 *  - employer: a seeker who applied to one of their jobs or sits in one of
 *    their talent pools (otherwise any employer could read any resume)
 *  - agent / super agent: a seeker whose profile they may open
 *    (canStaffAccessSeeker "view": owned, referred, or visible in their area;
 *    a hidden profile or a converted account is theirs only if they own it)
 *  - anyone else: no one
 *
 * With `applicationId` the application must also be this seeker's and, for an
 * employer, one of their own; its sent documents come back so the caller can
 * serve the CV that went with it. Staff views have no application, so for an
 * agent or super agent it is ignored.
 *
 * Server only. Callable with a plain `{ userId, role }` — the route's session
 * context is enough. Callers need not validate ids: malformed ones come back as 400.
 *
 * For many seekers and one actor (a bulk export), resolveCvActor once and pass
 * the result as `actor`: the per-actor lookups then run once, not once per seeker.
 */
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import TalentPool from "@/models/TalentPool";
import { isValidObjectId } from "@/lib/security/sanitize";
import { hasBuiltCvContent, type BuiltCvSource } from "@/lib/cv/seekerCvAvailability";
import { resolveStaffSeekerAccess, type SeekerOwnership } from "@/lib/jobSeeker/staffAccess";

/** The fields of a seeker's profile the CV surfaces need beyond the access decision. */
export interface CvAccessSeeker {
  _id?: unknown;
  userId: unknown;
  cv?: { originalUrl?: string };
  documents?: Array<{ category?: string; url?: string }>;
}

/** What was sent with the application named in `applicationId`. */
export interface CvAccessApplication {
  documents?: Array<{ url?: string; type?: string }>;
}

/** The part of the session context the gate reads. */
export interface CvAccessContext {
  userId: string;
  role: string;
}

/**
 * The per-actor half of the gate, resolved once by resolveCvActor. It is only
 * ever used for the actor it was resolved for (authorizeCvAccess checks), so it
 * cannot widen anyone's access.
 */
export interface CvActor {
  readonly userId: string;
  readonly role: string;
  /** Employer: the company's _id; null when the account has no employer profile, and for any other role. */
  readonly employerId: unknown;
  /** Agent and super agent: whether a seeker's profile is theirs to open; null for any other role. */
  readonly canViewSeeker: ((seeker: SeekerOwnership) => Promise<boolean>) | null;
}

export interface CvAccessOptions {
  /** The application whose CV is wanted (employer, admin and seeker views). */
  applicationId?: string | null;
  /** From resolveCvActor(ctx), to skip the per-actor lookups when checking many seekers. */
  actor?: CvActor;
}

export type CvAccessResult =
  | {
      ok: true;
      seeker: CvAccessSeeker;
      /** Set for an employer: the company the access was granted through. */
      employerId: unknown;
      /** Set when `applicationId` was given and applies; otherwise null. */
      application: CvAccessApplication | null;
    }
  | { ok: false; status: 400 | 403 | 404; error: string };

// Fresh objects each time: a caller that edits a denial must not change the next one.
const forbidden = (): CvAccessResult => ({ ok: false, status: 403, error: "Forbidden" });
const noCandidate = (): CvAccessResult => ({ ok: false, status: 404, error: "Candidate not found" });

const SEEKER_FIELDS = "userId cv documents";
/** What canStaffAccessSeeker decides on, read together with the CV fields. */
const STAFF_SEEKER_FIELDS = `${SEEKER_FIELDS} agentId referral regionCityId regionStateId profileVisibility roleArchivedAt`;

/**
 * The employer branch of the gate, as two query filters: the seeker applied to
 * one of the employer's jobs, or sits in one of the employer's talent pools. The
 * single-seeker gate (authorizeCvAccess) and the batched one
 * (employerAccessibleSeekerIds) both build their queries here, so they cannot
 * drift apart. One id is matched as is; several as `$in`.
 */
const matchSeekers = (seekers: string | readonly string[]) => (typeof seekers === "string" ? seekers : { $in: [...seekers] });
const employerApplicantFilter = (employerId: unknown, seekers: string | readonly string[]) => ({
  jobSeekerId: matchSeekers(seekers),
  employerId,
});
const employerPoolFilter = (employerId: unknown, seekers: string | readonly string[]) => ({
  employerId,
  "candidates.jobSeekerId": matchSeekers(seekers),
});

/**
 * Which of `seekerIds` this employer may open the CV of (the employer branch of
 * authorizeCvAccess, for a whole page of rows): one query on applications and
 * one on talent pools, whatever the number of seekers. `employerId` is the
 * actor's company (resolveCvActor); none means no one. Ids are the seekers'
 * profile ids, as strings.
 */
export async function employerAccessibleSeekerIds(employerId: unknown, seekerIds: readonly string[]): Promise<Set<string>> {
  const wanted = [...new Set(seekerIds.filter((id) => isValidObjectId(id)))];
  if (employerId == null || wanted.length === 0) return new Set();
  await connectDB();
  const [applied, pooled] = await Promise.all([
    Application.distinct("jobSeekerId", employerApplicantFilter(employerId, wanted)),
    // A pool lists all of its candidates, not only the ones asked about: keep the asked ones.
    TalentPool.distinct("candidates.jobSeekerId", employerPoolFilter(employerId, wanted)),
  ]);
  const asked = new Set(wanted);
  return new Set([...applied, ...pooled].map(String).filter((id) => asked.has(id)));
}

/**
 * Runs the lookups that depend only on who is asking, once: an employer's
 * company, a staff member's profile / scope (their area or territory is read
 * only when a seeker is not already theirs, then once). Nothing is read for a
 * job seeker, an admin or any other role.
 */
export async function resolveCvActor(ctx: CvAccessContext): Promise<CvActor> {
  const base = { userId: ctx.userId, role: ctx.role, employerId: null, canViewSeeker: null };
  if (ctx.role === "employer") {
    await connectDB();
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    return { ...base, employerId: employer?._id ?? null };
  }
  if (ctx.role === "agent" || ctx.role === "super_agent") {
    await connectDB();
    const canAccess = await resolveStaffSeekerAccess(ctx);
    return { ...base, canViewSeeker: (seeker) => canAccess(seeker, "view") };
  }
  return base;
}

/**
 * Callers must take the seeker's identity from `result.seeker._id`, never from
 * the requested `seekerId`: for a job seeker the id asked for is ignored and
 * their own profile is returned.
 */
export async function authorizeCvAccess(
  ctx: CvAccessContext,
  seekerId: string,
  { applicationId, actor: given }: CvAccessOptions = {},
): Promise<CvAccessResult> {
  if (!isValidObjectId(seekerId)) return { ok: false, status: 400, error: "Invalid candidate ID" };
  if (applicationId && !isValidObjectId(applicationId)) {
    return { ok: false, status: 400, error: "Invalid application ID" };
  }

  await connectDB();

  // An actor resolved for someone else is never trusted: it is resolved afresh.
  const actor = given && given.userId === ctx.userId && given.role === ctx.role ? given : await resolveCvActor(ctx);

  // Set for an employer: the application must be one of theirs.
  let employerId: unknown = null;

  let seeker: CvAccessSeeker | null;
  if (ctx.role === "job_seeker") {
    // A job seeker may only ever view their own CV; the id asked for is ignored.
    seeker = (await JobSeeker.findOne({ userId: ctx.userId }).select(SEEKER_FIELDS).lean()) as CvAccessSeeker | null;
  } else if (ctx.role === "admin") {
    // Platform operator — may view any candidate CV for support.
    seeker = (await JobSeeker.findById(seekerId).select(SEEKER_FIELDS).lean()) as CvAccessSeeker | null;
  } else if (ctx.role === "employer") {
    // An employer may view a candidate's CV only if that candidate applied to
    // one of the employer's jobs OR sits in one of the employer's talent pools.
    // Without this gate any employer could stream any seeker's resume (PII IDOR).
    if (actor.employerId == null) return forbidden();
    const [hasApplication, inTalentPool] = await Promise.all([
      Application.exists(employerApplicantFilter(actor.employerId, seekerId)),
      TalentPool.exists(employerPoolFilter(actor.employerId, seekerId)),
    ]);
    if (!hasApplication && !inTalentPool) return forbidden();
    employerId = actor.employerId;
    seeker = (await JobSeeker.findById(seekerId).select(SEEKER_FIELDS).lean()) as CvAccessSeeker | null;
  } else if (ctx.role === "super_agent" || ctx.role === "agent") {
    // Owner, 2026-10-14: a super agent sees the CV along with the profile;
    // 2026-10-30 the same for an agent (client: agents could not open a
    // seeker's profile or CV). Same scope as the profile itself, so no seeker
    // is newly exposed.
    const full = await JobSeeker.findById(seekerId).select(STAFF_SEEKER_FIELDS).lean();
    if (!full) return noCandidate();
    if (!actor.canViewSeeker || !(await actor.canViewSeeker(full as unknown as SeekerOwnership))) return forbidden();
    seeker = full as unknown as CvAccessSeeker;
  } else {
    return forbidden();
  }

  if (!seeker) return noCandidate();

  // Staff views have no application in hand; the parameter is for the
  // employer's applicant screens (and admin support, and the seeker's own).
  let application: CvAccessApplication | null = null;
  if (applicationId && ctx.role !== "agent" && ctx.role !== "super_agent") {
    application = (await Application.findOne({
      _id: applicationId,
      jobSeekerId: seeker._id ?? seekerId,
      ...(employerId ? { employerId } : {}),
    })
      .select("documents")
      .lean()) as CvAccessApplication | null;
    if (!application) return { ok: false, status: 404, error: "Application not found" };
  }

  return { ok: true, seeker, employerId, application };
}

// One rule for "a Standardised CV exists", shared with the client-side "View CV" buttons.
export { hasBuiltCvContent, type BuiltCvSource };
