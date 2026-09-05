import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { getSuperAgentOwnRegion, getSuperAgentScope, isRegionSubset } from "@/lib/auth/agentRestrictions";
import { commonSchemas } from "@/lib/validators";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { escapeRegex } from "@/lib/security/sanitize";
import logger from "@/lib/logger";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const performance = searchParams.get("performance"); // high_performer | needs_attention | slow_response | no_activity
  const leadsMin = searchParams.get("leadsMin");
  const leadsMax = searchParams.get("leadsMax");
  const convRateMin = searchParams.get("convRateMin");
  const convRateMax = searchParams.get("convRateMax");
  const sortBy = searchParams.get("sortBy") || "name"; // name | leadsCount | conversions | placements | conversionRate | avgResponseHours
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const distinct = searchParams.get("distinct"); // return facets when "true"
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));

  // Dual-scoping: team agents + region-based agents
  const scope = await getSuperAgentScope(ctx.userId);
  const assignedAgentDocIds = scope?.effectiveAgentIds ?? [];

  // Find the Agent documents for the assigned agents to get userIds
  let agentUserIds: string[] = [];
  // Map from userId → Agent doc _id for lead lookups
  const userToAgentMap = new Map<string, string>();
  // Map from userId → Agent profile data (country, currencyCode)
  const userToAgentProfileMap = new Map<string, { country?: string; currencyCode?: string }>();
  if (assignedAgentDocIds.length > 0) {
    const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId country currencyCode").lean();
    agentUserIds = agentDocs.map((a) => a.userId.toString());
    agentDocs.forEach((a) => {
      userToAgentMap.set(a.userId.toString(), a._id.toString());
      userToAgentProfileMap.set(a.userId.toString(), {
        country: a.country,
        currencyCode: a.currencyCode,
      });
    });
  }

  // Build user filter — only agents that belong to this super agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { role: "agent", _id: { $in: agentUserIds } };
  if (search) {
    filter.$or = [
      { name: { $regex: escapeRegex(search), $options: "i" } },
      { email: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("name email createdAt").lean();

  // Get lead stats per agent — Lead.agentId references Agent doc _id, not User _id
  const agentDocIds = users.map((u) => userToAgentMap.get(u._id.toString())).filter(Boolean);
  const leads = await Lead.find({ agentId: { $in: agentDocIds } })
    .select("agentId status convertedAt activityLog createdAt")
    .lean();

  // Get placement counts per agent — Placement.agentId references Agent doc _id
  const placementStats = await Placement.aggregate([
    { $match: { agentId: { $in: agentDocIds } } },
    { $group: { _id: "$agentId", count: { $sum: 1 } } },
  ]);
  const placementsByAgentId = new Map(
    placementStats.map((stat: { _id: unknown; count: number }) => [String(stat._id), stat.count])
  );

  let items = users.map((u) => {
    const agentDocId = userToAgentMap.get(u._id.toString());
    const agentProfile = userToAgentProfileMap.get(u._id.toString());
    const agentLeads = leads.filter((l) => l.agentId?.toString() === agentDocId);
    const converted = agentLeads.filter((l) => l.status === "converted").length;

    // Compute average response time (hours) from lead creation to first activity
    const responseTimes = agentLeads
      .filter((l) => l.activityLog && l.activityLog.length > 0)
      .map((l) => {
        const first = l.activityLog![0];
        return (new Date(first.timestamp).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60);
      })
      .filter((h) => h > 0 && h < 720);
    const avgResponseHours = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : -1;

    return {
      _id: u._id,
      agentId: agentDocId,
      name: u.name,
      email: u.email,
      country: agentProfile?.country ?? "",
      currencyCode: agentProfile?.currencyCode ?? "AED",
      leadsCount: agentLeads.length,
      conversions: converted,
      placements: placementsByAgentId.get(agentDocId ?? "") ?? 0,
      conversionRate: agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0,
      avgResponseHours,
    };
  });

  // ── Performance filter ──
  if (performance) {
    items = items.filter((a) => {
      switch (performance) {
        case "high_performer": return a.conversionRate >= 50;
        case "needs_attention": return a.conversionRate < 15 && a.leadsCount > 0;
        case "slow_response": return a.avgResponseHours > 48 && a.leadsCount > 0;
        case "no_activity": return a.leadsCount === 0;
        default: return true;
      }
    });
  }

  // ── Leads range filter ──
  if (leadsMin) items = items.filter((a) => a.leadsCount >= parseInt(leadsMin));
  if (leadsMax) items = items.filter((a) => a.leadsCount <= parseInt(leadsMax));

  // ── Conversion rate range filter ──
  if (convRateMin) items = items.filter((a) => a.conversionRate >= parseInt(convRateMin));
  if (convRateMax) items = items.filter((a) => a.conversionRate <= parseInt(convRateMax));

  // ── Sorting ──
  const VALID_SORT_FIELDS = new Set(["name", "leadsCount", "conversions", "placements", "conversionRate", "avgResponseHours"]);
  const sortField = VALID_SORT_FIELDS.has(sortBy) ? sortBy : "name";
  const dir = sortOrder === "desc" ? -1 : 1;
  items.sort((a, b) => {
    const va = (a as Record<string, unknown>)[sortField];
    const vb = (b as Record<string, unknown>)[sortField];
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir;
  });

  // ── Facets (for filter dropdowns) ──
  const facets = distinct === "true" ? {
    performanceLevels: ["high_performer", "needs_attention", "slow_response", "no_activity"],
  } : undefined;

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Aggregates over the whole scoped + filtered set, computed BEFORE the page
  // slice. The client used to derive its KPI tiles from the returned page, so
  // "Total agents" read 10 when the super agent had 57. Scoping is unchanged —
  // `items` here is already restricted to this super agent's assigned agents.
  const totals = {
    agents: total,
    leads: items.reduce((sum, a) => sum + (a.leadsCount ?? 0), 0),
    conversions: items.reduce((sum, a) => sum + (a.conversions ?? 0), 0),
    placements: items.reduce((sum, a) => sum + (a.placements ?? 0), 0),
  };

  const pageItems = items.slice((page - 1) * limit, page * limit);

  return NextResponse.json({ items: pageItems, total, page, totalPages, totals, ...(facets ? { facets } : {}) });
}, { resource: "agents", action: "read" });

/* ------------------------------------------------------------------ */
/*  POST /api/super-agent/agents — Super Agent creates an agent       */
/*  Agent regions must be a subset of the Super Agent's own regions.  */
/* ------------------------------------------------------------------ */

const saAgentCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  password: strongPasswordSchema,
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  // Parse and validate body
  const body = await req.json();
  const parsed = saAgentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password, assignedCityIds, assignedStateIds, commissionRate } = parsed.data;

  // Get super agent profile (including defaultAgentCommissionRate)
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("_id assignedCityIds assignedStateIds defaultAgentCommissionRate")
    .lean();
  if (!saProfile) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  // Validate agent regions are subset of super agent's own regions
  const agentCities = assignedCityIds ?? [];
  const agentStates = assignedStateIds ?? [];
  if (agentCities.length > 0 || agentStates.length > 0) {
    const saRegion = await getSuperAgentOwnRegion(ctx.userId);
    if (!saRegion) {
      return NextResponse.json({ error: "Super-agent region not found" }, { status: 404 });
    }
    const subset = await isRegionSubset(
      { cityIds: agentCities, stateIds: agentStates },
      saRegion
    );
    if (!subset.valid) {
      return NextResponse.json(
        {
          error: "Agent regions must be within your assigned territory.",
          invalidCityIds: subset.invalidCityIds,
          invalidStateIds: subset.invalidStateIds,
        },
        { status: 400 }
      );
    }
  }

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Create user + agent profile
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: "agent",
    isActive: true,
  });

  try {
    const agentDoc = await Agent.create({
      userId: user._id,
      superAgentId: saProfile._id,
      commissionRate: commissionRate ?? saProfile.defaultAgentCommissionRate ?? 0,
      assignedCityIds: agentCities,
      assignedStateIds: agentStates,
    });

    // Link agent to this super agent's agentIds[]
    await SuperAgent.findByIdAndUpdate(saProfile._id, {
      $addToSet: { agentIds: agentDoc._id },
    });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "agent.create",
      resource: "agents",
      resourceId: String(user._id),
      meta: { createdBy: "super_agent" },
      req,
    });

    // Send welcome email with a password-setup link instead of the plaintext password
    let emailSent = true;
    const saUser = await User.findById(ctx.userId).select("name").lean();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
    const rawSetupToken = crypto.randomBytes(32).toString("hex");
    const hashedSetupToken = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: hashedSetupToken,
      passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const setupUrl = `${baseUrl}/en/reset-password?token=${rawSetupToken}`;
    try {
      await sendEmail({
        to: email,
        ...EmailTemplates.agentWelcome(name, email, setupUrl, saUser?.name ?? "Your Super Agent", setupUrl),
        source: "agent-creation",
        category: "system",
      });
    } catch (err) {
      logger.error({ err }, "[super-agent/agents] Failed to send welcome email");
      emailSent = false;
    }

    return NextResponse.json(
      { success: true, userId: user._id, agentId: agentDoc._id, emailSent },
      { status: 201 }
    );
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    logger.error({ err }, "[super-agent/agents] Agent creation failed");
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}, { resource: "agents", action: "create" });
