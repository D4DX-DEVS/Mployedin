import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import ReferralLink from "@/models/ReferralLink";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
  }

  await connectDB();

  // Check new ReferralLink model first
  const rl = await ReferralLink.findOne({ code, isActive: true }).populate("createdBy", "name").lean();
  if (rl) {
    const expired = rl.expiresAt && new Date(rl.expiresAt) < new Date();
    const maxReached = rl.maxUses > 0 && rl.usedCount >= rl.maxUses;
    return NextResponse.json({
      valid: !expired && !maxReached,
      referrerType: rl.creatorRole,
      referrerName: (rl.createdBy as { name?: string })?.name ?? "Agent",
      ...(expired ? { reason: "expired" } : {}),
      ...(maxReached ? { reason: "max_reached" } : {}),
    });
  }

  // Fallback: legacy codes on Agent/SuperAgent models
  const agent = await Agent.findOne({ referralCode: code }).select("userId").lean();
  if (agent) {
    const agentUser = await User.findById(agent.userId).select("name").lean();
    return NextResponse.json({
      valid: true,
      referrerType: "agent",
      referrerName: agentUser?.name ?? "Agent",
    });
  }

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
