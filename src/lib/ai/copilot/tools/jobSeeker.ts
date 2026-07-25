import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import SavedJob from "@/models/SavedJob";
import User from "@/models/User";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { notifyApplicationReceived } from "@/lib/notifications/trigger";
import type { CopilotTool } from "../types";

async function getSeeker(userId: string) {
  return JobSeeker.findOne({ userId }).select("_id skills").lean();
}

export const searchJobsTool: CopilotTool<{ query?: string; country?: string; remoteOnly?: boolean; limit?: number }> = {
  name: "search_jobs",
  description: "Search live, active job postings on MPLOYEDIN by keyword, country, or remote-only. Use this before recommending or applying to a job so you have a real jobId.",
  resource: "jobs",
  action: "read",
  roles: ["job_seeker"],
  mutates: false,
  parameters: {
    query: { type: "string", description: "Keyword to match against job title/tags/skills", optional: true, maxLength: 200 },
    country: { type: "string", description: "Filter by country name", optional: true, maxLength: 100 },
    remoteOnly: { type: "boolean", description: "Only return remote jobs", optional: true },
    limit: { type: "number", description: "Max results (default 8)", optional: true, min: 1, max: 10 },
  },
  summarize: () => "Search live jobs",
  execute: async (args) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { status: "active" };
    if (args.query) {
      const re = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: re }, { tags: re }, { "requirements.skills": re }];
    }
    if (args.country) filter["location.country"] = new RegExp(`^${args.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (args.remoteOnly) filter["location.isRemote"] = true;

    const jobs = await Job.find(filter)
      .select("_id title location salary tags requirements category workMode")
      .sort({ createdAt: -1 })
      .limit(Math.min(args.limit ?? 8, 10))
      .lean();

    const rows = jobs.map((j) => ({
      jobId: String(j._id),
      title: j.title,
      location: j.location?.isRemote ? "Remote" : `${j.location?.city ?? "?"}, ${j.location?.country ?? "?"}`,
      salary: j.salary?.min && j.salary?.max ? `${j.salary.currency} ${j.salary.min}-${j.salary.max} ${j.salary.period ?? ""}` : undefined,
      skills: j.requirements?.skills?.slice(0, 6) ?? [],
    }));

    return {
      ok: true,
      message: rows.length ? `Found ${rows.length} matching job(s).` : "No active jobs matched that search.",
      data: rows,
    };
  },
};

export const myApplicationsTool: CopilotTool<{ status?: string; limit?: number }> = {
  name: "my_applications",
  description: "List the current user's own job applications with status.",
  resource: "applications",
  action: "read",
  roles: ["job_seeker"],
  mutates: false,
  parameters: {
    status: {
      type: "string",
      description: "Filter by status",
      optional: true,
      enum: ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"],
    },
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 20 },
  },
  summarize: () => "List my applications",
  execute: async (args, ctx) => {
    await connectDB();
    const seeker = await getSeeker(ctx.userId);
    if (!seeker) return { ok: false, message: "No job seeker profile found for this account." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { jobSeekerId: seeker._id };
    if (args.status) filter.status = args.status;
    const apps = await Application.find(filter)
      .select("jobId status appliedAt aiMatchScore")
      .sort({ appliedAt: -1 })
      .limit(Math.min(args.limit ?? 10, 20))
      .populate("jobId", "title")
      .lean();
    const rows = apps.map((a) => ({
      title: (a.jobId as unknown as { title?: string } | null)?.title ?? "Unknown job",
      status: a.status,
      appliedAt: a.appliedAt,
      matchScore: a.aiMatchScore,
    }));
    return { ok: true, message: `You have ${rows.length} application(s) matching this filter.`, data: rows };
  },
};

export const applyToJobTool: CopilotTool<{ jobId: string; coverLetter?: string }> = {
  name: "apply_to_job",
  description: "Submit an application to a specific job posting on behalf of the user. Requires a real jobId from search_jobs. This mutates data — the user must confirm before it runs.",
  resource: "applications",
  action: "create",
  roles: ["job_seeker"],
  mutates: true,
  parameters: {
    jobId: { type: "string", description: "The MongoDB _id of the job (from search_jobs)", maxLength: 32 },
    coverLetter: { type: "string", description: "Optional short cover letter", optional: true, maxLength: 5000 },
  },
  summarize: (args) => `Apply to job ${args.jobId}`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.jobId)) return { ok: false, message: "That doesn't look like a valid job ID." };
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return { ok: false, message: "No job seeker profile found for this account." };

    const job = await Job.findById(args.jobId).select("_id title status employerId agentId").lean();
    if (!job || job.status !== "active") return { ok: false, message: "That job is not currently accepting applications." };
    const { Employer } = await import("@/models/Employer");
    const empRecord = await Employer.findById(job.employerId).select("companyName").lean();

    const existing = await Application.findOne({ jobId: job._id, jobSeekerId: seeker._id }).select("_id").lean();
    if (existing) return { ok: false, message: `You have already applied to "${job.title}".` };

    const notes = [];
    if (args.coverLetter) {
      const user = await User.findById(ctx.userId).select("name").lean();
      notes.push({
        authorId: ctx.userId,
        authorName: user?.name ?? "Candidate",
        content: `Cover letter: ${sanitizeAIInput(args.coverLetter, 5000)}`,
        mentions: [],
        createdAt: new Date(),
      });
    }

    const application = await Application.create({
      jobSeekerId: seeker._id,
      jobId: job._id,
      employerId: job.employerId,
      agentId: job.agentId,
      status: "applied",
      appliedAt: new Date(),
      source: "direct",
      notes,
      statusHistory: [{ status: "applied", changedAt: new Date() }],
    });

    await Job.updateOne({ _id: job._id }, { $addToSet: { applicantIds: application._id } }).catch(() => {});
    await notifyApplicationReceived(
      ctx.userId,
      "",
      String(job.title ?? "the position"),
      empRecord?.companyName ?? "the employer",
      String(application._id)
    ).catch(() => {});

    return { ok: true, message: `Applied to "${job.title}".`, data: { applicationId: String(application._id) } };
  },
};

export const saveJobTool: CopilotTool<{ jobId: string }> = {
  name: "save_job",
  description: "Save/bookmark a job for the user to review later. Requires a real jobId from search_jobs.",
  resource: "jobs",
  action: "read",
  roles: ["job_seeker"],
  mutates: true,
  parameters: {
    jobId: { type: "string", description: "The MongoDB _id of the job to save", maxLength: 32 },
  },
  summarize: (args) => `Save job ${args.jobId}`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.jobId)) return { ok: false, message: "That doesn't look like a valid job ID." };
    const job = await Job.findById(args.jobId).select("_id title").lean();
    if (!job) return { ok: false, message: "Job not found." };
    await SavedJob.findOneAndUpdate(
      { jobSeekerId: ctx.userId, jobId: job._id },
      { $setOnInsert: { savedAt: new Date() } },
      { upsert: true }
    );
    return { ok: true, message: `Saved "${job.title}" to your list.` };
  },
};

export const withdrawApplicationTool: CopilotTool<{ applicationId: string; withdrawalReason?: string; withdrawalNote?: string }> = {
  name: "withdraw_application",
  description: "Withdraw one of the user's own job applications. Requires a real applicationId from my_applications.",
  resource: "applications",
  action: "update",
  roles: ["job_seeker"],
  mutates: true,
  parameters: {
    applicationId: { type: "string", description: "The application's MongoDB _id", maxLength: 32 },
    withdrawalReason: {
      type: "string",
      description: "Reason for withdrawing",
      optional: true,
      enum: ["accepted_elsewhere", "salary_too_low", "bad_experience", "too_slow_process", "changed_mind", "personal_reasons", "other"],
    },
    withdrawalNote: { type: "string", description: "Optional short note", optional: true, maxLength: 500 },
  },
  summarize: (args) => `Withdraw application ${args.applicationId}`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.applicationId)) return { ok: false, message: "That doesn't look like a valid application ID." };
    const seeker = await getSeeker(ctx.userId);
    if (!seeker) return { ok: false, message: "No job seeker profile found for this account." };

    const application = await Application.findById(args.applicationId).populate("jobId", "title");
    if (!application) return { ok: false, message: "Application not found." };
    if (String(application.jobSeekerId) !== String(seeker._id)) {
      return { ok: false, message: "That application doesn't belong to you." };
    }
    if (application.status === "withdrawn") {
      return { ok: false, message: "That application is already withdrawn." };
    }
    if (["hired", "rejected"].includes(application.status)) {
      return { ok: false, message: `That application is already ${application.status} and can't be withdrawn.` };
    }

    application.status = "withdrawn";
    application.statusHistory.push({ status: "withdrawn", changedAt: new Date() });
    if (args.withdrawalReason) application.withdrawalReason = args.withdrawalReason;
    if (args.withdrawalNote) application.withdrawalNote = sanitizeAIInput(args.withdrawalNote, 500);
    await application.save();

    const jobTitle = (application.jobId as unknown as { title?: string })?.title ?? "the role";
    return { ok: true, message: `Withdrew your application for "${jobTitle}".` };
  },
};

export const jobSeekerTools = [searchJobsTool, myApplicationsTool, applyToJobTool, saveJobTool, withdrawApplicationTool];
