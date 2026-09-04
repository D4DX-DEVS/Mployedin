import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { escapeRegex, pick } from "@/lib/security/sanitize";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
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
  // "due" = the follow-up date has passed and the lead is still live. The
  // dashboard queue, the nav badge and the ⌘K action all address this view by
  // URL, so it has to be a server filter and not a client-side slice of one page.
  const followUp = searchParams.get("followUp");
  const followUpFrom = searchParams.get("followUpFrom");
  const followUpTo = searchParams.get("followUpTo");

  const filter: Record<string, unknown> = {};

  // Agents see only their leads — resolve Agent doc from userId
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    filter.agentId = agentDoc._id;
  } else if (ctx.role === "super_agent") {
    // Super-agents are scoped to their own team/region — never the whole platform.
    // Match leads routed to this SA, or owned by any agent in their effective scope.
    const scope = await getSuperAgentScope(ctx.userId);
    if (!scope) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    filter.$and = [
      {
        $or: [
          { superAgentId: scope.saProfileId },
          { agentId: { $in: scope.effectiveAgentIds } },
        ],
      },
    ];
  }

  if (status) filter.status = status;
  if (exhibitionId) filter.exhibitionId = exhibitionId;
  if (followUp === "due") {
    filter.followUpAt = { $ne: null, $lte: new Date() };
    filter.status = status ?? { $nin: ["converted", "lost"] };
  } else if (followUpFrom || followUpTo) {
    // The calendar asks for one month of follow-up dates at a time.
    const range: Record<string, Date> = {};
    if (followUpFrom) range.$gte = new Date(followUpFrom);
    if (followUpTo) range.$lte = new Date(followUpTo);
    filter.followUpAt = range;
  }
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
}, { resource: "leads", action: "read" });

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
