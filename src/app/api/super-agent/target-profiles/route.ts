import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import {
  targetProfileCreateSchema,
  agentTargetDistributeSchema,
} from "@/lib/validators/targetProfiles";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import {
  generateMonthlyDistribution,
  validateDistributionSum,
} from "@/lib/targets/distributionStrategies";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Agent from "@/models/Agent";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/target-profiles                              */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const view = searchParams.get("view") ?? "own"; // "own" | "team"

  if (view === "own") {
    // Get the supervisor's own target profile
    const profile = await TargetProfile.findOne({
      assigneeId: ctx.userId,
      year,
      assigneeRole: "super_agent",
      status: { $ne: "cancelled" },
    }).lean();

    if (!profile) {
      return NextResponse.json({ profile: null, message: "No target profile for this year" });
    }

    const enriched = await enrichProfile(profile as unknown as Record<string, unknown>);
    return NextResponse.json({ profile: enriched });
  }

  // view === "team" — agent profiles under this supervisor
  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    year,
    assigneeRole: "super_agent",
    status: { $ne: "cancelled" },
  }).lean();

  const agentProfiles = await TargetProfile.find({
    parentProfileId: ownProfile?._id,
    status: { $ne: "cancelled" },
  }).lean();

  // Also find agent profiles assigned by this supervisor without parentProfileId
  const additionalProfiles = await TargetProfile.find({
    assignedBy: ctx.userId,
    year,
    assigneeRole: "agent",
    status: { $ne: "cancelled" },
    ...(ownProfile ? { parentProfileId: { $ne: ownProfile._id } } : {}),
  }).lean();

  const allAgentProfiles = [...agentProfiles, ...additionalProfiles];
  const uniqueProfiles = allAgentProfiles.filter(
    (p, i, arr) => arr.findIndex((a) => String(a._id) === String(p._id)) === i
  );

  const userIds = [...new Set(uniqueProfiles.map((p) => String(p.assigneeId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = await enrichProfiles(uniqueProfiles as unknown as Record<string, unknown>[]);
  const rows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    return { ...p, assigneeName: user?.name ?? "Unknown", assigneeEmail: user?.email ?? "" };
  });

  // Team totals
  const totals = {
    agents: rows.length,
    totalProfiles: rows.length,
    employer: {
      target: rows.reduce((s, r) => s + r.employerTarget, 0),
      achieved: rows.reduce((s, r) => s + r.employerAchieved, 0),
    },
    employee: {
      target: rows.reduce((s, r) => s + r.employeeTarget, 0),
      achieved: rows.reduce((s, r) => s + r.employeeAchieved, 0),
    },
    finance: {
      target: rows.reduce((s, r) => s + r.financeTarget, 0),
      achieved: rows.reduce((s, r) => s + r.financeAchieved, 0),
    },
    avgPerformance: rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.overallProgress, 0) / rows.length)
      : 0,
    riskBreakdown: {
      high: rows.filter((r) => r.riskScore === "high").length,
      medium: rows.filter((r) => r.riskScore === "medium").length,
      low: rows.filter((r) => r.riskScore === "low").length,
    },
  };

  return NextResponse.json({
    profiles: rows,
    ownProfile: ownProfile ? await enrichProfile(ownProfile as unknown as Record<string, unknown>) : null,
    totals,
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/super-agent/target-profiles                             */
/*  Create target for an agent OR distribute targets to agents         */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Distribute targets to agents from own yearly target
  if (action === "distribute") {
    const body = await validateBody(req, agentTargetDistributeSchema);

    // Get supervisor's own profile
    const ownProfile = await TargetProfile.findOne({
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

    const scope = await getSuperAgentScope(ctx.userId);
    if (!scope) {
      return NextResponse.json(
        { error: "Super agent scope could not be resolved" },
        { status: 403 }
      );
    }

    const scopedAgents = await Agent.find({ _id: { $in: scope.effectiveAgentIds } })
      .select("userId")
      .lean();
    const allowedAgentUserIds = new Set(scopedAgents.map((agent) => String(agent.userId)));

    const requestedAgentIds = body.allocations.map((allocation) => allocation.agentUserId);
    const existingProfiles = await TargetProfile.find({
      year: body.year,
      assigneeRole: "agent",
      status: "active",
      $or: [
        { parentProfileId: ownProfile._id },
        { assignedBy: ctx.userId },
      ],
    }).lean();

    const uniqueExistingProfiles = existingProfiles.filter(
      (profile, index, allProfiles) =>
        allProfiles.findIndex((candidate) => String(candidate.assigneeId) === String(profile.assigneeId)) === index
    );

    const untouchedTotals = uniqueExistingProfiles
      .filter((profile) => !requestedAgentIds.includes(String(profile.assigneeId)))
      .reduce(
        (acc, profile) => ({
          employerTarget: acc.employerTarget + profile.employerTarget,
          employeeTarget: acc.employeeTarget + profile.employeeTarget,
          financeTarget: acc.financeTarget + profile.financeTarget,
        }),
        { employerTarget: 0, employeeTarget: 0, financeTarget: 0 }
      );

    const requestedTotals = body.allocations.reduce(
      (acc, allocation) => ({
        employerTarget: acc.employerTarget + allocation.employerTarget,
        employeeTarget: acc.employeeTarget + allocation.employeeTarget,
        financeTarget: acc.financeTarget + allocation.financeTarget,
      }),
      { employerTarget: 0, employeeTarget: 0, financeTarget: 0 }
    );

    const finalTotals = {
      employerTarget: untouchedTotals.employerTarget + requestedTotals.employerTarget,
      employeeTarget: untouchedTotals.employeeTarget + requestedTotals.employeeTarget,
      financeTarget: untouchedTotals.financeTarget + requestedTotals.financeTarget,
    };

    const remainingBudget = {
      employer: ownProfile.employerTarget - finalTotals.employerTarget,
      employee: ownProfile.employeeTarget - finalTotals.employeeTarget,
      finance: ownProfile.financeTarget - finalTotals.financeTarget,
    };

    if (remainingBudget.employer < 0 || remainingBudget.employee < 0 || remainingBudget.finance < 0) {
      return NextResponse.json(
        {
          error: "Allocated targets exceed your assigned supervisor budget",
          remainingBudget,
        },
        { status: 400 }
      );
    }

    const created = [];
    for (const alloc of body.allocations) {
      if (!allowedAgentUserIds.has(alloc.agentUserId)) {
        return NextResponse.json(
          { error: "One or more selected agents are outside your team scope" },
          { status: 403 }
        );
      }

      const annualTargets = {
        employerTarget: alloc.employerTarget,
        employeeTarget: alloc.employeeTarget,
        financeTarget: alloc.financeTarget,
      };
      const monthlyTargets = alloc.monthlyTargets ?? generateMonthlyDistribution(
        annualTargets,
        alloc.distributionStrategy ?? "equal"
      );

      const monthlyValidation = validateDistributionSum(annualTargets, monthlyTargets);
      if (!monthlyValidation.valid) {
        return NextResponse.json(
          {
            error: `Monthly distribution is invalid for agent ${alloc.agentUserId}`,
            details: monthlyValidation.errors,
          },
          { status: 400 }
        );
      }

      const existing = await TargetProfile.findOne({
        assigneeId: alloc.agentUserId,
        year: body.year,
        assigneeRole: "agent",
        status: "active",
      }).lean();

      if (existing) {
        // Update existing
        const updated = await TargetProfile.findByIdAndUpdate(existing._id, {
          $set: {
            employerTarget: alloc.employerTarget,
            employeeTarget: alloc.employeeTarget,
            financeTarget: alloc.financeTarget,
            currency: ownProfile.currency,
            monthlyTargets,
            distributionStrategy: alloc.distributionStrategy ?? "equal",
            assignedBy: ctx.userId,
            parentProfileId: ownProfile._id,
            notes: alloc.notes,
          },
        }, { new: true });
        created.push(updated ?? existing);
        continue;
      }

      const profile = await TargetProfile.create({
        assigneeId: alloc.agentUserId,
        assigneeRole: "agent",
        assignedBy: ctx.userId,
        year: body.year,
        region: ownProfile.region,
        employerTarget: alloc.employerTarget,
        employeeTarget: alloc.employeeTarget,
        financeTarget: alloc.financeTarget,
        currency: ownProfile.currency,
        distributionStrategy: alloc.distributionStrategy ?? "equal",
        monthlyTargets,
        parentProfileId: ownProfile._id,
        notes: alloc.notes,
        status: "active",
      });
      created.push(profile);
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "target_profile.distribute_to_agents",
      resource: "targets",
      resourceId: String(ownProfile._id),
      meta: { agentCount: created.length, year: body.year, allocationMode: body.allocationMode },
      req,
    });

    return NextResponse.json({ profiles: created, count: created.length, remainingBudget }, { status: 201 });
  }

  // Single agent target creation
  const body = await validateBody(req, targetProfileCreateSchema);

  const existing = await TargetProfile.findOne({
    assigneeId: body.assigneeId,
    year: body.year,
    assigneeRole: "agent",
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: "An active target profile already exists for this agent and year" },
      { status: 409 }
    );
  }

  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    year: body.year,
    assigneeRole: "super_agent",
    status: "active",
  }).lean();

  const monthlyTargets = body.monthlyTargets ??
    generateMonthlyDistribution(
      {
        employerTarget: body.employerTarget,
        employeeTarget: body.employeeTarget,
        financeTarget: body.financeTarget,
      },
      body.distributionStrategy ?? "equal"
    );

  const profile = await TargetProfile.create({
    ...body,
    currency: body.currency ?? ownProfile?.currency ?? "AED",
    assigneeRole: "agent",
    assignedBy: ctx.userId,
    monthlyTargets,
    parentProfileId: ownProfile?._id,
    status: "active",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.create_agent",
    resource: "targets",
    resourceId: String(profile._id),
    meta: { year: body.year, assigneeId: body.assigneeId },
    req,
  });

  return NextResponse.json({ profile }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
