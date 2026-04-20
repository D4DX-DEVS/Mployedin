import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

export const GET = withAuth(async (_req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const saProfile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("agentIds commissions")
    .lean();

  if (!saProfile) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const agentDocIds = saProfile.agentIds ?? [];
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

  const [totalAgents, totalLeads, totalPlacements, commissionAgg] = await Promise.all([
    User.countDocuments({ _id: { $in: agentUserIds }, role: "agent", isActive: true }),
    Lead.countDocuments({ agentId: { $in: agentUserIds } }),
    Placement.countDocuments({
      $or: [
        { agentId: { $in: agentUserIds } },
        { superAgentId: ctx.userId },
      ],
    }),
    Commission.aggregate([
      {
        $match: {
          $or: [
            { agentId: { $in: agentUserIds.map(String) } },
            { superAgentId: ctx.userId },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] },
          },
          paid: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] },
          },
        },
      },
    ]),
  ]);

  const commData = commissionAgg[0] ?? { total: 0, pending: 0, approved: 0, paid: 0 };

  return NextResponse.json({
    totalAgents,
    totalLeads,
    totalPlacements,
    totalCommissions: commData.total,
    commissionBreakdown: {
      pending: commData.pending,
      approved: commData.approved,
      paid: commData.paid,
    },
  });
}, { resource: "users", action: "read" });
