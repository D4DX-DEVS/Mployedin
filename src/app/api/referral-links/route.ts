import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ReferralLink from "@/models/ReferralLink";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import crypto from "crypto";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

function generateCode(): string {
  return `MPL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * GET /api/referral-links
 * List referral links based on role:
 * - agent: own links
 * - super_agent: own links + agents under them
 * - admin: all links
 */
async function handleGet(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const search = url.searchParams.get("search")?.trim();
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filter: Record<string, any> = {};

  if (ctx.role === "agent") {
    filter.createdBy = ctx.userId;
  } else if (ctx.role === "super_agent") {
    // Own links + agents under this super-agent
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    if (!sa) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });

    // Get userIds of agents under this super-agent
    const agentUserIds: string[] = [];
    if (sa.agentIds?.length) {
      const agents = await Agent.find({ _id: { $in: sa.agentIds } }).select("userId").lean();
      agentUserIds.push(...agents.map((a) => a.userId.toString()));
    }
    filter.createdBy = { $in: [ctx.userId, ...agentUserIds] };
  } else if (ctx.role === "admin") {
    // Admin sees all — no filter
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: "i" } },
      { label: { $regex: search, $options: "i" } },
    ];
  }

  const [links, total] = await Promise.all([
    ReferralLink.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .lean(),
    ReferralLink.countDocuments(filter),
  ]);

  return NextResponse.json({
    links,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/referral-links
 * Create a new referral link
 */
async function handlePost(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (ctx.role !== "agent" && ctx.role !== "super_agent") {
    return NextResponse.json(
      { error: "Only agents and super-agents can create referral links" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const label = (body.label ?? "").trim().slice(0, 100);
  const maxUses = Math.max(0, parseInt(body.maxUses ?? "0") || 0);
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;

  // Validate expiry is in the future
  if (expiresAt && expiresAt <= new Date()) {
    return NextResponse.json({ error: "Expiry date must be in the future" }, { status: 400 });
  }

  // Generate unique code
  let code = generateCode();
  let attempts = 0;
  while (await ReferralLink.exists({ code })) {
    code = generateCode();
    attempts++;
    if (attempts > 10) {
      return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
    }
  }

  // Resolve agentId / superAgentId
  let agentId: string | undefined;
  let superAgentId: string | undefined;

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agent) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    agentId = agent._id.toString();
  } else {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!sa) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    superAgentId = sa._id.toString();
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://mployedin.com";

  const link = await ReferralLink.create({
    code,
    createdBy: ctx.userId,
    creatorRole: ctx.role,
    ...(agentId ? { agentId } : {}),
    ...(superAgentId ? { superAgentId } : {}),
    label: label || undefined,
    maxUses,
    expiresAt,
  });

  return NextResponse.json({
    link,
    referralUrl: `${baseUrl}/register/employer?ref=${code}`,
  }, { status: 201 });
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
