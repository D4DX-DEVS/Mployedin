import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import {
  targetProfileCreateSchema,
  targetProfileBulkCreateSchema,
  targetProfileCloneSchema,
} from "@/lib/validators/targetProfiles";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { generateMonthlyDistribution } from "@/lib/targets/distributionStrategies";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-profiles                                    */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const status = searchParams.get("status") ?? "active";
  const region = searchParams.get("region");
  const assigneeRole = searchParams.get("assigneeRole");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { year };
  if (status && status !== "all") query.status = status;
  if (region) query.region = region;
  if (assigneeRole && assigneeRole !== "all") query.assigneeRole = assigneeRole;
  // Only show top-level profiles (supervisor) by default
  if (!searchParams.has("includeAgents")) {
    query.assigneeRole = assigneeRole || "super_agent";
  }

  const [profiles, total] = await Promise.all([
    TargetProfile.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TargetProfile.countDocuments(query),
  ]);

  // Resolve assignee names
  const assigneeIds = [...new Set(profiles.map((p) => String(p.assigneeId)))];
  const users = await User.find({ _id: { $in: assigneeIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Get team sizes
  const saIds = profiles
    .filter((p) => p.assigneeRole === "super_agent")
    .map((p) => String(p.assigneeId));
  const saDocs = await SuperAgent.find({ userId: { $in: saIds } })
    .select("userId agentIds")
    .lean();
  const teamSizeMap = new Map(
    saDocs.map((sa) => [String(sa.userId), (sa.agentIds ?? []).length])
  );

  // Enrich with achievements
  const enriched = await enrichProfiles(profiles as unknown as Record<string, unknown>[]);

  const rows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    return {
      ...p,
      assigneeName: user?.name ?? "Unknown",
      assigneeEmail: user?.email ?? "",
      teamSize: teamSizeMap.get(p.assigneeId) ?? 0,
    };
  });

  // Aggregated totals
  const totals = {
    totalProfiles: total,
    supervisors: rows.filter((r) => r.assigneeRole === "super_agent").length,
    totalTeamSize: rows.reduce((s, r) => s + r.teamSize, 0),
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
    regions: [...new Set(rows.map((r) => r.region).filter(Boolean))] as string[],
  };

  return NextResponse.json({
    profiles: rows,
    totals,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/target-profiles — create unified profile          */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Bulk create
  if (action === "bulk") {
    const body = await validateBody(req, targetProfileBulkCreateSchema);
    const results = [];

    for (const assigneeId of body.assigneeIds) {
      const existing = await TargetProfile.findOne({
        assigneeId,
        year: body.year,
        assigneeRole: body.assigneeRole,
        status: "active",
      }).lean();

      if (existing) continue; // skip duplicates silently

      const monthlyTargets = generateMonthlyDistribution(
        {
          employerTarget: body.employerTarget,
          employeeTarget: body.employeeTarget,
          financeTarget: body.financeTarget,
        },
        body.distributionStrategy ?? "equal"
      );

      const profile = await TargetProfile.create({
        assigneeId,
        assigneeRole: body.assigneeRole,
        assignedBy: ctx.userId,
        year: body.year,
        region: body.region,
        employerTarget: body.employerTarget,
        employeeTarget: body.employeeTarget,
        financeTarget: body.financeTarget,
        currency: body.currency ?? "AED",
        distributionStrategy: body.distributionStrategy ?? "equal",
        monthlyTargets,
        notes: body.notes,
        status: "active",
      });
      results.push(profile);
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "target_profile.bulk_create",
      resource: "targets",
      resourceId: "bulk",
      meta: { count: results.length, year: body.year },
      req,
    });

    return NextResponse.json({ profiles: results, created: results.length }, { status: 201 });
  }

  // Clone from previous year
  if (action === "clone") {
    const body = await validateBody(req, targetProfileCloneSchema);
    const sourceProfiles = await TargetProfile.find({
      year: body.sourceYear,
      status: "active",
      assigneeRole: "super_agent",
    }).lean();

    if (sourceProfiles.length === 0) {
      return NextResponse.json(
        { error: "No active profiles found for the source year" },
        { status: 404 }
      );
    }

    const adj = 1 + (body.adjustmentPct ?? 0) / 100;
    const cloned = [];

    for (const src of sourceProfiles) {
      const existing = await TargetProfile.findOne({
        assigneeId: src.assigneeId,
        year: body.targetYear,
        status: "active",
      }).lean();
      if (existing) continue;

      const empT = Math.round(src.employerTarget * adj);
      const emplT = Math.round(src.employeeTarget * adj);
      const finT = Math.round(src.financeTarget * adj);

      const monthlyTargets = generateMonthlyDistribution(
        { employerTarget: empT, employeeTarget: emplT, financeTarget: finT },
        (src.distributionStrategy as "equal" | "custom" | "seasonal") ?? "equal"
      );

      const profile = await TargetProfile.create({
        assigneeId: src.assigneeId,
        assigneeRole: src.assigneeRole,
        assignedBy: ctx.userId,
        year: body.targetYear,
        region: src.region,
        employerTarget: empT,
        employeeTarget: emplT,
        financeTarget: finT,
        currency: src.currency,
        distributionStrategy: src.distributionStrategy,
        monthlyTargets,
        notes: `Cloned from ${body.sourceYear} with ${body.adjustmentPct ?? 0}% adjustment`,
        status: "active",
      });
      cloned.push(profile);
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "target_profile.clone",
      resource: "targets",
      resourceId: "clone",
      meta: { sourceYear: body.sourceYear, targetYear: body.targetYear, count: cloned.length },
      req,
    });

    return NextResponse.json({ profiles: cloned, cloned: cloned.length }, { status: 201 });
  }

  // Single create
  const body = await validateBody(req, targetProfileCreateSchema);

  const existing = await TargetProfile.findOne({
    assigneeId: body.assigneeId,
    year: body.year,
    assigneeRole: body.assigneeRole,
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: "An active target profile already exists for this person and year" },
      { status: 409 }
    );
  }

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
    assignedBy: ctx.userId,
    monthlyTargets,
    status: "active",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.create",
    resource: "targets",
    resourceId: String(profile._id),
    meta: {
      year: body.year,
      employerTarget: body.employerTarget,
      employeeTarget: body.employeeTarget,
      financeTarget: body.financeTarget,
      assigneeId: body.assigneeId,
    },
    req,
  });

  return NextResponse.json({ profile }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
