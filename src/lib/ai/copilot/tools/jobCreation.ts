import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { autoAssignAgent } from "@/lib/agents/autoAssign";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkFeatureGate } from "@/lib/subscription/featureGate";
import type { CopilotTool } from "../types";

/**
 * Job creation — usable by employer, agent, admin only. super_agent is
 * intentionally excluded: the permission matrix gives super_agent
 * jobs:["read","approve","export"] (no "create") everywhere in the app —
 * super-agents review/approve postings, they don't author them. Mirroring
 * POST /api/jobs's `allowed` role list and approval-status resolution exactly.
 */
export const createJobTool: CopilotTool<{
  title: string;
  description: string;
  category?: string;
  country?: string;
  city?: string;
  isRemote?: boolean;
  employmentType?: string;
  workMode?: string;
  skills?: string[];
  experienceMin?: number;
  experienceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  vacancies?: number;
  employerId?: string;
  status?: string;
}> = {
  name: "create_job",
  description:
    "Create a new job posting. Employers post for their own company; agents/admin must pass employerId (use search_employers first to find it). New postings from agents, or from employers with an involved agent, are routed to approval automatically — tell the user that up front rather than implying it goes live immediately.",
  resource: "jobs",
  action: "create",
  roles: ["employer", "agent", "admin"],
  mutates: true,
  parameters: {
    title: { type: "string", description: "Job title", maxLength: 200 },
    description: { type: "string", description: "Job description (min 20 chars) — write a proper 2-4 sentence description if the user only gave a rough idea", maxLength: 5000 },
    category: { type: "string", description: "Job category, e.g. Technology, Finance, Healthcare", optional: true, maxLength: 100 },
    country: { type: "string", description: "Country name", optional: true, maxLength: 100 },
    city: { type: "string", description: "City name", optional: true, maxLength: 100 },
    isRemote: { type: "boolean", description: "true if fully remote", optional: true },
    employmentType: { type: "string", description: "Employment type", optional: true, enum: ["full_time", "part_time", "contract", "internship", "freelance"] },
    workMode: { type: "string", description: "Work mode", optional: true, enum: ["onsite", "hybrid", "remote"] },
    skills: { type: "array", description: "Required skills", items: { type: "string" }, optional: true, maxItems: 20 },
    experienceMin: { type: "number", description: "Minimum years experience", optional: true, min: 0, max: 40 },
    experienceMax: { type: "number", description: "Maximum years experience", optional: true, min: 0, max: 40 },
    salaryMin: { type: "number", description: "Minimum salary", optional: true, min: 0 },
    salaryMax: { type: "number", description: "Maximum salary", optional: true, min: 0 },
    salaryCurrency: { type: "string", description: "Salary currency code, e.g. AED, USD, INR", optional: true, maxLength: 6 },
    vacancies: { type: "number", description: "Number of openings (default 1)", optional: true, min: 1, max: 100 },
    employerId: { type: "string", description: "Required for agent/admin — the employer's MongoDB _id (from search_employers)", optional: true, maxLength: 32 },
    status: { type: "string", description: "\"draft\" to save without publishing, \"active\" to publish (default)", optional: true, enum: ["draft", "active"] },
  },
  summarize: (args) => `Create job "${args.title}"${args.city ? ` in ${args.city}` : ""}`,
  execute: async (args, ctx) => {
    await connectDB();

    let employerId: string | undefined;
    let agentId: string | undefined;

    if (ctx.role === "employer") {
      const emp = await Employer.findOne({ userId: ctx.userId }).select("_id agentId").lean();
      if (!emp) return { ok: false, message: "No employer profile found for this account." };
      employerId = String(emp._id);
      if (emp.agentId) {
        agentId = String(emp.agentId);
      } else {
        const assigned = await autoAssignAgent({ employerId, jobCity: args.city }).catch(() => null);
        if (assigned) agentId = assigned;
      }

      const gate = await checkFeatureGate(ctx.userId, { type: "limit", feature: "activeJobs" }, "employer");
      if (!gate.allowed) {
        return { ok: false, message: "Your plan's active job limit has been reached — upgrade your subscription or close an existing job first." };
      }
    } else if (ctx.role === "agent") {
      const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
      if (!agent) return { ok: false, message: "No agent profile found for this account." };
      agentId = String(agent._id);
      if (!args.employerId) return { ok: false, message: "employerId is required — use search_employers to find the right one first." };
      if (!isValidObjectId(args.employerId)) return { ok: false, message: "That doesn't look like a valid employer ID." };
      if (!agent.assignedEmployerIds?.map(String).includes(args.employerId)) {
        return { ok: false, message: "That employer is not assigned to you." };
      }
      employerId = args.employerId;
    } else if (ctx.role === "admin") {
      if (args.employerId) {
        if (!isValidObjectId(args.employerId)) return { ok: false, message: "That doesn't look like a valid employer ID." };
        employerId = args.employerId;
      }
    }

    // ponytail: no approval queue — jobs go live on publish.
    const approvalStatus: "pending" | "approved" = "approved";
    const resolvedStatus: string = args.status ?? "active";

    const job = await Job.create({
      title: sanitizeAIInput(args.title, 200),
      description: sanitizeHtml(args.description),
      category: args.category,
      location: { country: args.country ?? "", city: args.city ?? "", isRemote: Boolean(args.isRemote) },
      requirements: {
        skills: args.skills ?? [],
        experienceMin: args.experienceMin ?? 0,
        experienceMax: args.experienceMax ?? 99,
      },
      salary: {
        min: args.salaryMin ?? 0,
        max: args.salaryMax ?? 0,
        currency: args.salaryCurrency ?? "USD",
        period: "monthly",
      },
      employmentType: args.employmentType,
      workMode: args.workMode,
      employerId,
      agentId,
      applicationMode: "manual",
      status: resolvedStatus,
      vacancies: args.vacancies ?? 1,
      tags: [],
      visibility: "public",
      "poster.approvalStatus": approvalStatus,
    });

    if (agentId) {
      const { incrementAgentCounter } = await import("@/lib/agentPerformance");
      incrementAgentCounter(String(agentId), "vacanciesPosted");
    }

    const statusNote = resolvedStatus === "draft" ? " Saved as a draft." : " It's now live.";

    return { ok: true, message: `Job "${job.title}" created.${statusNote}`, data: { jobId: String(job._id), status: resolvedStatus } };
  },
};

export const searchEmployersTool: CopilotTool<{ query?: string; limit?: number }> = {
  name: "search_employers",
  description: "Search employer companies by name to find an employerId — needed before creating a job on behalf of an employer.",
  resource: "employers",
  action: "read",
  roles: ["agent", "super_agent", "admin"],
  mutates: false,
  parameters: {
    query: { type: "string", description: "Company name keyword", optional: true, maxLength: 200 },
    limit: { type: "number", description: "Max results (default 8)", optional: true, min: 1, max: 20 },
  },
  summarize: () => "Search employers",
  execute: async (args, ctx) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    if (ctx.role === "agent") {
      const agent = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
      if (!agent?.assignedEmployerIds?.length) return { ok: true, message: "No employers assigned to you yet.", data: [] };
      filter._id = { $in: agent.assignedEmployerIds };
    } else if (ctx.role === "super_agent") {
      const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
      const scope = await getSuperAgentScope(ctx.userId);
      const agentIds = (scope?.effectiveAgentIds ?? []).map(String);
      if (!agentIds.length) return { ok: true, message: "No agents in your team yet.", data: [] };
      const agents = await Agent.find({ _id: { $in: agentIds } }).select("assignedEmployerIds").lean();
      const employerIds = agents.flatMap((a) => a.assignedEmployerIds ?? []);
      if (!employerIds.length) return { ok: true, message: "No employers in your team's scope yet.", data: [] };
      filter._id = { $in: employerIds };
    }

    if (args.query) {
      filter.companyName = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    const employers = await Employer.find(filter)
      .select("companyName verifiedAt")
      .limit(Math.min(args.limit ?? 8, 20))
      .lean();

    return {
      ok: true,
      message: `Found ${employers.length} employer(s).`,
      data: employers.map((e) => ({ employerId: String(e._id), companyName: e.companyName, verified: Boolean(e.verifiedAt) })),
    };
  },
};

export const jobCreationTools = [createJobTool, searchEmployersTool];
