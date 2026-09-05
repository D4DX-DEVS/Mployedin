import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import ReferralLink from "@/models/ReferralLink";
import { checkRateLimit } from "@/lib/security/rateLimit";
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
    // Public, unauthenticated endpoint: answer validity only. The creator's role
    // (agent vs super-agent) is internal structure a code oracle must not leak.
    return NextResponse.json({
      valid: !expired && !maxReached,
      ...(expired ? { reason: "expired" } : {}),
      ...(maxReached ? { reason: "max_reached" } : {}),
    });
  }

  // Fallback: legacy codes on Agent/SuperAgent models
  const agent = await Agent.findOne({ referralCode: code }).lean();
  if (agent) {
    return NextResponse.json({ valid: true });
  }

  const sa = await SuperAgent.findOne({ referralCode: code }).lean();
  if (sa) {
    return NextResponse.json({ valid: true });
  }

  return NextResponse.json({ valid: false }, { status: 404 });
}
