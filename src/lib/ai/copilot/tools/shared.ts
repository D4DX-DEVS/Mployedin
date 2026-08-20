import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Commission from "@/models/Commission";
import SuperAgent from "@/models/SuperAgent";
import { isValidObjectId } from "@/lib/security/sanitize";
import { notifyCommissionApproved } from "@/lib/notifications/trigger";
import type { CopilotTool } from "../types";

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

export const sharedTools = [approveCommissionTool];
