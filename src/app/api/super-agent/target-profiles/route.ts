import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import { agentTargetDistributeSchema } from "@/lib/validators/targetProfiles";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { resolveSchedule, toStoredPeriods } from "@/lib/targets/schedule";
import { allocatedProfitCents, checkProfitBudget, profitToCents } from "@/lib/targets/budget";
import { profitTotals } from "@/lib/targets/profitTotals";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetAssigned } from "@/lib/notifications/trigger";
import Agent from "@/models/Agent";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/target-profiles                              */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") return forbidden();
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const view = searchParams.get("view") ?? "own"; // "own" | "team" | "agents"
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const risk = searchParams.get("risk") ?? "all";
  const completion = searchParams.get("completion") ?? "all";
  const territoryFilter = searchParams.get("territory") ?? "all";

  // The agents a target can be given to: this super agent's own team, active accounts only.
  if (view === "agents") {
    const team = await getSuperAgentTeam(ctx.userId);
    const agents = team?.agentUserIds.length
      ? await User.find({ _id: { $in: team.agentUserIds }, isActive: { $ne: false } })
          .select("_id name email")
          .sort({ name: 1 })
          .lean()
      : [];
    return NextResponse.json({
      agents: agents.map((agent) => ({ _id: String(agent._id), name: agent.name ?? "", email: agent.email ?? "" })),
    });
  }

  // The supervisor's own target profile
  const ownProfile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    year,
    assigneeRole: "super_agent",
    status: { $ne: "cancelled" },
  }).lean();

  if (view === "own") {
    if (!ownProfile) {
      return NextResponse.json({ profile: null, message: "No target profile for this year" });
    }

    const enriched = await enrichProfile(ownProfile as unknown as Record<string, unknown>);
    return NextResponse.json({ profile: enriched });
  }

  // view === "team" — agent profiles funded from this supervisor's target.
  // A super agent without a plan funds nobody, so there is no team view to show.
  const team = ownProfile ? await getSuperAgentTeam(ctx.userId) : null;
  if (!ownProfile || !team) {
    return NextResponse.json({ profiles: [], total: 0, page, limit });
  }

  const uniqueProfiles = team.agentUserIds.length
    ? await TargetProfile.find({
        ...PROFIT_TARGET_FILTER,
        parentProfileId: ownProfile._id,
        assigneeId: { $in: team.agentUserIds },
        status: { $ne: "cancelled" },
      }).lean()
    : [];

  const userIds = [...new Set(uniqueProfiles.map((p) => String(p.assigneeId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const agents = await Agent.find({ userId: { $in: userIds } })
    .select("userId country currencyCode updatedAt")
    .lean();
  const agentMap = new Map(agents.map((agent) => [String(agent.userId), agent]));

  const enriched = await enrichProfiles(uniqueProfiles as unknown as Record<string, unknown>[]);
  const rows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    const agent = agentMap.get(p.assigneeId);
    const territory = p.region ?? agent?.country ?? "Unassigned";

    return {
      ...p,
      assigneeName: user?.name ?? "Unknown",
      assigneeEmail: user?.email ?? "",
      region: territory,
      territory,
      lastActivityAt: p.updatedAt ?? agent?.updatedAt,
    };
  });
  const completionStage = (progress: number) => progress >= 100 ? "completed" : progress > 0 ? "in_progress" : "not_started";
  const filteredRows = rows.filter((row) => {
    const territory = row.territory ?? row.region ?? "Unassigned";
    if (territoryFilter !== "all" && territory !== territoryFilter) return false;
    if (risk !== "all" && row.riskScore !== risk) return false;
    if (completion !== "all" && completionStage(row.profitProgress) !== completion) return false;
    if (!search) return true;
    return row.assigneeName.toLowerCase().includes(search)
      || row.assigneeEmail.toLowerCase().includes(search)
      || territory.toLowerCase().includes(search);
  });

  // Team totals, one currency at a time
  const totals = {
    agents: filteredRows.length,
    totalProfiles: filteredRows.length,
    profit: profitTotals(filteredRows),
    avgProgress: filteredRows.length > 0
      ? Math.round(filteredRows.reduce((s, r) => s + r.profitProgress, 0) / filteredRows.length)
      : 0,
    riskBreakdown: {
      high: filteredRows.filter((r) => r.riskScore === "high").length,
      medium: filteredRows.filter((r) => r.riskScore === "medium").length,
      low: filteredRows.filter((r) => r.riskScore === "low").length,
    },
  };
  const stageCounts = filteredRows.reduce(
    (counts, row) => {
      counts[completionStage(row.profitProgress)] += 1;
      return counts;
    },
    { not_started: 0, in_progress: 0, completed: 0 } as Record<string, number>,
  );
  const currentMonth = new Date().getMonth() + 1;
  const deadlineAlerts = filteredRows.filter((row) => {
    const month = row.monthlyAchievements.find((entry) => entry.month === currentMonth);
    return !month || month.profitTarget === 0 || month.profitProgress < 75;
  }).slice(0, 5);
  const topPerformers = [...filteredRows].sort((a, b) => b.profitProgress - a.profitProgress).slice(0, 3);
  const underPerformers = [...filteredRows].sort((a, b) => a.profitProgress - b.profitProgress).slice(0, 3);
  const territories = [...new Set(rows.map((row) => row.territory ?? row.region ?? "Unassigned"))].sort();
  const currencies = [...new Set(filteredRows.map((row) => row.currency ?? "AED"))];

  return NextResponse.json({
    profiles: filteredRows.slice((page - 1) * limit, page * limit),
    ownProfile: await enrichProfile(ownProfile as unknown as Record<string, unknown>),
    totals,
    page,
    total: filteredRows.length,
    totalPages: Math.max(1, Math.ceil(filteredRows.length / limit)),
    overview: {
      stageCounts,
      territories,
      currencyLabel: currencies.length === 1 ? currencies[0] : "",
      currencyCount: currencies.length,
      attention: {
        behindProfit: filteredRows.filter((row) => row.profitProgress < 40).length,
        highRisk: filteredRows.filter((row) => row.riskScore === "high").length,
      },
      topPerformers,
      underPerformers,
      pendingActions: filteredRows.filter((row) => completionStage(row.profitProgress) !== "completed").length,
      deadlineAlerts,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/super-agent/target-profiles?action=distribute           */
/*  Split the supervisor's own profit target among their agents        */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") return forbidden();
  await connectDB();

  const action = new URL(req.url).searchParams.get("action");
  if (action !== "distribute") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const body = await validateBody(req, agentTargetDistributeSchema);

  // Get supervisor's own profile
  const ownProfile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    year: body.year,
    assigneeRole: "super_agent",
    status: "active",
  }).lean();

  if (!ownProfile) {
    return NextResponse.json(
      { error: "You have no active target profile for this year" },
      { status: 404 }
    );
  }

  const team = await getSuperAgentTeam(ctx.userId);
  if (!team) {
    return NextResponse.json(
      { error: "Super agent team could not be resolved" },
      { status: 403 }
    );
  }

  const teamUserIds = new Set(team.agentUserIds.map(String));
  const requestedAgentIds = body.allocations.map((allocation) => allocation.agentUserId);

  // Validate everything BEFORE any write: team, accounts, other plans, months, budget.
  if (requestedAgentIds.some((id) => !teamUserIds.has(id))) {
    return NextResponse.json(
      { error: "One or more selected agents are not in your team" },
      { status: 403 }
    );
  }

  const activeAgents = await User.countDocuments({ _id: { $in: requestedAgentIds }, isActive: { $ne: false } });
  if (activeAgents !== requestedAgentIds.length) {
    return NextResponse.json(
      { error: "One or more selected agents are inactive" },
      { status: 400 }
    );
  }

  const existingProfiles = await TargetProfile.find({
    ...PROFIT_TARGET_FILTER,
    year: body.year,
    assigneeRole: "agent",
    status: "active",
    assigneeId: { $in: requestedAgentIds },
  }).lean();

  // An agent already funded by someone else's target is not ours to overwrite.
  if (existingProfiles.some((profile) => String(profile.parentProfileId) !== String(ownProfile._id))) {
    return NextResponse.json(
      { error: "One or more agents already have a target that was not set by you. Ask admin to cancel it first." },
      { status: 409 }
    );
  }

  const resolved = [];
  for (const alloc of body.allocations) {
    const schedule = resolveSchedule({
      year: body.year,
      profitTarget: alloc.profitTarget,
      periodType: alloc.periodType,
      strategy: alloc.distributionStrategy ?? "equal",
      periods: alloc.periods,
    });
    if ("error" in schedule) {
      return NextResponse.json(
        {
          error: `The schedule is invalid for agent ${alloc.agentUserId}`,
          details: schedule.details,
        },
        { status: 400 }
      );
    }
    resolved.push({ alloc, periods: toStoredPeriods(schedule.periods) });
  }

  // What the other agents already hold plus this allocation must fit in the supervisor's target.
  const allocated = await allocatedProfitCents(ownProfile._id, existingProfiles.map((profile) => profile._id));
  const proposed = body.allocations.reduce((sum, alloc) => sum + profitToCents(alloc.profitTarget), 0);
  const budget = checkProfitBudget(ownProfile.profitTarget, allocated, proposed);

  if (!budget.withinBudget) {
    return NextResponse.json(
      {
        error: "Allocated targets exceed your assigned supervisor budget",
        remainingBudget: budget.remaining,
      },
      { status: 400 }
    );
  }

  const existingByAgent = new Map(existingProfiles.map((profile) => [String(profile.assigneeId), profile]));
  const created = [];
  for (const { alloc, periods } of resolved) {
    const existing = existingByAgent.get(alloc.agentUserId);

    if (existing) {
      // Update existing
      const updated = await TargetProfile.findByIdAndUpdate(existing._id, {
        $set: {
          profitTarget: alloc.profitTarget,
          currency: ownProfile.currency,
          periodType: alloc.periodType,
          periods,
          distributionStrategy: alloc.distributionStrategy ?? "equal",
          assignedBy: ctx.userId,
          parentProfileId: ownProfile._id,
          notes: alloc.notes,
        },
      }, { returnDocument: "after" });
      const targetProfile = updated ?? existing;
      created.push(targetProfile);
      void notifyTargetAssigned(
        alloc.agentUserId,
        "agent",
        String(targetProfile._id),
        body.year,
        ctx.locale
      );
      continue;
    }

    const profile = await TargetProfile.create({
      assigneeId: alloc.agentUserId,
      assigneeRole: "agent",
      assignedBy: ctx.userId,
      year: body.year,
      region: ownProfile.region,
      profitTarget: alloc.profitTarget,
      currency: ownProfile.currency,
      periodType: alloc.periodType,
      distributionStrategy: alloc.distributionStrategy ?? "equal",
      periods,
      parentProfileId: ownProfile._id,
      notes: alloc.notes,
      status: "active",
    });
    created.push(profile);
    void notifyTargetAssigned(
      alloc.agentUserId,
      "agent",
      String(profile._id),
      body.year,
      ctx.locale
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.distribute_to_agents",
    resource: "targets",
    resourceId: String(ownProfile._id),
    meta: { agentCount: created.length, year: body.year, allocationMode: body.allocationMode },
    req,
  });

  return NextResponse.json({ profiles: created, count: created.length, remainingBudget: budget.remaining }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
