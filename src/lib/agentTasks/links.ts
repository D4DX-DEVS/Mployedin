import mongoose from "mongoose";
import Agent from "@/models/Agent";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import type { IAgentTaskLinks } from "@/models/AgentTask";
import { agentCanSeeEmployer, getAgentEmployerIds, getAgentSeekerArea } from "@/lib/auth/agentRestrictions";
import { seekerRegionMatch } from "@/lib/auth/regionMatch";
import { canStaffAccessSeeker, type SeekerOwnership } from "@/lib/jobSeeker/staffAccess";
import { escapeRegex, isValidObjectId } from "@/lib/security/sanitize";
import { disambiguateEmployerLabels } from "@/lib/employers/optionLabels";
import { TaskError } from "./assigned";

/**
 * The candidate, job and employer a task can point at. Who may link what is
 * the same rule the agent's own lists apply, so a task never becomes a way to
 * read a record the agent could not open anyway:
 *  - employer: getAgentEmployerIds (assigned, owned, or in their region)
 *  - job: a live job of one of those employers, or one the agent posted
 *  - candidate: a seeker canStaffAccessSeeker lets them view, or anyone who
 *    applied to one of those jobs
 * Admin (who may also keep agent tasks) sees everything.
 */

type Ctx = { userId: string; role: string };
type Id = mongoose.Types.ObjectId;

export type TaskLinkType = "candidate" | "job" | "employer";

export interface TaskLinkInput {
  candidateId?: string;
  jobId?: string;
  employerId?: string;
}

export interface TaskLinkOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Jobs only: whose job it is, so picking a job can fill in the employer. */
  employerId?: string;
  employerName?: string;
  /** Jobs only, and only when not live: a draft and a live copy of one job otherwise read the same. */
  status?: "draft" | "paused" | "closed" | "expired";
}

/** What a task row shows and links to. */
export interface ResolvedTaskLinks {
  candidate?: {
    id: string;
    name: string;
    /** Their application to the linked job, when there is one the agent can see. */
    applicationId?: string;
    /** Whether they applied to any job the agent can see (where the status actions live). */
    hasApplications: boolean;
  };
  job?: { id: string; title: string; deleted: boolean };
  employer?: { id: string; name: string };
}

const OPTION_LIMIT = 20;
const oid = (id: string): Id => new mongoose.Types.ObjectId(id);

/** Jobs the agent may see — the same filter /api/applications scopes by. `null` = no limit (admin). */
async function agentJobFilter(ctx: Ctx): Promise<Record<string, unknown> | null> {
  if (ctx.role === "admin") return null;
  const [agent, employerIds] = await Promise.all([
    Agent.findOne({ userId: ctx.userId }).select("_id").lean<{ _id: Id } | null>(),
    getAgentEmployerIds(ctx.userId),
  ]);
  // Default-deny: no agent profile means no jobs, never every job.
  if (!agent) return { _id: { $in: [] } };
  return {
    deletedAt: null,
    $or: [{ agentId: agent._id }, ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : [])],
  };
}

async function visibleJobIds(ctx: Ctx): Promise<Id[] | null> {
  const filter = await agentJobFilter(ctx);
  if (!filter) return null;
  const jobs = await Job.find(filter).select("_id").lean<{ _id: Id }[]>();
  return jobs.map((j) => j._id);
}

/**
 * Checks each picked id against what the agent may see and returns the links to
 * store. A job fills in its own employer; a job and an employer that don't
 * belong together are refused rather than silently corrected.
 */
export async function validateTaskLinks(ctx: Ctx, input: TaskLinkInput): Promise<IAgentTaskLinks | undefined> {
  const { candidateId, jobId } = input;
  let { employerId } = input;
  if (!candidateId && !jobId && !employerId) return undefined;
  for (const id of [candidateId, jobId, employerId]) {
    if (id && !isValidObjectId(id)) throw new TaskError(400, "Pick the record from the list.");
  }

  if (jobId) {
    const scope = await agentJobFilter(ctx);
    const job = await Job.findOne({ _id: jobId, ...(scope ?? { deletedAt: null }) })
      .select("employerId")
      .lean<{ employerId?: Id } | null>();
    if (!job) throw new TaskError(403, "You can't link that job. Pick one of the jobs you work on.");
    const jobEmployer = job.employerId ? String(job.employerId) : undefined;
    if (employerId && jobEmployer && employerId !== jobEmployer) {
      throw new TaskError(400, "That job belongs to a different employer. Pick the job's own employer or clear one of them.");
    }
    employerId = employerId ?? jobEmployer;
  }

  if (employerId && !jobId && ctx.role !== "admin" && !(await agentCanSeeEmployer(ctx.userId, employerId))) {
    throw new TaskError(403, "You can't link that employer. Pick one of the employers you work with.");
  }
  if (employerId && ctx.role === "admin" && !(await Employer.exists({ _id: employerId }))) {
    throw new TaskError(400, "That employer no longer exists.");
  }

  if (candidateId) {
    const seeker = await JobSeeker.findById(candidateId)
      .select("_id agentId referral regionCityId regionStateId profileVisibility roleArchivedAt")
      .lean<SeekerOwnership | null>();
    if (!seeker) throw new TaskError(400, "That candidate no longer exists.");
    const canView = await canStaffAccessSeeker(seeker, ctx, "view");
    if (!canView && !(await appliedToVisibleJob(ctx, candidateId, jobId))) {
      throw new TaskError(403, "You can't link that candidate. Pick someone in your area or who applied to your jobs.");
    }
  }

  return {
    ...(candidateId ? { candidateId: oid(candidateId) } : {}),
    ...(jobId ? { jobId: oid(jobId) } : {}),
    ...(employerId ? { employerId: oid(employerId) } : {}),
  };
}

async function appliedToVisibleJob(ctx: Ctx, candidateId: string, jobId?: string): Promise<boolean> {
  // A linked job was already checked as visible above, so one exists() settles it.
  if (jobId && (await Application.exists({ jobSeekerId: candidateId, jobId }))) return true;
  const jobIds = await visibleJobIds(ctx);
  if (jobIds && jobIds.length === 0) return false;
  return Boolean(await Application.exists({ jobSeekerId: candidateId, ...(jobIds ? { jobId: { $in: jobIds } } : {}) }));
}

/** Names, titles and the application to open, for one page of tasks. */
export async function resolveTaskLinks(
  ctx: Ctx,
  tasks: Array<{ _id: unknown; links?: IAgentTaskLinks | null }>,
): Promise<Map<string, ResolvedTaskLinks>> {
  const out = new Map<string, ResolvedTaskLinks>();
  const linked = tasks.filter((t) => t.links && (t.links.candidateId || t.links.jobId || t.links.employerId));
  if (linked.length === 0) return out;

  const ids = (key: keyof IAgentTaskLinks) => [...new Set(linked.map((t) => t.links?.[key]).filter(Boolean).map(String))];
  const candidateIds = ids("candidateId");
  const jobIds = ids("jobId");
  const employerIds = ids("employerId");

  const [seekers, jobs, employers, applications] = await Promise.all([
    candidateIds.length
      ? JobSeeker.find({ _id: { $in: candidateIds } }).select("userId").populate("userId", "name")
          .lean<Array<{ _id: Id; userId?: { name?: string } | null }>>()
      : [],
    jobIds.length ? Job.find({ _id: { $in: jobIds } }).select("title deletedAt").lean<Array<{ _id: Id; title?: string; deletedAt?: Date | null }>>() : [],
    employerIds.length ? Employer.find({ _id: { $in: employerIds } }).select("companyName").lean<Array<{ _id: Id; companyName?: string }>>() : [],
    candidateIds.length ? candidateApplications(ctx, candidateIds) : [],
  ]);

  const seekerName = new Map(seekers.map((s) => [String(s._id), s.userId?.name ?? ""]));
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const employerName = new Map(employers.map((e) => [String(e._id), e.companyName ?? ""]));

  for (const task of linked) {
    const l = task.links!;
    const resolved: ResolvedTaskLinks = {};
    if (l.candidateId && seekerName.has(String(l.candidateId))) {
      const cid = String(l.candidateId);
      const theirs = applications.filter((a) => String(a.jobSeekerId) === cid);
      const forJob = l.jobId ? theirs.find((a) => String(a.jobId) === String(l.jobId)) : undefined;
      resolved.candidate = {
        id: cid,
        name: seekerName.get(cid) ?? "",
        ...(forJob ? { applicationId: String(forJob._id) } : {}),
        hasApplications: theirs.length > 0,
      };
    }
    const job = l.jobId ? jobById.get(String(l.jobId)) : undefined;
    if (job) resolved.job = { id: String(job._id), title: job.title ?? "", deleted: Boolean(job.deletedAt) };
    if (l.employerId && employerName.has(String(l.employerId))) {
      resolved.employer = { id: String(l.employerId), name: employerName.get(String(l.employerId)) ?? "" };
    }
    out.set(String(task._id), resolved);
  }
  return out;
}

async function candidateApplications(ctx: Ctx, candidateIds: string[]) {
  const jobIds = await visibleJobIds(ctx);
  if (jobIds && jobIds.length === 0) return [];
  return Application.find({ jobSeekerId: { $in: candidateIds }, ...(jobIds ? { jobId: { $in: jobIds } } : {}) })
    .select("_id jobSeekerId jobId")
    .lean<Array<{ _id: Id; jobSeekerId: Id; jobId: Id }>>();
}

/** The picker's search: up to 20 records of one kind the agent may link. */
export async function searchTaskLinkOptions(
  ctx: Ctx,
  type: TaskLinkType,
  query: string,
  within: { jobId?: string; employerId?: string } = {},
): Promise<TaskLinkOption[]> {
  const q = query.trim().slice(0, 100);
  const rx = q ? { $regex: escapeRegex(q), $options: "i" } : null;
  const employerId = within.employerId && isValidObjectId(within.employerId) ? within.employerId : undefined;
  const jobId = within.jobId && isValidObjectId(within.jobId) ? within.jobId : undefined;

  if (type === "employer") {
    const visible = ctx.role === "admin" ? null : await getAgentEmployerIds(ctx.userId);
    if (visible && visible.length === 0) return [];
    const rows = await Employer.find({
      roleArchivedAt: null,
      ...(visible ? { _id: { $in: visible } } : {}),
      ...(rx ? { companyName: rx } : {}),
    })
      .select("companyName companyEmail city country")
      .sort({ companyName: 1 })
      .limit(OPTION_LIMIT)
      .lean<Array<{ _id: Id; companyName?: string; companyEmail?: string; city?: string; country?: string }>>();
    // Separate accounts can share a company name; a repeated one carries its email.
    const labels = disambiguateEmployerLabels(
      rows.map((e) => ({ value: String(e._id), label: e.companyName ?? "", hint: e.companyEmail })),
    );
    return rows.map((e, i) => ({
      value: String(e._id),
      label: labels[i].label,
      sublabel: [e.city, e.country].filter(Boolean).join(", ") || undefined,
    }));
  }

  if (type === "job") {
    const scope = await agentJobFilter(ctx);
    const rows = await Job.find({
      ...(scope ?? { deletedAt: null }),
      ...(employerId ? { employerId: oid(employerId) } : {}),
      ...(rx ? { title: rx } : {}),
    })
      .select("title employerId location.city createdAt status")
      .populate("employerId", "companyName companyEmail")
      .sort({ createdAt: -1 })
      .limit(OPTION_LIMIT)
      .lean<Array<{
        _id: Id;
        title?: string;
        location?: { city?: string };
        createdAt?: Date;
        status?: string;
        employerId?: { _id: Id; companyName?: string; companyEmail?: string } | null;
      }>>();
    // Same-named companies get their email; a job that still reads the same
    // as another (same title, company and city) gets the day it was posted.
    // Counted per employer account, not per job: two jobs of one company
    // don't make its name ambiguous.
    const employers = [...new Map(rows.filter((j) => j.employerId).map((j) => [String(j.employerId!._id), j.employerId!])).values()];
    const companyLabel = new Map(
      disambiguateEmployerLabels(employers.map((e) => ({ value: String(e._id), label: e.companyName ?? "", hint: e.companyEmail })))
        .map((o) => [o.value, o.label]),
    );
    const companies = rows.map((j) => ({ label: j.employerId ? companyLabel.get(String(j.employerId._id)) ?? "" : "" }));
    const sublabels = rows.map((j, i) => [companies[i].label, j.location?.city].filter(Boolean).join(" · "));
    const seen = new Map<string, number>();
    rows.forEach((j, i) => seen.set(`${j.title}\u0000${sublabels[i]}`, (seen.get(`${j.title}\u0000${sublabels[i]}`) ?? 0) + 1));
    return rows.map((j, i) => {
      const repeated = (seen.get(`${j.title}\u0000${sublabels[i]}`) ?? 0) > 1 && j.createdAt;
      const sublabel = repeated ? [sublabels[i], new Date(j.createdAt!).toISOString().slice(0, 10)].filter(Boolean).join(" · ") : sublabels[i];
      return {
        value: String(j._id),
        label: j.title ?? "",
        sublabel: sublabel || undefined,
        ...(j.status === "draft" || j.status === "paused" || j.status === "closed" || j.status === "expired" ? { status: j.status } : {}),
        ...(j.employerId?._id ? { employerId: String(j.employerId._id), employerName: companies[i].label } : {}),
      };
    });
  }

  const scope = await candidateScope(ctx, jobId);
  if (!scope) return [];
  let nameMatch: Record<string, unknown> = {};
  if (rx) {
    const users = await User.find({ role: "job_seeker", $or: [{ name: rx }, { email: rx }] })
      .select("_id")
      .limit(500)
      .lean<Array<{ _id: Id }>>();
    if (users.length === 0) return [];
    nameMatch = { userId: { $in: users.map((u) => u._id) } };
  }
  const rows = await JobSeeker.find({ ...scope, ...nameMatch })
    .select("userId")
    .populate("userId", "name email")
    .sort({ updatedAt: -1 })
    .limit(OPTION_LIMIT)
    .lean<Array<{ _id: Id; userId?: { name?: string; email?: string } | null }>>();
  return rows
    .filter((s) => s.userId)
    .map((s) => ({ value: String(s._id), label: s.userId?.name || s.userId?.email || "", sublabel: s.userId?.email || undefined }));
}

/**
 * Which seekers the candidate picker searches. With a job picked: that job's
 * applicants (the usual "follow up on this vacancy" case). Otherwise: the
 * seekers the agent's Job Seekers list shows, plus applicants to their jobs.
 * `null` = nothing to search.
 */
async function candidateScope(ctx: Ctx, jobId?: string): Promise<Record<string, unknown> | null> {
  if (jobId) {
    const jobScope = await agentJobFilter(ctx);
    if (!(await Job.exists({ _id: jobId, ...(jobScope ?? {}) }))) return null;
    const applicantIds = await Application.distinct("jobSeekerId", { jobId: oid(jobId) });
    return applicantIds.length ? { _id: { $in: applicantIds } } : null;
  }
  if (ctx.role === "admin") return { roleArchivedAt: null };

  const agent = await Agent.findOne({ userId: ctx.userId })
    .select("_id assignedJobSeekerIds assignedCityIds assignedStateIds superAgentId")
    .lean<{
      _id: Id;
      assignedJobSeekerIds?: Id[];
      assignedCityIds?: Id[];
      assignedStateIds?: Id[];
      superAgentId?: unknown;
    } | null>();
  if (!agent) return null;
  const [area, jobIds] = await Promise.all([getAgentSeekerArea(agent), visibleJobIds(ctx)]);
  const areaMatch = seekerRegionMatch(area);
  const applicantIds = jobIds?.length ? await Application.distinct("jobSeekerId", { jobId: { $in: jobIds } }) : [];
  const or: Record<string, unknown>[] = [{ agentId: agent._id }, { "referral.agentId": agent._id }];
  if (agent.assignedJobSeekerIds?.length) or.push({ _id: { $in: agent.assignedJobSeekerIds } });
  // An archived account stays with whoever owns it; the area never reaches it.
  if (areaMatch) or.push({ ...areaMatch, roleArchivedAt: null });
  if (applicantIds.length) or.push({ _id: { $in: applicantIds } });
  return { $or: or };
}

/** What the Copilot names when it links a task: free text, matched like the pickers search. */
export interface TaskLinkNames {
  candidate?: string;
  job?: string;
  employer?: string;
}

export type ResolvedLinkNames =
  | { ok: true; candidateId?: string; jobId?: string; employerId?: string; summary: string }
  | { ok: false; blocker: string };

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
/** A repeated company name carries " · email" (disambiguateEmployerLabels); match on the name. */
const baseName = (label: string) => label.split(" · ")[0];

export function pickLinkOption(
  kind: string,
  query: string,
  options: TaskLinkOption[],
): { option: TaskLinkOption } | { blocker: string } {
  const q = norm(query);
  const exact = options.filter((o) => norm(baseName(o.label)) === q || norm(o.sublabel) === q);
  const pool = exact.length > 0 ? exact : options;
  if (pool.length === 1) return { option: pool[0] };
  if (pool.length === 0) {
    return { blocker: `No ${kind} matching "${query}" among the records this agent works with. Ask the agent to check the name.` };
  }
  const list = pool.slice(0, 5).map((o) => (o.sublabel ? `${o.label} (${o.sublabel})` : o.label)).join("; ");
  return { blocker: `Several ${kind}s match "${query}": ${list}. Ask the agent which one they mean.` };
}

/**
 * Turns the names the Copilot was given into the ids a task stores, through the
 * same scoped search as the pickers (so it can only find what the agent may
 * link). Ambiguous or unknown names come back as a blocker for the model to ask
 * about. Employer first (narrows jobs), then the candidate, then the job — and
 * when several jobs share a title, the one the candidate applied to wins.
 */
export async function resolveTaskLinkNames(ctx: Ctx, names: TaskLinkNames): Promise<ResolvedLinkNames> {
  const parts: string[] = [];
  let employerId: string | undefined;
  let candidateId: string | undefined;
  let jobId: string | undefined;

  if (names.employer?.trim()) {
    const r = pickLinkOption("employer", names.employer, await searchTaskLinkOptions(ctx, "employer", names.employer));
    if ("blocker" in r) return { ok: false, blocker: r.blocker };
    employerId = r.option.value;
    parts.push(`employer ${r.option.label}`);
  }
  if (names.candidate?.trim()) {
    let options = await searchTaskLinkOptions(ctx, "candidate", names.candidate);
    const q = norm(names.candidate);
    const exact = options.filter((o) => norm(baseName(o.label)) === q || norm(o.sublabel) === q);
    const pool = exact.length ? exact : options;
    // "Risha" also matches "Noorisha": with a job named too, the one who applied to it wins.
    if (pool.length > 1 && names.job?.trim()) {
      const jobs = await searchTaskLinkOptions(ctx, "job", names.job, { employerId });
      if (jobs.length > 0) {
        const applied = new Set(
          (await Application.distinct("jobSeekerId", {
            jobId: { $in: jobs.map((o) => oid(o.value)) },
            jobSeekerId: { $in: pool.map((o) => oid(o.value)) },
          })).map(String),
        );
        const theirs = pool.filter((o) => applied.has(o.value));
        if (theirs.length > 0) options = theirs;
      }
    }
    const r = pickLinkOption("candidate", names.candidate, options);
    if ("blocker" in r) return { ok: false, blocker: r.blocker };
    candidateId = r.option.value;
    parts.unshift(`candidate ${r.option.label}`);
  }
  if (names.job?.trim()) {
    let options = await searchTaskLinkOptions(ctx, "job", names.job, { employerId });
    const exact = options.filter((o) => norm(o.label) === norm(names.job));
    const pool = exact.length ? exact : options;
    if (candidateId && pool.length > 1) {
      const applied = new Set(
        (await Application.find({ jobSeekerId: candidateId, jobId: { $in: pool.map((o) => o.value) } }).distinct("jobId")).map(String),
      );
      const theirs = pool.filter((o) => applied.has(o.value));
      if (theirs.length > 0) options = theirs;
    }
    const r = pickLinkOption("job", names.job, options);
    if ("blocker" in r) return { ok: false, blocker: r.blocker };
    jobId = r.option.value;
    employerId = employerId ?? r.option.employerId;
    parts.splice(candidateId ? 1 : 0, 0, `job ${r.option.label}${r.option.sublabel ? ` (${r.option.sublabel})` : ""}`);
    if (!names.employer?.trim() && r.option.employerName) parts.push(`employer ${r.option.employerName}`);
  }
  return { ok: true, candidateId, jobId, employerId, summary: parts.join(", ") };
}
