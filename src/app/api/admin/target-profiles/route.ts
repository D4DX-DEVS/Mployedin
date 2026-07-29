import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { type ITargetProfile } from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import {
  targetProfileCreateSchema,
  targetProfileBulkCreateSchema,
  targetProfileCloneSchema,
} from "@/lib/validators/targetProfiles";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import {
  generateMonthlyDistribution,
  validateDistributionSum,
} from "@/lib/targets/distributionStrategies";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetAssigned } from "@/lib/notifications/trigger";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";

interface AuthCtx { userId: string; role: string; locale: string; }

interface AnnualTargets {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

interface MonthlyTargetInput extends AnnualTargets {
  month: number;
}

function resolveMonthlyTargets(
  annualTargets: AnnualTargets,
  distributionStrategy: "equal" | "custom" | "seasonal",
  monthlyTargets?: MonthlyTargetInput[],
): { monthlyTargets: MonthlyTargetInput[] } | { error: string; details: string[] } {
  const resolvedMonthlyTargets = monthlyTargets ?? generateMonthlyDistribution(
    annualTargets,
    distributionStrategy,
  );

  const validation = validateDistributionSum(annualTargets, resolvedMonthlyTargets);
  if (!validation.valid) {
    return {
      error: "Monthly distribution must equal annual targets",
      details: validation.errors,
    };
  }

  return { monthlyTargets: resolvedMonthlyTargets };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000,
  );
}

async function getEligibleAssigneeIds(assigneeIds: string[], assigneeRole: string): Promise<Set<string>> {
  const users = await User.find({
    _id: { $in: assigneeIds },
    role: assigneeRole,
    isActive: { $ne: false },
  })
    .select("_id")
    .lean();

  return new Set(users.map((user) => String(user._id)));
}

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-profiles                                    */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const status = searchParams.get("status") ?? "active";
  const region = searchParams.get("region");
  const assigneeRole = searchParams.get("assigneeRole");
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const risk = searchParams.get("risk");
  const completion = searchParams.get("completion");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const query: Record<string, unknown> = { year };
  if (status && status !== "all") query.status = status;
  if (region) query.region = region;
  if (assigneeRole && assigneeRole !== "all") query.assigneeRole = assigneeRole;
  // Only show top-level profiles (supervisor) by default
  if (!searchParams.has("includeAgents")) {
    query.assigneeRole = assigneeRole && assigneeRole !== "all" ? assigneeRole : "super_agent";
  }

  const profiles = await TargetProfile.find(query).sort({ createdAt: -1 }).lean();

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

  const allRows = enriched.map((p) => {
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
    totalProfiles: allRows.length,
    supervisors: allRows.filter((r) => r.assigneeRole === "super_agent").length,
    totalTeamSize: allRows.reduce((s, r) => s + r.teamSize, 0),
    employer: {
      target: allRows.reduce((s, r) => s + r.employerTarget, 0),
      achieved: allRows.reduce((s, r) => s + r.employerAchieved, 0),
    },
    employee: {
      target: allRows.reduce((s, r) => s + r.employeeTarget, 0),
      achieved: allRows.reduce((s, r) => s + r.employeeAchieved, 0),
    },
    finance: {
      target: allRows.reduce((s, r) => s + r.financeTarget, 0),
      achieved: allRows.reduce((s, r) => s + r.financeAchieved, 0),
    },
    avgPerformance: allRows.length > 0
      ? Math.round(allRows.reduce((s, r) => s + r.overallProgress, 0) / allRows.length)
      : 0,
    riskBreakdown: {
      high: allRows.filter((r) => r.riskScore === "high").length,
      medium: allRows.filter((r) => r.riskScore === "medium").length,
      low: allRows.filter((r) => r.riskScore === "low").length,
    },
    regions: [...new Set(allRows.map((r) => r.region).filter(Boolean))] as string[],
  };

  const filteredRows = allRows.filter((row) => {
    if (risk && risk !== "all" && row.riskScore !== risk) return false;
    if (completion && completion !== "all") {
      const stage = row.overallProgress >= 100
        ? "completed"
        : row.overallProgress > 0 ? "in_progress" : "not_started";
      if (stage !== completion) return false;
    }
    if (!search) return true;
    return row.assigneeName.toLowerCase().includes(search)
      || row.assigneeEmail.toLowerCase().includes(search)
      || (row.region ?? "").toLowerCase().includes(search);
  });
  const total = filteredRows.length;
  const skip = (page - 1) * limit;
  const rows = filteredRows.slice(skip, skip + limit);

  return NextResponse.json({
    profiles: rows,
    totals,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/target-profiles — create unified profile          */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Bulk create
  if (action === "bulk") {
    const body = await validateBody(req, targetProfileBulkCreateSchema);
    const eligibleAssigneeIds = await getEligibleAssigneeIds(body.assigneeIds, body.assigneeRole);

    if (eligibleAssigneeIds.size !== body.assigneeIds.length) {
      return NextResponse.json(
        { error: "One or more selected assignees are inactive or no longer eligible for target assignment" },
        { status: 400 }
      );
    }

    const annualTargets = {
      employerTarget: body.employerTarget,
      employeeTarget: body.employeeTarget,
      financeTarget: body.financeTarget,
    };
    const monthlyResolution = resolveMonthlyTargets(
      annualTargets,
      body.distributionStrategy ?? "equal",
      body.monthlyTargets,
    );

    if ("error" in monthlyResolution) {
      return NextResponse.json(
        { error: monthlyResolution.error, details: monthlyResolution.details },
        { status: 400 },
      );
    }

    const results = [];
    const skippedDetails: Array<{ assigneeId: string; reason: string }> = [];

    for (const assigneeId of body.assigneeIds) {
      const existing = await TargetProfile.findOne({
        assigneeId,
        year: body.year,
        assigneeRole: body.assigneeRole,
        status: "active",
      }).lean();

      if (existing) {
        skippedDetails.push({ assigneeId, reason: "active_profile_exists" });
        continue;
      }

      let profile: ITargetProfile;
      try {
        profile = await TargetProfile.create({
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
          monthlyTargets: monthlyResolution.monthlyTargets,
          notes: body.notes,
          status: "active",
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          skippedDetails.push({ assigneeId, reason: "active_profile_created_concurrently" });
          continue;
        }

        throw error;
      }
      results.push(profile);
      void notifyTargetAssigned(
        String(profile.assigneeId),
        body.assigneeRole,
        String(profile._id),
        body.year,
        ctx.locale
      );
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "target_profile.bulk_create",
      resource: "targets",
      resourceId: "bulk",
      meta: { count: results.length, year: body.year },
      req,
    });

    return NextResponse.json({
      profiles: results,
      created: results.length,
      skipped: skippedDetails.length,
      skippedDetails,
    }, { status: 201 });
  }

  // Bulk tabular: each supervisor gets individual targets
  if (action === "bulk-tabular") {
    const rawBody = await req.json();
    const { assigneeIds, assigneeRole, year, currency, targets } = rawBody as {
      assigneeIds: string[];
      assigneeRole: "super_agent" | "agent";
      year: number;
      currency?: string;
      targets: Array<{
        assigneeId: string;
        employerTarget: number;
        employeeTarget: number;
        financeTarget: number;
        currency?: string;
        distributionStrategy?: "equal" | "custom" | "seasonal";
        monthlyTargets?: MonthlyTargetInput[];
      }>;
    };

    if (!assigneeIds?.length || !targets?.length || !year) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const eligibleIds = await getEligibleAssigneeIds(assigneeIds, assigneeRole);
    const results = [];
    const skippedDetails: Array<{ assigneeId: string; reason: string }> = [];

    for (const target of targets) {
      if (!eligibleIds.has(target.assigneeId)) {
        skippedDetails.push({ assigneeId: target.assigneeId, reason: "ineligible" });
        continue;
      }

      const existing = await TargetProfile.findOne({
        assigneeId: target.assigneeId,
        year,
        assigneeRole,
        status: "active",
      }).lean();

      if (existing) {
        skippedDetails.push({ assigneeId: target.assigneeId, reason: "active_profile_exists" });
        continue;
      }

      const annualTargets: AnnualTargets = {
        employerTarget: target.employerTarget,
        employeeTarget: target.employeeTarget,
        financeTarget: target.financeTarget,
      };
      const monthlyResolution = resolveMonthlyTargets(
        annualTargets,
        target.distributionStrategy ?? "equal",
        target.monthlyTargets,
      );

      if ("error" in monthlyResolution) {
        skippedDetails.push({ assigneeId: target.assigneeId, reason: "distribution_invalid" });
        continue;
      }

      try {
        const profile = await TargetProfile.create({
          assigneeId: target.assigneeId,
          assigneeRole,
          assignedBy: ctx.userId,
          year,
          employerTarget: target.employerTarget,
          employeeTarget: target.employeeTarget,
          financeTarget: target.financeTarget,
          currency: target.currency ?? currency ?? "AED",
          distributionStrategy: target.distributionStrategy ?? "custom",
          monthlyTargets: monthlyResolution.monthlyTargets,
          status: "active",
        });
        results.push(profile);
        void notifyTargetAssigned(
          String(profile.assigneeId),
          assigneeRole,
          String(profile._id),
          year,
          ctx.locale
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          skippedDetails.push({ assigneeId: target.assigneeId, reason: "active_profile_created_concurrently" });
          continue;
        }
        throw error;
      }
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "target_profile.bulk_tabular_create",
      resource: "targets",
      resourceId: "bulk-tabular",
      meta: { count: results.length, year },
      req,
    });

    return NextResponse.json({
      profiles: results,
      created: results.length,
      skipped: skippedDetails.length,
      skippedDetails,
    }, { status: 201 });
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
      void notifyTargetAssigned(
        String(profile.assigneeId),
        src.assigneeRole as "agent" | "super_agent",
        String(profile._id),
        body.targetYear,
        ctx.locale
      );
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
  const eligibleAssigneeIds = await getEligibleAssigneeIds([body.assigneeId], body.assigneeRole);

  if (!eligibleAssigneeIds.has(body.assigneeId)) {
    return NextResponse.json(
      { error: "The selected assignee is inactive or no longer eligible for target assignment" },
      { status: 400 }
    );
  }

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

  const monthlyResolution = resolveMonthlyTargets(
    {
      employerTarget: body.employerTarget,
      employeeTarget: body.employeeTarget,
      financeTarget: body.financeTarget,
    },
    body.distributionStrategy ?? "equal",
    body.monthlyTargets,
  );

  if ("error" in monthlyResolution) {
    return NextResponse.json(
      { error: monthlyResolution.error, details: monthlyResolution.details },
      { status: 400 },
    );
  }

  let profile: ITargetProfile;
  try {
    profile = await TargetProfile.create({
      ...body,
      assignedBy: ctx.userId,
      monthlyTargets: monthlyResolution.monthlyTargets,
      status: "active",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "An active target profile already exists for this person and year" },
        { status: 409 },
      );
    }

    throw error;
  }

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

  void notifyTargetAssigned(
    String(profile.assigneeId),
    body.assigneeRole,
    String(profile._id),
    body.year,
    ctx.locale
  );

  return NextResponse.json({ profile }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
