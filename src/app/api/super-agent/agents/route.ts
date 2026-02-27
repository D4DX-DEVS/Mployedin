import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Lead from "@/models/Lead";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");

  // Find the SuperAgent profile for the logged-in user
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const assignedAgentDocIds = saProfile?.agentIds ?? [];

  // Find the Agent documents for the assigned agents to get userIds
  let agentUserIds: string[] = [];
  if (assignedAgentDocIds.length > 0) {
    const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
    agentUserIds = agentDocs.map((a) => a.userId.toString());
  }

  // Build user filter — only agents that belong to this super agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { role: "agent", _id: { $in: agentUserIds } };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("name email createdAt").lean();

  // Get lead stats per agent
  const userIds = users.map((u) => u._id);
  const leads = await Lead.find({ agentId: { $in: userIds } })
    .select("agentId status convertedAt")
    .lean();

  const items = users.map((u) => {
    const agentLeads = leads.filter((l) => l.agentId?.toString() === u._id.toString());
    const converted = agentLeads.filter((l) => l.status === "converted").length;
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      leadsCount: agentLeads.length,
      conversions: converted,
      placements: 0, // would come from Placement model
      conversionRate: agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0,
    };
  });

  return NextResponse.json({ items, total: items.length });
}, { resource: "users", action: "read" });
