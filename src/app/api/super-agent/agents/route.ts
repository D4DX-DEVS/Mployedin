import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Lead from "@/models/Lead";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { getSuperAgentOwnRegion, getSuperAgentScope, isRegionSubset } from "@/lib/auth/agentRestrictions";
import { commonSchemas } from "@/lib/validators";

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

  // Dual-scoping: team agents + region-based agents
  const scope = await getSuperAgentScope(ctx.userId);
  const assignedAgentDocIds = scope?.effectiveAgentIds ?? [];

  // Find the Agent documents for the assigned agents to get userIds
  let agentUserIds: string[] = [];
  // Map from userId → Agent doc _id for lead lookups
  const userToAgentMap = new Map<string, string>();
  if (assignedAgentDocIds.length > 0) {
    const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
    agentUserIds = agentDocs.map((a) => a.userId.toString());
    agentDocs.forEach((a) => userToAgentMap.set(a.userId.toString(), a._id.toString()));
  }

  // Build user filter — only agents that belong to this super agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { role: "agent", _id: { $in: agentUserIds } };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("name email createdAt").lean();

  // Get lead stats per agent — Lead.agentId references Agent doc _id, not User _id
  const agentDocIds = users.map((u) => userToAgentMap.get(u._id.toString())).filter(Boolean);
  const leads = await Lead.find({ agentId: { $in: agentDocIds } })
    .select("agentId status convertedAt activityLog createdAt")
    .lean();

  let items = users.map((u) => {
    const agentDocId = userToAgentMap.get(u._id.toString());
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
      leadsCount: agentLeads.length,
      conversions: converted,
      placements: 0, // would come from Placement model
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

  return NextResponse.json({ items, total: items.length, ...(facets ? { facets } : {}) });
}, { resource: "agents", action: "read" });

/* ------------------------------------------------------------------ */
/*  POST /api/super-agent/agents — Super Agent creates an agent       */
/*  Agent regions must be a subset of the Super Agent's own regions.  */
/* ------------------------------------------------------------------ */

const saAgentCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  commissionRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
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

  const { name, email, password, commissionRate, assignedCityIds, assignedStateIds } = parsed.data;

  // Get super agent profile
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("_id assignedCityIds assignedStateIds")
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
      commissionRate: commissionRate ?? 0,
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

    return NextResponse.json(
      { success: true, userId: user._id, agentId: agentDoc._id },
      { status: 201 }
    );
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    console.error("[super-agent/agents] Agent creation failed:", err);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}, { resource: "agents", action: "create" });
