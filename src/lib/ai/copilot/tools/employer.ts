import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Interview from "@/models/Interview";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { resolveMeetingLink } from "@/lib/interviews/meetingLink";
import { notifyStatusChange, notifyInterviewSelected, notifyRejected, notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { resolveHiringRulesForJob, type WorkflowSettingsCarrier } from "@/lib/hiring/workflowSettings";
import type { CopilotTool, CopilotToolPreview } from "../types";

async function getEmployer(userId: string) {
  return Employer.findOne({ userId }).select("_id companyName workflow").lean();
}

/** Loads an application + verifies it belongs to one of this employer's jobs. */
async function loadOwnedApplication(applicationId: string, employerId: unknown) {
  if (!isValidObjectId(applicationId)) return { application: null, error: "That doesn't look like a valid application ID." };
  const application = await Application.findById(applicationId).populate("jobId", "title employerId workflow");
  if (!application) return { application: null, error: "Application not found." };
  const job = application.jobId as unknown as { employerId?: unknown; title?: string };
  if (String(job?.employerId) !== String(employerId)) return { application: null, error: "That application doesn't belong to one of your jobs." };
  return { application, error: null as string | null };
}

interface Selection {
  job: { _id: unknown; title: string };
  rules: ReturnType<typeof resolveHiringRulesForJob>;
  count: number;
  minScore?: number;
  candidates: Array<{ applicationId: string; seekerUserId: string | null; name: string; score: number | null; note?: string }>;
  totalApplied: number;
  unscored: number;
}

async function selectTopCandidates(
  args: { jobId?: string; count?: number; minScore?: number },
  ctx: { userId: string; pageJobId?: string }
): Promise<{ ok: true; sel: Selection } | { ok: false; message: string }> {
  const employer = await getEmployer(ctx.userId);
  if (!employer) return { ok: false, message: "No employer profile found for this account." };

  // Resolve the job ID with precedence: args.jobId → ctx.pageJobId → single active job
  let job = null;

  if (args.jobId) {
    if (!isValidObjectId(args.jobId)) return { ok: false, message: "That doesn't look like a valid job ID." };
    job = await Job.findOne({ _id: args.jobId, employerId: employer._id, deletedAt: null })
      .select("_id title workflow status")
      .lean();
    if (!job) return { ok: false, message: "That job isn't one of your postings." };
  } else if (ctx.pageJobId) {
    job = await Job.findOne({ _id: ctx.pageJobId, employerId: employer._id, deletedAt: null })
      .select("_id title workflow status")
      .lean();
  }

  // If still no job, try to find a single active job
  if (!job) {
    const activeJobs = await Job.find({ employerId: employer._id, status: "active", deletedAt: null })
      .select("_id title")
      .lean();
    if (activeJobs.length === 1) {
      job = activeJobs[0];
    } else if (activeJobs.length > 1) {
      const titles = activeJobs.slice(0, 10).map((j) => `${(j as { title?: string }).title ?? "Untitled"} (jobId ${String(j._id)})`);
      return {
        ok: false,
        message: `Which job should I shortlist for? Your postings: ${titles.join(", ")}${activeJobs.length > 10 ? `, and ${activeJobs.length - 10} more` : ""}`,
      };
    } else {
      return { ok: false, message: "No active jobs found. Please create a job posting first." };
    }
  }

  const rules = resolveHiringRulesForJob(job, employer);
  const count = Math.min(100, Math.max(1, args.count ?? rules.shortlistTarget));

  // Query candidates ranked by score
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { jobId: job._id, status: "applied", aiMatchScore: { $ne: null } };
  if (args.minScore != null) filter.aiMatchScore.$gte = args.minScore;

  const candidates = await Application.find(filter)
    .sort({ aiMatchScore: -1, appliedAt: 1 })
    .limit(count)
    .select("_id jobSeekerId aiMatchScore matchStrengths appliedAt")
    .populate("jobSeekerId", "fullName userId")
    .lean();

  const [totalApplied, unscored] = await Promise.all([
    Application.countDocuments({ jobId: job._id, status: "applied" }),
    Application.countDocuments({ jobId: job._id, status: "applied", aiMatchScore: null }),
  ]);

  const mapped = candidates.map((a) => {
    const seeker = a.jobSeekerId as unknown as { fullName?: string; userId?: string } | null;
    return {
      applicationId: String(a._id),
      seekerUserId: seeker?.userId ?? null,
      name: seeker?.fullName ?? "Candidate",
      score: a.aiMatchScore,
      note: (a.matchStrengths?.[0] as string | undefined) ?? undefined,
    };
  });

  return {
    ok: true,
    sel: {
      job: { _id: job._id, title: (job as { title?: string }).title ?? "Untitled job" },
      rules,
      count,
      minScore: args.minScore,
      candidates: mapped,
      totalApplied,
      unscored,
    },
  };
}

export const searchCandidatesTool: CopilotTool<{ jobId?: string; status?: string; limit?: number }> = {
  name: "search_candidates",
  description: "List applicants to the employer's own job postings, optionally filtered by job or status, ranked by AI match score.",
  resource: "applications",
  action: "read",
  roles: ["employer"],
  mutates: false,
  parameters: {
    jobId: { type: "string", description: "Restrict to one job's applicants", optional: true, maxLength: 32 },
    status: {
      type: "string",
      description: "Filter by application status",
      optional: true,
      enum: ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"],
    },
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "Search my applicants",
  execute: async (args, ctx) => {
    await connectDB();
    const employer = await getEmployer(ctx.userId);
    if (!employer) return { ok: false, message: "No employer profile found for this account." };

    const jobFilter: Record<string, unknown> = { employerId: employer._id, deletedAt: null };
    if (args.jobId && isValidObjectId(args.jobId)) jobFilter._id = args.jobId;
    const jobIds = (await Job.find(jobFilter).select("_id").lean()).map((j) => j._id);
    if (!jobIds.length) return { ok: true, message: "No matching jobs found.", data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { jobId: { $in: jobIds } };
    if (args.status) filter.status = args.status;

    const apps = await Application.find(filter)
      .select("jobId jobSeekerId status aiMatchScore appliedAt")
      .sort({ aiMatchScore: -1, appliedAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .populate("jobId", "title")
      .populate("jobSeekerId", "fullName skills totalExperienceYears")
      .lean();

    const rows = apps.map((a) => {
      const seeker = a.jobSeekerId as unknown as { fullName?: string; skills?: string[]; totalExperienceYears?: number } | null;
      return {
        applicationId: String(a._id),
        candidate: seeker?.fullName ?? "Candidate",
        job: (a.jobId as unknown as { title?: string })?.title,
        status: a.status,
        matchScore: a.aiMatchScore,
        experienceYears: seeker?.totalExperienceYears,
        skills: seeker?.skills?.slice(0, 6) ?? [],
      };
    });
    return { ok: true, message: `Found ${rows.length} applicant(s).`, data: rows };
  },
};

export const pipelineStatsTool: CopilotTool<Record<string, never>> = {
  name: "pipeline_stats",
  description:
    "Get the employer's applicant counts by pipeline stage AND per job posting (includes jobs with zero applicants). Use this — not search_candidates — for questions like which job has the most/fewest applicants.",
  resource: "applications",
  action: "read",
  roles: ["employer"],
  mutates: false,
  parameters: {},
  summarize: () => "Get my hiring pipeline stats",
  execute: async (_args, ctx) => {
    await connectDB();
    const employer = await getEmployer(ctx.userId);
    if (!employer) return { ok: false, message: "No employer profile found for this account." };
    const jobs = await Job.find({ employerId: employer._id, deletedAt: null }).select("_id title").lean();
    if (!jobs.length) return { ok: true, message: "No jobs posted yet.", data: {} };
    const jobIds = jobs.map((j) => j._id);
    const [byStageAgg, byJobAgg] = await Promise.all([
      Application.aggregate([
        { $match: { jobId: { $in: jobIds } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: { jobId: { $in: jobIds } } },
        { $group: { _id: "$jobId", count: { $sum: 1 } } },
      ]),
    ]);
    const byStage: Record<string, number> = {};
    for (const row of byStageAgg as Array<{ _id: string; count: number }>) byStage[row._id] = row.count;
    const countByJob = new Map((byJobAgg as Array<{ _id: unknown; count: number }>).map((r) => [String(r._id), r.count]));
    const byJob = jobs.map((j) => ({
      jobId: String(j._id),
      title: (j as { title?: string }).title ?? "Untitled job",
      applicants: countByJob.get(String(j._id)) ?? 0,
    }));
    return { ok: true, message: "Pipeline stats retrieved.", data: { byStage, byJob } };
  },
};

export const updateApplicationStatusTool: CopilotTool<{ applicationId: string; status: string; rejectionReason?: string; note?: string }> = {
  name: "update_application_status",
  description: "Move an applicant to a new pipeline stage (shortlist, reject, mark selected/hired, etc). Requires a real applicationId from search_candidates. Rejecting requires a rejectionReason.",
  resource: "applications",
  action: "update",
  roles: ["employer"],
  mutates: true,
  parameters: {
    applicationId: { type: "string", description: "The application's MongoDB _id", maxLength: 32 },
    status: {
      type: "string",
      description: "New pipeline status",
      enum: ["shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected"],
    },
    rejectionReason: { type: "string", description: "Required when status is rejected", optional: true, maxLength: 500 },
    note: { type: "string", description: "Optional internal note to attach", optional: true, maxLength: 2000 },
  },
  summarize: (args) => `Move application ${args.applicationId} to "${args.status}"`,
  execute: async (args, ctx) => {
    await connectDB();
    const employer = await getEmployer(ctx.userId);
    if (!employer) return { ok: false, message: "No employer profile found for this account." };
    if (args.status === "rejected" && !args.rejectionReason) {
      return { ok: false, message: "A rejection reason is required to reject a candidate." };
    }

    const { application, error } = await loadOwnedApplication(args.applicationId, employer._id);
    if (error || !application) return { ok: false, message: error ?? "Application not found." };

    const prevStatus = application.status;
    application.status = args.status as typeof application.status;
    application.statusHistory.push({ status: args.status as typeof application.status, changedAt: new Date() });
    if (args.status === "rejected") application.rejectionReason = sanitizeAIInput(args.rejectionReason!, 500);
    if (args.note) {
      application.employerNotes = application.employerNotes
        ? `${application.employerNotes}\n${sanitizeAIInput(args.note, 2000)}`
        : sanitizeAIInput(args.note, 2000);
    }
    await application.save();

    const job = application.jobId as unknown as WorkflowSettingsCarrier & { title?: string };
    const jobTitle = job?.title ?? "the role";

    // Same contract as the applications PATCH route: the candidate is addressed
    // by their *user* id and only when the hiring rule says to tell them.
    const { notifyOnStageChange } = resolveHiringRulesForJob(job, employer);
    const seeker = notifyOnStageChange
      ? ((await JobSeeker.findById(application.jobSeekerId).select("userId").lean()) as { userId?: unknown } | null)
      : null;
    if (seeker?.userId) {
      const seekerUserId = String(seeker.userId);
      const appId = String(application._id);
      if (args.status === "rejected") {
        await notifyRejected(seekerUserId, jobTitle, appId).catch(() => {});
      } else if (args.status === "selected") {
        await notifyInterviewSelected(seekerUserId, jobTitle, employer.companyName ?? "the employer", appId).catch(() => {});
      } else {
        await notifyStatusChange(seekerUserId, jobTitle, args.status, appId).catch(() => {});
      }
    }

    return { ok: true, message: `Moved application from "${prevStatus}" to "${args.status}".` };
  },
};

export const scheduleInterviewTool: CopilotTool<{
  applicationId: string;
  scheduledAt: string;
  duration?: number;
  type?: string;
  location?: string;
}> = {
  name: "schedule_interview",
  description: "Schedule an interview for a candidate's application. scheduledAt must be a future ISO-8601 datetime. Requires a real applicationId from search_candidates.",
  resource: "interviews",
  action: "create",
  roles: ["employer"],
  mutates: true,
  parameters: {
    applicationId: { type: "string", description: "The application's MongoDB _id", maxLength: 32 },
    scheduledAt: { type: "string", description: "Future interview date/time, ISO-8601 (e.g. 2026-08-01T10:00:00Z)", maxLength: 40 },
    duration: { type: "number", description: "Duration in minutes (default 45)", optional: true, min: 15, max: 480 },
    type: { type: "string", description: "Interview type", optional: true, enum: ["video", "offline", "hybrid"] },
    location: { type: "string", description: "Physical location or notes (for offline/hybrid)", optional: true, maxLength: 500 },
  },
  summarize: (args) => `Schedule interview for application ${args.applicationId} at ${args.scheduledAt}`,
  execute: async (args, ctx) => {
    await connectDB();
    const employer = await getEmployer(ctx.userId);
    if (!employer) return { ok: false, message: "No employer profile found for this account." };

    const when = new Date(args.scheduledAt);
    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      return { ok: false, message: "The interview time must be a valid future date/time." };
    }

    const { application, error } = await loadOwnedApplication(args.applicationId, employer._id);
    if (error || !application) return { ok: false, message: error ?? "Application not found." };

    const job = application.jobId as unknown as { _id: unknown; title?: string };
    const type = (args.type as "video" | "offline" | "hybrid") ?? "video";
    const meetLink = resolveMeetingLink(type, undefined);

    const interview = await Interview.create({
      applicationId: application._id,
      jobId: job._id,
      jobSeekerId: application.jobSeekerId,
      employerId: employer._id,
      agentId: application.agentId,
      type,
      scheduledAt: when,
      duration: args.duration ?? 45,
      location: args.location ? sanitizeAIInput(args.location, 500) : undefined,
      meetLink,
      status: "scheduled",
    });

    application.status = "interview_scheduled";
    application.statusHistory.push({ status: "interview_scheduled", changedAt: new Date() });
    application.interviewIds.push(interview._id);
    await application.save();

    await notifyInterviewScheduled(
      String(application.jobSeekerId),
      job.title ?? "the role",
      when,
      args.location ?? meetLink ?? "TBD",
      String(interview._id)
    ).catch(() => {});

    return { ok: true, message: `Interview scheduled for ${when.toUTCString()}.`, data: { interviewId: String(interview._id) } };
  },
};

function nothingToShortlistMessage(sel: Selection): string {
  const base = `No scored applicants are waiting at the Applied stage for "${sel.job.title}".`;
  return sel.unscored ? `${base} ${sel.unscored} still being scored — try again in a minute.` : base;
}

export const shortlistTopCandidatesTool: CopilotTool<{ jobId?: string; count?: number; minScore?: number }> = {
  name: "shortlist_top_candidates",
  description:
    "Shortlist the best N applicants for ONE job in a single step: ranks candidates still at the Applied stage by AI match score and moves the top N to Shortlisted. Use this for 'shortlist the best 50', 'take the top 20 for this job', 'shortlist everyone above 70%' — never a series of update_application_status calls. jobId may be omitted when the user is viewing a job (see Current Job).",
  resource: "applications",
  action: "update",
  roles: ["employer"],
  mutates: true,
  parameters: {
    jobId: { type: "string", description: "Restrict to one job's applicants", optional: true, maxLength: 32 },
    count: { type: "number", description: "How many to shortlist. Default: the employer's shortlist target (usually 50).", optional: true, min: 1, max: 100 },
    minScore: { type: "number", description: "Only candidates at or above this match score", optional: true, min: 0, max: 100 },
  },
  summarize: (args) => {
    const scope = args.minScore != null ? ` scoring ${args.minScore}%+` : "";
    return args.count ? `Shortlist the top ${args.count} candidates${scope}` : `Shortlist the best candidates${scope}`;
  },
  preview: async (args, ctx): Promise<CopilotToolPreview> => {
    await connectDB();
    const result = await selectTopCandidates(args, ctx);
    if (!result.ok) return { summary: result.message, blocker: result.message, data: { count: 0 } };

    const { sel } = result;
    const n = sel.candidates.length;
    if (n === 0) {
      const message = nothingToShortlistMessage(sel);
      return { summary: message, blocker: message, data: { jobId: String(sel.job._id), count: 0, totalApplied: sel.totalApplied, unscored: sel.unscored } };
    }

    const minScoreStr = sel.minScore ? `, ${sel.minScore}%+` : "";
    const unscoredNote = sel.unscored ? ` ${sel.unscored} not yet scored are skipped.` : "";
    const summary = `${n} of ${sel.totalApplied} applicants at Applied will move to Shortlisted for "${sel.job.title}" (top by match score${minScoreStr}).${unscoredNote}`;

    return {
      summary,
      rows: sel.candidates.map((c) => ({ name: c.name, score: c.score, note: c.note })),
      data: { jobId: String(sel.job._id), count: n, totalApplied: sel.totalApplied, unscored: sel.unscored },
      // The job may have come from the page and the count from the employer's
      // target: pin both so confirming replays exactly what this card showed.
      resolvedArgs: { jobId: String(sel.job._id), count: sel.count },
    };
  },
  execute: async (args, ctx) => {
    await connectDB();
    const selectResult = await selectTopCandidates(args, ctx);
    if (!selectResult.ok) {
      return { ok: false, message: selectResult.message };
    }

    const { sel } = selectResult;
    if (!sel.candidates.length) return { ok: false, message: nothingToShortlistMessage(sel) };

    const ids = sel.candidates.map((c) => c.applicationId);
    const update = await Application.updateMany(
      { _id: { $in: ids }, status: "applied" },
      {
        $set: { status: "shortlisted" },
        $push: { statusHistory: { status: "shortlisted", changedAt: new Date(), changedBy: ctx.userId, note: "Shortlisted by Copilot (top N by match score)" } },
      }
    );

    const moved = update.modifiedCount ?? 0;

    // Notify candidates if enabled
    if (sel.rules.notifyOnStageChange) {
      await Promise.allSettled(
        sel.candidates
          .filter((c) => c.seekerUserId)
          .map((c) => notifyStatusChange(c.seekerUserId!, sel.job.title, "shortlisted", c.applicationId))
      );
    }

    const rows = sel.candidates.slice(0, 10).map((c) => ({ name: c.name, score: c.score, note: c.note }));
    return {
      ok: true,
      message: `Shortlisted ${moved} candidate${moved === 1 ? "" : "s"} for "${sel.job.title}".`,
      data: { jobId: String(sel.job._id), moved, candidates: rows },
    };
  },
};

export const employerTools = [searchCandidatesTool, pipelineStatsTool, updateApplicationStatusTool, scheduleInterviewTool, shortlistTopCandidatesTool];
