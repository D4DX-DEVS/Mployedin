import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
  }

  await connectDB();

  // Check agents first
  const agent = await Agent.findOne({ referralCode: code }).select("userId").lean();
  if (agent) {
    const agentUser = await User.findById(agent.userId).select("name").lean();
    return NextResponse.json({
      valid: true,
      referrerType: "agent",
      referrerName: agentUser?.name ?? "Agent",
    });
  }

  // Check super-agents
  const sa = await SuperAgent.findOne({ referralCode: code }).select("userId").lean();
  if (sa) {
    const saUser = await User.findById(sa.userId).select("name").lean();
    return NextResponse.json({
      valid: true,
      referrerType: "super_agent",
      referrerName: saUser?.name ?? "Super Agent",
    });
  }

  return NextResponse.json({ valid: false }, { status: 404 });
}
