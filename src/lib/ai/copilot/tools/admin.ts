import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import type { CopilotTool } from "../types";

export const platformStatsTool: CopilotTool<Record<string, never>> = {
  name: "platform_stats",
  description: "Get real-time platform-wide KPIs: users, jobs by status, applications, pending approvals.",
  resource: "reports",
  action: "read",
  roles: ["admin"],
  mutates: false,
  parameters: {},
  summarize: () => "Get platform stats",
  execute: async () => {
    await connectDB();
    const [totalUsers, totalEmployers, totalSeekers, activeJobs, pendingApprovalJobs, totalApplications] = await Promise.all([
      User.countDocuments(),
      Employer.countDocuments(),
      JobSeeker.countDocuments(),
      Job.countDocuments({ status: "active" }),
      Job.countDocuments({ "poster.approvalStatus": "pending" }),
      Application.countDocuments(),
    ]);
    return {
      ok: true,
      message: "Platform stats retrieved.",
      data: { totalUsers, totalEmployers, totalSeekers, activeJobs, pendingApprovalJobs, totalApplications },
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

export const adminTools = [platformStatsTool, searchUsersTool];
