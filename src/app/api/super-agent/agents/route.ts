import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Lead from "@/models/Lead";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");

  // Get all agents — for now all users with role agent
  // In a fuller impl, would filter by territory assignment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { role: "agent" };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("name email createdAt").lean();

  // Get lead stats per agent
  const agentIds = users.map((u) => u._id);
  const leads = await Lead.find({ agentId: { $in: agentIds } })
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
