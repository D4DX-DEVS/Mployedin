import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import type { CopilotTool } from "../types";

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
  description: "Search platform users by name/email, optionally filtered by role.",
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
      const re = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
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

export const adminTools = [platformStatsTool, jobApplicantStatsTool, searchUsersTool];
