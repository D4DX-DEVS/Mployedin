import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import type { CopilotTool } from "../types";

export const teamPerformanceTool: CopilotTool<Record<string, never>> = {
  name: "team_performance",
  description: "Get per-agent lead/conversion/placement performance for the super-agent's managed team.",
  resource: "reports",
  action: "read",
  roles: ["super_agent"],
  mutates: false,
  parameters: {},
  summarize: () => "Get team performance",
  execute: async (_args, ctx) => {
    await connectDB();
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    if (!sa) return { ok: false, message: "No super-agent profile found for this account." };

    const agentIds = sa.agentIds ?? [];
    if (!agentIds.length) return { ok: true, message: "No agents currently managed.", data: [] };

    const [agentDocs, allLeads, placementCounts] = await Promise.all([
      Agent.find({ _id: { $in: agentIds } }).select("_id userId").lean(),
      Lead.find({ agentId: { $in: agentIds } }).select("agentId status").lean(),
      Placement.aggregate([{ $match: { agentId: { $in: agentIds } } }, { $group: { _id: "$agentId", count: { $sum: 1 } } }]),
    ]);

    const userIds = agentDocs.map((a) => a.userId).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select("name email").lean() : [];
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const placementMap = new Map((placementCounts as Array<{ _id: unknown; count: number }>).map((p) => [String(p._id), p.count]));

    const rows = agentDocs.map((a) => {
      const user = userMap.get(a.userId?.toString() ?? "");
      const agentLeads = allLeads.filter((l) => String(l.agentId) === String(a._id));
      const converted = agentLeads.filter((l) => l.status === "converted").length;
      return {
        name: user?.name ?? "Unknown",
        email: user?.email,
        leads: agentLeads.length,
        conversions: converted,
        conversionRate: agentLeads.length ? Math.round((converted / agentLeads.length) * 100) : 0,
        placements: placementMap.get(String(a._id)) ?? 0,
      };
    });

    return { ok: true, message: `Performance for ${rows.length} agent(s).`, data: rows };
  },
};

export const superAgentTools = [teamPerformanceTool];
