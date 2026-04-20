import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
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
    const agent = await Agent.findOne({ userId: ctx.userId }).select(
      "referralCode"
    );
    if (!agent)
      return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });

    if (!agent.referralCode) {
      agent.referralCode = generateReferralCode();
      await agent.save();
    }

    return NextResponse.json({
      referralCode: agent.referralCode,
      referralLink: `${baseUrl}/register/employer?ref=${agent.referralCode}`,
    });
  }

  if (ctx.role === "super_agent") {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select(
      "referralCode"
    );
    if (!sa)
      return NextResponse.json(
        { error: "Super-agent profile not found" },
        { status: 404 }
      );

    if (!sa.referralCode) {
      sa.referralCode = generateReferralCode();
      await sa.save();
    }

    return NextResponse.json({
      referralCode: sa.referralCode,
      referralLink: `${baseUrl}/register/employer?ref=${sa.referralCode}`,
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
