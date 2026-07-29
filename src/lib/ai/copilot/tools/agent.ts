import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { calculateLeadScore, deriveQualification } from "@/lib/leads/scoring";
import { autoRouteLead } from "@/lib/leads/autoRouter";
import type { CopilotTool } from "../types";

async function getAgentProfile(userId: string) {
  return Agent.findOne({ userId }).select("_id").lean();
}

export const myLeadsTool: CopilotTool<{ status?: string; limit?: number }> = {
  name: "my_leads",
  description: "List your own leads (agents) or your whole team's leads (super-agents), optionally filtered by pipeline status. Use this to get a real leadId before update_lead_status.",
  resource: "leads",
  action: "read",
  roles: ["agent", "super_agent"],
  mutates: false,
  parameters: {
    status: {
      type: "string",
      description: "Filter by lead status",
      optional: true,
      enum: ["new", "contacted", "interested", "negotiating", "converted", "lost"],
    },
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List my leads",
  execute: async (args, ctx) => {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (ctx.role === "super_agent") {
      const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
      const scope = await getSuperAgentScope(ctx.userId);
      const agentIds = scope?.effectiveAgentIds ?? [];
      if (!agentIds.length) return { ok: true, message: "No agents in your team yet.", data: [] };
      filter.agentId = { $in: agentIds };
    } else {
      const agent = await getAgentProfile(ctx.userId);
      if (!agent) return { ok: false, message: "No agent profile found for this account." };
      filter.agentId = agent._id;
    }
    if (args.status) filter.status = args.status;
    const leads = await Lead.find(filter)
      .select("companyName contactPerson status score qualificationLevel followUpAt")
      .sort({ createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();
    const rows = leads.map((l) => ({
      leadId: String(l._id),
      companyName: l.companyName,
      contactPerson: l.contactPerson,
      status: l.status,
      score: l.score,
      qualification: l.qualificationLevel,
      followUpAt: l.followUpAt,
      overdue: Boolean(l.followUpAt && new Date(l.followUpAt) < new Date() && !["converted", "lost"].includes(l.status)),
    }));
    return { ok: true, message: `Found ${rows.length} lead(s).`, data: rows };
  },
};

export const leadStatsTool: CopilotTool<Record<string, never>> = {
  name: "lead_stats",
  description:
    "Get the agent's total lead counts by pipeline status (includes statuses with zero leads) plus overdue follow-up count. Use this — not my_leads — for counting/ranking questions.",
  resource: "leads",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {},
  summarize: () => "Get my lead stats",
  execute: async (_args, ctx) => {
    await connectDB();
    const agent = await getAgentProfile(ctx.userId);
    if (!agent) return { ok: false, message: "No agent profile found for this account." };
    const [agg, overdueFollowUps] = await Promise.all([
      Lead.aggregate([{ $match: { agentId: agent._id } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Lead.countDocuments({ agentId: agent._id, followUpAt: { $lt: new Date() }, status: { $nin: ["converted", "lost"] } }),
    ]);
    const byStatus: Record<string, number> = { new: 0, contacted: 0, interested: 0, negotiating: 0, converted: 0, lost: 0 };
    for (const row of agg as Array<{ _id: string; count: number }>) byStatus[row._id] = row.count;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { ok: true, message: "Lead stats retrieved.", data: { total, byStatus, overdueFollowUps } };
  },
};

export const createLeadTool: CopilotTool<{
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  industry?: string;
  notes?: string;
}> = {
  name: "create_lead",
  description: "Create a new sales lead for an employer prospect.",
  resource: "leads",
  action: "create",
  roles: ["agent"],
  mutates: true,
  parameters: {
    companyName: { type: "string", description: "Prospect's company name", maxLength: 200 },
    contactPerson: { type: "string", description: "Contact person's name", maxLength: 100 },
    contactEmail: { type: "string", description: "Contact email", optional: true, maxLength: 200 },
    contactPhone: { type: "string", description: "Contact phone", optional: true, maxLength: 40 },
    country: { type: "string", description: "Country", optional: true, maxLength: 100 },
    city: { type: "string", description: "City", optional: true, maxLength: 100 },
    industry: { type: "string", description: "Industry", optional: true, maxLength: 100 },
    notes: { type: "string", description: "Notes about this lead", optional: true, maxLength: 2000 },
  },
  summarize: (args) => `Create lead for "${args.companyName}"`,
  execute: async (args, ctx) => {
    await connectDB();
    const agent = await getAgentProfile(ctx.userId);
    if (!agent) return { ok: false, message: "No agent profile found for this account." };

    const score = calculateLeadScore({
      status: "new",
      hasEmail: Boolean(args.contactEmail),
      hasPhone: Boolean(args.contactPhone),
      hasExpectedRevenue: false,
      hasIndustry: Boolean(args.industry),
      activityCount: 0,
    });

    let territoryId: unknown;
    let superAgentId: unknown;
    if (args.country) {
      const routeResult = await autoRouteLead({ country: args.country, city: args.city }).catch(() => null);
      if (routeResult) {
        territoryId = routeResult.territoryId;
        superAgentId = routeResult.superAgentId;
      }
    }

    const lead = await Lead.create({
      agentId: agent._id,
      superAgentId,
      companyName: sanitizeAIInput(args.companyName, 200),
      contactPerson: sanitizeAIInput(args.contactPerson, 100),
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      country: args.country,
      city: args.city,
      industry: args.industry,
      score,
      qualificationLevel: deriveQualification(score),
      status: "new",
      notes: args.notes ? sanitizeAIInput(args.notes, 2000) : undefined,
      territoryId,
      autoRouted: Boolean(territoryId),
      activityLog: [{ action: "created", timestamp: new Date() }],
    });

    return { ok: true, message: `Created lead for "${lead.companyName}".`, data: { leadId: String(lead._id) } };
  },
};

export const updateLeadStatusTool: CopilotTool<{ leadId: string; status: string; followUpInDays?: number; note?: string }> = {
  name: "update_lead_status",
  description: "Update a lead's pipeline status, optionally scheduling a follow-up and/or adding a note. Requires a real leadId from my_leads.",
  resource: "leads",
  action: "update",
  roles: ["agent", "super_agent"],
  mutates: true,
  parameters: {
    leadId: { type: "string", description: "The lead's MongoDB _id", maxLength: 32 },
    status: {
      type: "string",
      description: "New lead status",
      enum: ["new", "contacted", "interested", "negotiating", "converted", "lost"],
    },
    followUpInDays: { type: "number", description: "Schedule next follow-up N days from now", optional: true, min: 0, max: 90 },
    note: { type: "string", description: "Note to log against this lead", optional: true, maxLength: 2000 },
  },
  summarize: (args) => `Update lead ${args.leadId} to "${args.status}"`,
  execute: async (args, ctx) => {
    await connectDB();
    if (!isValidObjectId(args.leadId)) return { ok: false, message: "That doesn't look like a valid lead ID." };
    const lead = await Lead.findById(args.leadId);
    if (!lead) return { ok: false, message: "Lead not found." };

    if (ctx.role === "agent") {
      const agent = await getAgentProfile(ctx.userId);
      if (!agent || String(lead.agentId) !== String(agent._id)) {
        return { ok: false, message: "That lead doesn't belong to you." };
      }
    } else if (ctx.role === "super_agent") {
      const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
      const scope = await getSuperAgentScope(ctx.userId);
      const inScope = Boolean(
        scope && (
          String(lead.superAgentId ?? "") === String(scope.saProfileId) ||
          scope.effectiveAgentIds.map(String).includes(String(lead.agentId ?? ""))
        )
      );
      if (!inScope) return { ok: false, message: "That lead is outside your team's scope." };
    }

    const prevStatus = lead.status;
    lead.status = args.status as typeof lead.status;
    if (args.status === "converted" && prevStatus !== "converted") lead.convertedAt = new Date();
    if (args.followUpInDays !== undefined) {
      lead.followUpAt = new Date(Date.now() + args.followUpInDays * 24 * 60 * 60 * 1000);
    }
    if (args.note) {
      lead.notes = lead.notes ? `${lead.notes}\n${sanitizeAIInput(args.note, 2000)}` : sanitizeAIInput(args.note, 2000);
    }
    lead.activityLog.push({
      action: `status_changed:${prevStatus}->${args.status}`,
      note: args.note ? sanitizeAIInput(args.note, 2000) : undefined,
      timestamp: new Date(),
    });

    lead.score = calculateLeadScore({
      status: lead.status,
      hasEmail: Boolean(lead.contactEmail),
      hasPhone: Boolean(lead.contactPhone),
      hasExpectedRevenue: Boolean(lead.expectedRevenue),
      hasIndustry: Boolean(lead.industry),
      activityCount: lead.activityLog.length,
    });
    lead.qualificationLevel = deriveQualification(lead.score);

    await lead.save();
    return { ok: true, message: `Lead "${lead.companyName}" moved from "${prevStatus}" to "${args.status}".` };
  },
};

export const agentTools = [myLeadsTool, leadStatsTool, createLeadTool, updateLeadStatusTool];
