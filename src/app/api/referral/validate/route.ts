import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import ReferralLink from "@/models/ReferralLink";
import User from "@/models/User";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
  }

  // Rate limit unauthenticated validation requests
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`referral-validate:${ip}`, { limit: 10, windowSec: 60 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  await connectDB();

  // Check new ReferralLink model first
  const rl = await ReferralLink.findOne({ code, isActive: true }).lean();
  if (rl) {
    const expired = rl.expiresAt && new Date(rl.expiresAt) < new Date();
    const maxReached = rl.maxUses > 0 && rl.usedCount >= rl.maxUses;
    return NextResponse.json({
      valid: !expired && !maxReached,
      type: rl.creatorRole,
      ...(expired ? { reason: "expired" } : {}),
      ...(maxReached ? { reason: "max_reached" } : {}),
    });
  }

  // Fallback: legacy codes on Agent/SuperAgent models
  const agent = await Agent.findOne({ referralCode: code }).lean();
  if (agent) {
    return NextResponse.json({
      valid: true,
      type: "agent",
    });
  }

  const sa = await SuperAgent.findOne({ referralCode: code }).lean();
  if (sa) {
    return NextResponse.json({
      valid: true,
      type: "super_agent",
    });
  }

  return NextResponse.json({ valid: false }, { status: 404 });
}
