import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";
import { getSuperAgentScope, getSuperAgentOwnRegion, isRegionSubset } from "@/lib/auth/agentRestrictions";
import User from "@/models/User";
import Agent from "@/models/Agent";
import type { IActivityLog } from "@/models/Agent";
import Lead from "@/models/Lead";
import ReferralLink from "@/models/ReferralLink";
import { validateBody } from "@/lib/validators";
import { saAgentUpdateSchema } from "@/lib/validators/super-agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

export const GET = withAuth(async (req: NextRequest, ctx, params) => {
  await connectDB();
  const agentDocId = params?.id;

  if (!agentDocId || !mongoose.Types.ObjectId.isValid(agentDocId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  // Verify the agent is in this super-agent's scope (team + regions)
  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const isOwned = scope.effectiveAgentIds.some(
    (id: mongoose.Types.ObjectId) => id.toString() === agentDocId
  );
  if (!isOwned) {
    return NextResponse.json({ error: "Agent not in your team" }, { status: 403 });
  }

  // Fetch agent profile
  const agent = await Agent.findById(agentDocId).lean();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Fetch user info
  const user = await User.findById(agent.userId)
    .select("name email createdAt isActive")
    .lean();

  // Fetch leads for this agent
  const leads = await Lead.find({ agentId: agent._id })
    .select("companyName contactPerson status source country industry createdAt followUpAt convertedAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Lead status breakdown
  const statusCounts: Record<string, number> = {};
  for (const l of leads) {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  }

  // Referral links for this agent
  const referralLinks = await ReferralLink.find({ agentId: agent._id })
    .select("code label isActive usedCount maxUses registrations createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const totalRegistrations = referralLinks.reduce(
    (sum, rl) => sum + (rl.registrations?.length ?? 0),
    0
  );

  // Compute response time stats
  const responseTimes = leads
    .filter((l) => l.status !== "new")
    .map((l) => {
      const created = new Date(l.createdAt).getTime();
      const converted = l.convertedAt ? new Date(l.convertedAt).getTime() : null;
      return converted ? (converted - created) / (1000 * 60 * 60) : null;
    })
    .filter((h): h is number => h !== null && h > 0 && h < 720);

  const avgResponseHours =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : -1;

  // Recent activity (last 10)
  const recentActivity = ((agent.activityLog ?? []) as IActivityLog[])
    .sort((a: IActivityLog, b: IActivityLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return NextResponse.json({
    agent: {
      _id: agent._id,
      referralCode: agent.referralCode,
      country: agent.country,
      currencyCode: agent.currencyCode,
      timezone: agent.timezone,
      workingHoursStart: agent.workingHoursStart,
      workingHoursEnd: agent.workingHoursEnd,
      workingDays: agent.workingDays,
      commissionRate: agent.commissionRate,
      createdAt: agent.createdAt,
    },
    user: {
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      isActive: user?.isActive ?? false,
      joinedAt: user?.createdAt,
    },
    performance: agent.performance ?? {},
    leads: {
      items: leads,
      total: leads.length,
      statusBreakdown: statusCounts,
    },
    referralLinks: {
      items: referralLinks,
      total: referralLinks.length,
      totalRegistrations,
    },
    stats: {
      avgResponseHours,
      conversionRate:
        leads.length > 0
          ? Math.round(((statusCounts.converted ?? 0) / leads.length) * 100)
          : 0,
    },
    recentActivity,
  });
}, { resource: "agents", action: "read" });

/* ------------------------------------------------------------------ */
/*  PATCH /api/super-agent/agents/[id] — Update agent profile         */
/*  SA can update commission, regions, working hours, and active flag */
/* ------------------------------------------------------------------ */

export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  await connectDB();
  const agentDocId = params?.id;

  if (!agentDocId || !mongoose.Types.ObjectId.isValid(agentDocId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  // Verify the agent is in this super-agent's scope
  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const isOwned = scope.effectiveAgentIds.some(
    (id: mongoose.Types.ObjectId) => id.toString() === agentDocId
  );
  if (!isOwned) {
    return NextResponse.json({ error: "Agent not in your team" }, { status: 403 });
  }

  const body = await validateBody(req, saAgentUpdateSchema);
  const { commissionRate, assignedCityIds, assignedStateIds, workingHoursStart, workingHoursEnd, workingDays, isActive } = body;

  // Validate region changes against SA's own territory
  if (assignedCityIds !== undefined || assignedStateIds !== undefined) {
    const saRegion = await getSuperAgentOwnRegion(ctx.userId);
    if (!saRegion) {
      return NextResponse.json({ error: "Super-agent region not found" }, { status: 404 });
    }
    const subset = await isRegionSubset(
      { cityIds: assignedCityIds ?? [], stateIds: assignedStateIds ?? [] },
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

  // Build update
  const agentUpdate: Record<string, unknown> = {};
  if (commissionRate !== undefined) agentUpdate.commissionRate = commissionRate;
  if (assignedCityIds !== undefined) agentUpdate.assignedCityIds = assignedCityIds;
  if (assignedStateIds !== undefined) agentUpdate.assignedStateIds = assignedStateIds;
  if (workingHoursStart !== undefined) agentUpdate.workingHoursStart = workingHoursStart;
  if (workingHoursEnd !== undefined) agentUpdate.workingHoursEnd = workingHoursEnd;
  if (workingDays !== undefined) agentUpdate.workingDays = workingDays;

  if (Object.keys(agentUpdate).length > 0) {
    await Agent.findByIdAndUpdate(agentDocId, { $set: agentUpdate });
  }

  // Update user active status if provided
  if (isActive !== undefined) {
    const agent = await Agent.findById(agentDocId).select("userId").lean();
    if (agent?.userId) {
      await User.findByIdAndUpdate(agent.userId, { $set: { isActive } });
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "agent.update",
    resource: "agents",
    resourceId: agentDocId,
    meta: { updatedBy: "super_agent" },
    changes: { after: { ...agentUpdate, ...(isActive !== undefined ? { isActive } : {}) } },
    req,
  });

  return NextResponse.json({ success: true });
}, { resource: "agents", action: "update" });
