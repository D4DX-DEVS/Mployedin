import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import User from "@/models/User";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

// GET /api/employers/agents — list agents assigned to this employer
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const emp = await Employer.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!emp) {
    return NextResponse.json({ agents: [] });
  }

  // Find agents who have this employer in their assignedEmployerIds
  const agents = await Agent.find({
    assignedEmployerIds: emp._id,
  })
    .select("userId")
    .lean();

  // Get user names for the agents
  const userIds = agents.map((a) => a.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name")
    .lean();

  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const result = agents.map((a) => ({
    _id: String(a._id),
    name: (userMap.get(String(a.userId)) as { name?: string })?.name ?? "Agent",
  }));

  return NextResponse.json({ agents: result });
}

export const GET = withAuth(handler, { resource: "employers", action: "read" });
