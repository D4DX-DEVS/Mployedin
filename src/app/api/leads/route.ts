import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { escapeRegex, pick } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { leadCreateSchema } from "@/lib/validators/leads";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { calculateLeadScore, deriveQualification } from "@/lib/leads/scoring";
import { autoRouteLead } from "@/lib/leads/autoRouter";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const exhibitionId = searchParams.get("exhibitionId");

  const filter: Record<string, unknown> = {};

  // Agents see only their leads — resolve Agent doc from userId
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    filter.agentId = agentDoc._id;
  }

  if (status) filter.status = status;
  if (exhibitionId) filter.exhibitionId = exhibitionId;
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { companyName: { $regex: safe, $options: "i" } },
      { contactPerson: { $regex: safe, $options: "i" } },
      { contactEmail: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.leads);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const body = await validateBody(req, leadCreateSchema);

  // Resolve Agent._id from User._id
  const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });

  // Calculate initial lead score
  const score = calculateLeadScore({
    status: "new",
    hasEmail: !!body.contactEmail,
    hasPhone: !!body.contactPhone,
    hasExpectedRevenue: !!body.expectedRevenue,
    hasIndustry: !!body.industry,
    activityCount: 0,
  });
  const qualificationLevel = deriveQualification(score);

  // Auto-route to territory if no superAgent assigned
  const routeResult = await autoRouteLead({
    country: body.country,
    city: body.city,
    superAgentId: undefined,
  });

  const lead = await Lead.create({
    ...body,
    agentId: agentDoc._id,
    status: "new",
    score,
    qualificationLevel,
    ...(routeResult && {
      territoryId: routeResult.territoryId,
      superAgentId: routeResult.superAgentId,
      autoRouted: true,
    }),
  });

  // Increment agent performance counter
  const { incrementAgentCounter } = await import("@/lib/agentPerformance");
  incrementAgentCounter(ctx.userId, "leadsGenerated", { byUserId: true });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.create",
    resource: "leads",
    resourceId: String(lead._id),
    req,
  });

  return NextResponse.json(lead, { status: 201 });
}, { resource: "leads", action: "create" });
