import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import ReferralLink from "@/models/ReferralLink";
import crypto from "crypto";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

function generateReferralCode(): string {
  return `MPL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://mployedin.com";

  if (ctx.role === "agent") {
    let agent = await Agent.findOne({ userId: ctx.userId }).select(
      "referralCode _id"
    );
    if (!agent) {
      agent = await Agent.create({ userId: ctx.userId });
    }

    if (!agent.referralCode) {
      agent.referralCode = generateReferralCode();
      await agent.save();
    }

    // Ensure a ReferralLink document exists so it shows on the Referral Links page
    let rl = await ReferralLink.findOne({ code: agent.referralCode });
    if (!rl) {
      rl = await ReferralLink.create({
        code: agent.referralCode,
        createdBy: ctx.userId,
        creatorRole: "agent",
        agentId: agent._id,
        label: "Default Referral Link",
        maxUses: 0,
        isActive: true,
      });
    }

    return NextResponse.json({
      referralCode: agent.referralCode,
      referralLink: `${baseUrl}/en/employer-register?ref=${agent.referralCode}`,
      linkId: rl._id,
      isActive: rl.isActive,
      usedCount: rl.usedCount,
      maxUses: rl.maxUses,
      label: rl.label || "",
      registrations: rl.registrations || [],
      expiresAt: rl.expiresAt || null,
      createdAt: rl.createdAt,
    });
  }

  if (ctx.role === "super_agent") {
    let sa = await SuperAgent.findOne({ userId: ctx.userId }).select(
      "referralCode _id"
    );
    if (!sa) {
      sa = await SuperAgent.create({ userId: ctx.userId });
    }

    if (!sa.referralCode) {
      sa.referralCode = generateReferralCode();
      await sa.save();
    }

    let rl = await ReferralLink.findOne({ code: sa.referralCode });
    if (!rl) {
      rl = await ReferralLink.create({
        code: sa.referralCode,
        createdBy: ctx.userId,
        creatorRole: "super_agent",
        superAgentId: sa._id,
        label: "Default Referral Link",
        maxUses: 0,
        isActive: true,
      });
    }

    return NextResponse.json({
      referralCode: sa.referralCode,
      referralLink: `${baseUrl}/en/employer-register?ref=${sa.referralCode}`,
      linkId: rl._id,
      isActive: rl.isActive,
      usedCount: rl.usedCount,
      maxUses: rl.maxUses,
      label: rl.label || "",
      registrations: rl.registrations || [],
      expiresAt: rl.expiresAt || null,
      createdAt: rl.createdAt,
    });
  }

  return NextResponse.json(
    { error: "Only agents and super-agents can generate referral links" },
    { status: 403 }
  );
}

export const GET = withAuth(handler, {
  resource: "employers",
  action: "read",
});
