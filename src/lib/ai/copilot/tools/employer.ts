import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { resolveMeetingLink } from "@/lib/interviews/meetingLink";
import { notifyStatusChange, notifyInterviewSelected, notifyRejected, notifyInterviewScheduled } from "@/lib/notifications/trigger";
import type { CopilotTool } from "../types";

async function getEmployer(userId: string) {
  return Employer.findOne({ userId }).select("_id companyName").lean();
}

/** Loads an application + verifies it belongs to one of this employer's jobs. */
async function loadOwnedApplication(applicationId: string, employerId: unknown) {
  if (!isValidObjectId(applicationId)) return { application: null, error: "That doesn't look like a valid application ID." };
  const application = await Application.findById(applicationId).populate("jobId", "title employerId");
  if (!application) return { application: null, error: "Application not found." };
  const job = application.jobId as unknown as { employerId?: unknown; title?: string };
  if (String(job?.employerId) !== String(employerId)) return { application: null, error: "That application doesn't belong to one of your jobs." };
  return { application, error: null as string | null };
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

    const jobFilter: Record<string, unknown> = { employerId: employer._id, deletedAt: { $exists: false } };
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
    const jobs = await Job.find({ employerId: employer._id, deletedAt: { $exists: false } }).select("_id title").lean();
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

    const job = application.jobId as unknown as { title?: string };
    const jobTitle = job?.title ?? "the role";

    if (args.status === "rejected") {
      await notifyRejected(String(application.jobSeekerId), jobTitle, String(application._id)).catch(() => {});
    } else if (args.status === "selected") {
      await notifyInterviewSelected(String(application.jobSeekerId), jobTitle, employer.companyName ?? "the employer", String(application._id)).catch(() => {});
    } else {
      await notifyStatusChange(String(application.jobSeekerId), jobTitle, args.status, String(application._id)).catch(() => {});
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

export const employerTools = [searchCandidatesTool, pipelineStatsTool, updateApplicationStatusTool, scheduleInterviewTool];
