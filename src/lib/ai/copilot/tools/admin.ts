import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import type { CopilotTool } from "../types";
import { escapeRegex } from "@/lib/security/sanitize";
import { searchTalent, type TalentSearchArgs } from "@/lib/jobseekers/talentSearch";

export const platformStatsTool: CopilotTool<Record<string, never>> = {
  name: "platform_stats",
  description: "Get real-time platform-wide KPIs: users, jobs by status, applications.",
  resource: "reports",
  action: "read",
  roles: ["admin"],
  mutates: false,
  parameters: {},
  summarize: () => "Get platform stats",
  execute: async () => {
    await connectDB();
    const [totalUsers, totalEmployers, totalSeekers, activeJobs, draftJobs, totalApplications] = await Promise.all([
      User.countDocuments(),
      Employer.countDocuments(),
      JobSeeker.countDocuments(),
      Job.countDocuments({ status: "active" }),
      Job.countDocuments({ status: "draft" }),
      Application.countDocuments(),
    ]);
    return {
      ok: true,
      message: "Platform stats retrieved.",
      data: { totalUsers, totalEmployers, totalSeekers, activeJobs, draftJobs, totalApplications },
    };
  },
};

export const jobApplicantStatsTool: CopilotTool<{ limit?: number }> = {
  name: "job_applicant_stats",
  description:
    "Platform-wide applicant counts per job posting (includes active jobs with zero applicants). Returns the most- and least-applied jobs. Use this — not searches — for most/fewest applicant questions.",
  resource: "reports",
  action: "read",
  roles: ["admin"],
  mutates: false,
  parameters: {
    limit: { type: "number", description: "How many jobs per list (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "Get per-job applicant stats",
  execute: async (args) => {
    await connectDB();
    // ponytail: loads all active jobs in one pass; paginate if job count grows past a few thousand
    const [jobs, agg] = await Promise.all([
      Job.find({ status: "active", deletedAt: { $exists: false } }).select("_id title").lean(),
      Application.aggregate([{ $group: { _id: "$jobId", count: { $sum: 1 } } }]),
    ]);
    const countByJob = new Map((agg as Array<{ _id: unknown; count: number }>).map((r) => [String(r._id), r.count]));
    const rows = jobs
      .map((j) => ({ jobId: String(j._id), title: j.title, applicants: countByJob.get(String(j._id)) ?? 0 }))
      .sort((a, b) => b.applicants - a.applicants);
    const n = Math.min(args.limit ?? 10, 25);
    return {
      ok: true,
      message: "Per-job applicant stats retrieved.",
      data: { totalActiveJobs: rows.length, most: rows.slice(0, n), fewest: rows.slice(-n).reverse() },
    };
  },
};

export const searchUsersTool: CopilotTool<{ query?: string; role?: string; limit?: number }> = {
  name: "search_users",
  description: "Look up platform accounts by person name or email, optionally filtered by role. Not for finding candidates by profession, skill or place — use find_candidates.",
  resource: "users",
  action: "read",
  roles: ["admin"],
  mutates: false,
  parameters: {
    query: { type: "string", description: "Name or email keyword", optional: true, maxLength: 200 },
    role: { type: "string", description: "Filter by role", optional: true, enum: ["admin", "super_agent", "agent", "employer", "job_seeker"] },
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "Search users",
  execute: async (args) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (args.role) filter.role = args.role;
    if (args.query) {
      const re = new RegExp(escapeRegex(args.query), "i");
      filter.$or = [{ name: re }, { email: re }];
    }
    const users = await User.find(filter)
      .select("name email role isActive createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();
    return {
      ok: true,
      message: `Found ${users.length} user(s).`,
      data: users.map((u) => ({ userId: String(u._id), name: u.name, email: u.email, role: u.role, active: u.isActive })),
    };
  },
};

export const findCandidatesTool: CopilotTool<TalentSearchArgs> = {
  name: "find_candidates",
  description:
    "Find and rank job seekers on the platform for a hiring brief (e.g. \"best 10 electrical engineers in Kuwait with 2 years\"). Matches the role against job titles, headline, skills and education, and ranks by role fit, location, experience and CV. Use this — never search_users — for any request about candidates, talent or job seekers by profession, skill, place or experience.",
  resource: "job_seekers",
  action: "read",
  roles: ["admin"],
  mutates: false,
  parameters: {
    role: { type: "string", description: "Job title or profession only, e.g. \"electrical engineer\" (no place or years)", optional: true, maxLength: 120 },
    skills: { type: "array", items: { type: "string" }, description: "Specific skills to prefer, e.g. [\"AutoCAD\", \"HVAC\"]", optional: true, maxItems: 10 },
    location: { type: "string", description: "Country or city: the candidate lives, worked or wants to work there", optional: true, maxLength: 80 },
    nationality: { type: "string", description: "Only when the user asks for a nationality", optional: true, maxLength: 60 },
    minYears: { type: "number", description: "Minimum years of experience (\"2 years experienced\" → 2)", optional: true, min: 0, max: 50 },
    maxYears: { type: "number", description: "Maximum years, only when the user caps it", optional: true, min: 0, max: 50 },
    hasCV: { type: "boolean", description: "Only candidates with an uploaded CV", optional: true },
    limit: { type: "number", description: "How many to return (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "Find candidates",
  execute: async (args) => {
    await connectDB();
    const result = await searchTalent({ ...args, limit: Math.min(args.limit ?? 10, 25) });
    const n = result.candidates.length;
    return {
      ok: true,
      message: n
        ? `Ranked ${n} of ${result.totalMatched} matching job seeker(s)${result.relaxed ? " (nobody had every role word, so partial title matches are shown)" : ""}. The user can export these with their CVs from the card.`
        : "No job seekers match that role. Suggest a broader role word or fewer filters.",
      data: { ...result, brief: args },
    };
  },
};

export const adminTools = [platformStatsTool, jobApplicantStatsTool, searchUsersTool, findCandidatesTool];
