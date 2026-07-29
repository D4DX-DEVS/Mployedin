import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import { Employer } from "@/models/Employer";
import Commission from "@/models/Commission";
import SuperAgent from "@/models/SuperAgent";
import { isValidObjectId } from "@/lib/security/sanitize";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { notifyCommissionApproved } from "@/lib/notifications/trigger";
import type { CopilotTool } from "../types";

/**
 * Job approval — usable by admin, super_agent, agent. Mirrors the ownership
 * checks in POST /api/admin/jobs/[id]/approve exactly (agents/super-agents can
 * only approve jobs within their own managed scope; admin has full access).
 */
export const approveJobTool: CopilotTool<{ jobId: string; approve: boolean }> = {
  name: "approve_job",
  description: "Approve or reject a pending job posting. Requires a real jobId. Only jobs within your management scope can be approved.",
  resource: "jobs",
  action: "approve",
  roles: ["admin", "super_agent", "agent"],
  mutates: true,
  parameters: {
    jobId: { type: "string", description: "The job's MongoDB _id", maxLength: 32 },
    approve: { type: "boolean", description: "true to approve (activates the job), false to reject (closes it)" },
  },
  summarize: (args) => `${args.approve ? "Approve" : "Reject"} job ${args.jobId}`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.jobId)) return { ok: false, message: "That doesn't look like a valid job ID." };
    const job = await Job.findById(args.jobId);
    if (!job) return { ok: false, message: "Job not found." };

    if (ctx.role === "agent") {
      const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
      if (!agentDoc) return { ok: false, message: "No agent profile found for this account." };
      const ownsJob = job.agentId && String(job.agentId) === String(agentDoc._id);
      const managesEmployer = job.employerId && agentDoc.assignedEmployerIds?.map(String).includes(String(job.employerId));
      if (!ownsJob && !managesEmployer) return { ok: false, message: "You can only approve jobs you manage." };
    } else if (ctx.role === "super_agent") {
      const scope = await getSuperAgentScope(ctx.userId);
      const agentIds = (scope?.effectiveAgentIds ?? []).map(String);
      const ownJob = !!job.agentId && agentIds.includes(String(job.agentId));
      let managesEmployer = false;
      if (!ownJob && job.employerId && agentIds.length > 0) {
        const emp = await Employer.findById(job.employerId).select("agentId").lean();
        managesEmployer = !!emp?.agentId && agentIds.includes(String(emp.agentId));
      }
      if (!ownJob && !managesEmployer) return { ok: false, message: "You can only approve jobs within your team's scope." };
    }

    job.set("poster.approvalStatus", args.approve ? "approved" : "rejected");
    job.status = args.approve ? "active" : "closed";
    await job.save();

    return { ok: true, message: `Job "${job.title}" ${args.approve ? "approved and activated" : "rejected"}.` };
  },
};

export const pendingJobsTool: CopilotTool<{ limit?: number }> = {
  name: "pending_jobs",
  description: "List job postings awaiting approval within your management scope — use this to get real jobIds for approve_job.",
  resource: "jobs",
  action: "read",
  roles: ["admin", "super_agent", "agent"],
  mutates: false,
  parameters: {
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List jobs awaiting approval",
  execute: async (args, ctx) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { "poster.approvalStatus": "pending", deletedAt: { $exists: false } };

    if (ctx.role === "agent") {
      const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
      if (!agentDoc) return { ok: false, message: "No agent profile found for this account." };
      filter.$or = [{ agentId: agentDoc._id }, { employerId: { $in: agentDoc.assignedEmployerIds ?? [] } }];
    } else if (ctx.role === "super_agent") {
      const scope = await getSuperAgentScope(ctx.userId);
      const agentIds = scope?.effectiveAgentIds ?? [];
      if (!agentIds.length) return { ok: true, message: "No agents in your team yet.", data: [] };
      const employers = await Employer.find({ agentId: { $in: agentIds } }).select("_id").lean();
      filter.$or = [{ agentId: { $in: agentIds } }, { employerId: { $in: employers.map((e) => e._id) } }];
    }

    const jobs = await Job.find(filter)
      .select("_id title status employerId createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .populate("employerId", "companyName")
      .lean();

    const rows = jobs.map((j) => ({
      jobId: String(j._id),
      title: j.title,
      company: (j.employerId as unknown as { companyName?: string } | null)?.companyName,
      submittedAt: j.createdAt,
    }));
    return { ok: true, message: `Found ${rows.length} job(s) awaiting approval.`, data: rows };
  },
};

/**
 * Commission approval — admin (any) and super_agent (own team's commissions only),
 * mirroring PATCH /api/commissions/[id] canAccessCommission().
 */
export const approveCommissionTool: CopilotTool<{ commissionId: string }> = {
  name: "approve_commission",
  description: "Approve a pending commission for payout. Requires a real commissionId.",
  resource: "commissions",
  action: "approve",
  roles: ["admin", "super_agent"],
  mutates: true,
  parameters: {
    commissionId: { type: "string", description: "The commission's MongoDB _id", maxLength: 32 },
  },
  summarize: (args) => `Approve commission ${args.commissionId}`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.commissionId)) return { ok: false, message: "That doesn't look like a valid commission ID." };
    const commission = await Commission.findById(args.commissionId);
    if (!commission) return { ok: false, message: "Commission not found." };

    if (ctx.role === "super_agent") {
      const superAgent = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
      const owns = Boolean(superAgent?._id && String(commission.superAgentId ?? "") === String(superAgent._id));
      if (!owns) return { ok: false, message: "That commission is outside your team's scope." };
    }

    if (commission.status === "approved" || commission.status === "paid") {
      return { ok: false, message: `Commission is already ${commission.status}.` };
    }

    commission.status = "approved";
    commission.approvedBy = ctx.userId as unknown as typeof commission.approvedBy;
    commission.approvedAt = new Date();
    await commission.save();

    if (commission.agentId) {
      const agent = await Agent.findById(commission.agentId).select("userId").lean();
      if (agent?.userId) {
        await notifyCommissionApproved(String(agent.userId), "agent", commission.amount, commission.currency).catch(() => {});
      }
    }

    return { ok: true, message: `Commission of ${commission.currency} ${commission.amount} approved.` };
  },
};

export const sharedTools = [approveJobTool, pendingJobsTool, approveCommissionTool];
