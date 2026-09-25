import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import User from "@/models/User";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { notifyApplicationReceived } from "@/lib/notifications/trigger";
import type { CopilotTool, CopilotToolContext } from "../types";
import { escapeRegex } from "@/lib/security/sanitize";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { buildRecommendedJobQuery, RECOMMENDATION_POOL_SIZE, RECOMMENDED_JOB_SELECT } from "@/lib/jobRecommendations";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";
import { routing } from "@/i18n/routing";

const CV_TEXT_LIMIT = 2500;

async function getSeeker(userId: string) {
  return JobSeeker.findOne({ userId }).select("_id skills").lean();
}

interface JobSummarySource {
  _id: unknown;
  title?: string;
  location?: { isRemote?: boolean; city?: string; country?: string };
  salary?: { min?: number; max?: number; currency?: string; period?: string };
}

function jobLocation(job: JobSummarySource): string {
  return job.location?.isRemote ? "Remote" : `${job.location?.city ?? "?"}, ${job.location?.country ?? "?"}`;
}

function jobSalary(job: JobSummarySource): string | undefined {
  const s = job.salary;
  return s?.min && s?.max ? `${s.currency} ${s.min}-${s.max} ${s.period ?? ""}` : undefined;
}

/**
 * The seeker's own job page, where Easy Apply lives. Built here so the model
 * copies a real link instead of guessing a route; the locale follows the page
 * the user is on, which can differ from the one stored on their session.
 */
function seekerJobUrl(ctx: CopilotToolContext, jobId: string): string {
  const pageLocale = ctx.currentPage?.split("/")[1];
  const locale = routing.locales.find((l) => l === pageLocale) ?? ctx.locale;
  return `/${locale}/job-seeker/jobs/${jobId}`;
}

async function appliedJobIds(jobSeekerId: unknown, jobIds?: unknown[]): Promise<unknown[]> {
  const apps = await Application.find({
    jobSeekerId,
    status: { $ne: "withdrawn" },
    ...(jobIds ? { jobId: { $in: jobIds } } : {}),
  })
    .select("jobId")
    .lean();
  return apps.map((a) => a.jobId);
}

export const myProfileTool: CopilotTool<Record<string, never>> = {
  name: "my_profile",
  description:
    "Read the current user's own job-seeker profile: headline, skills, years of experience, recent job titles, job preferences (roles, countries, work mode, salary) and the text of their uploaded CV. Call this when the user asks about their profile or CV, instead of asking them to repeat information it already holds.",
  resource: "job_seekers",
  action: "read",
  roles: ["job_seeker"],
  mutates: false,
  parameters: {},
  summarize: () => "Read my profile",
  execute: async (_args, ctx) => {
    await connectDB();
    const seeker = await JobSeeker.findOne({ userId: ctx.userId })
      .select(
        "headline summary skills totalExperienceYears industry experience preferredRoles preferredCountries preferredLocations preferredJobType preferredSalary availabilityStatus profileCompleteness cv.rawText"
      )
      .lean();
    if (!seeker) return { ok: false, message: "No job seeker profile found for this account." };
    const cvText = seeker.cv?.rawText?.trim();

    return {
      ok: true,
      message: "Loaded your profile.",
      data: {
        headline: seeker.headline,
        summary: seeker.summary,
        skills: seeker.skills ?? [],
        yearsOfExperience: seeker.totalExperienceYears,
        industry: seeker.industry,
        recentTitles: (seeker.experience ?? []).slice(0, 3).map((e: { title?: string }) => e.title),
        preferredRoles: seeker.preferredRoles ?? [],
        preferredCountries: seeker.preferredCountries ?? [],
        preferredLocations: seeker.preferredLocations ?? [],
        preferredJobType: seeker.preferredJobType,
        preferredSalary: seeker.preferredSalary,
        availability: seeker.availabilityStatus,
        profileCompleteness: seeker.profileCompleteness,
        cv: cvText ? { uploaded: true, text: sanitizeAIInput(cvText, CV_TEXT_LIMIT) } : { uploaded: false },
      },
    };
  },
};

export const searchJobsTool: CopilotTool<{ query?: string; country?: string; remoteOnly?: boolean; limit?: number }> = {
  name: "search_jobs",
  description: "Search live, active job postings on MPLOYEDIN by keyword, country, or remote-only — for when the user names what to look for. For \"jobs that match me\" / \"relevant jobs\" use recommended_jobs instead. Each row says whether the user already applied (alreadyApplied) and has a url to the job page where they can apply.",
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
  execute: async (args, ctx) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { status: "active" };
    if (args.query) {
      const re = new RegExp(escapeRegex(args.query), "i");
      filter.$or = [{ title: re }, { tags: re }, { "requirements.skills": re }];
    }
    if (args.country) filter["location.country"] = new RegExp(`^${escapeRegex(args.country)}$`, "i");
    if (args.remoteOnly) filter["location.isRemote"] = true;

    const jobs = await Job.find(filter)
      .select("_id title location salary tags requirements category workMode")
      .sort({ createdAt: -1 })
      .limit(Math.min(args.limit ?? 8, 10))
      .lean();

    const seeker = jobs.length ? await getSeeker(ctx.userId) : null;
    const applied = new Set(
      seeker ? (await appliedJobIds(seeker._id, jobs.map((j) => j._id))).map(String) : [],
    );

    const rows = jobs.map((j) => ({
      jobId: String(j._id),
      title: j.title,
      location: jobLocation(j),
      salary: jobSalary(j),
      skills: j.requirements?.skills?.slice(0, 6) ?? [],
      alreadyApplied: applied.has(String(j._id)),
      url: seekerJobUrl(ctx, String(j._id)),
    }));

    return {
      ok: true,
      message: rows.length ? `Found ${rows.length} matching job(s).` : "No active jobs matched that search.",
      data: rows,
    };
  },
};

export const recommendedJobsTool: CopilotTool<{ limit?: number }> = {
  name: "recommended_jobs",
  description:
    "The user's recommended jobs: every live job scored against their whole profile AND uploaded CV (skills, experience, preferred roles, countries, pay) by the same matching engine as the Recommended Jobs page, with jobs they already applied to left out. Call this for \"jobs that match me\", \"relevant jobs\" or \"what should I apply to\". Each row has a matchScore (0-100) and a url to the job page, where the user can apply. When nothing is recommended, limitingFactor says why (e.g. no_location = no preferred country set).",
  resource: "jobs",
  action: "read",
  roles: ["job_seeker"],
  mutates: false,
  parameters: {
    limit: { type: "number", description: "Max results (default 5)", optional: true, min: 1, max: 10 },
  },
  summarize: () => "Match jobs to your profile and CV",
  execute: async (args, ctx) => {
    await connectDB();
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select(SEEKER_MATCH_FIELDS).lean();
    if (!seeker) return { ok: false, message: "No job seeker profile found for this account." };

    // Same pool, engine and threshold as /api/job-seeker/recommended-jobs, so
    // Copilot never recommends what the Recommended Jobs page would not.
    const candidateJobs = await Job.find(
      buildRecommendedJobQuery({
        preferredCountries: seeker.preferredCountries,
        excludeJobIds: await appliedJobIds(seeker._id),
      }),
    )
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECOMMENDATION_POOL_SIZE)
      .select(RECOMMENDED_JOB_SELECT)
      .populate("employerId", "companyName")
      .lean();

    const pool = await scoreSeekerPool(await effectiveSeekerProfile(ctx.userId, seeker), candidateJobs);
    const rows = pool.jobs
      .filter((j) => j.recommended)
      .slice(0, Math.min(args.limit ?? 5, 10))
      .map((j) => ({
        jobId: String(j._id),
        title: j.title,
        company: (j.employerId as { companyName?: string } | null)?.companyName,
        location: jobLocation(j),
        salary: jobSalary(j),
        matchScore: j.matchScore,
        matchedSkills: j.matchedSkills.slice(0, 4),
        url: seekerJobUrl(ctx, String(j._id)),
      }));

    return {
      ok: true,
      message: rows.length
        ? `Found ${pool.recommendedCount} recommended job(s).`
        : "No job clears the match threshold for this profile yet.",
      data: {
        jobs: rows,
        totalMatches: pool.recommendedCount,
        hasCv: Boolean(seeker.cv?.rawText?.trim()),
        limitingFactor: pool.limitingFactor ?? null,
      },
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
      .select("jobId status appliedAt aiMatchScore seekerMatchScore")
      .sort({ appliedAt: -1 })
      .limit(Math.min(args.limit ?? 10, 20))
      .populate("jobId", "title")
      .lean();
    const rows = apps.map((a) => ({
      title: (a.jobId as unknown as { title?: string } | null)?.title ?? "Unknown job",
      status: a.status,
      appliedAt: a.appliedAt,
      // The seeker's own number, not an employer's re-weighted ranking.
      matchScore: a.seekerMatchScore ?? a.aiMatchScore,
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

export const jobSeekerTools = [
  myProfileTool,
  recommendedJobsTool,
  searchJobsTool,
  myApplicationsTool,
  applyToJobTool,
  withdrawApplicationTool,
];
