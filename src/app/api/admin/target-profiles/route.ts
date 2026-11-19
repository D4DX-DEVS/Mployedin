import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER, type ITargetProfile } from "@/models/TargetProfile";
import { equalKpiPeriods, kpiPeriodIssues, manualKpiPeriods } from "@/lib/targets/kpiSchedule";
import { validateBody } from "@/lib/validators";
import {
  targetProfileCreateSchema,
  targetProfileBulkCreateSchema,
  targetProfileBulkTabularSchema,
  targetProfileCloneSchema,
} from "@/lib/validators/targetProfiles";
import { profitTotals } from "@/lib/targets/profitTotals";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import {
  cloneSchedule,
  fromStoredPeriods,
  resolveSchedule,
  toStoredPeriods,
  type PeriodType,
  type SchedulePeriod,
  type SplitStrategy,
} from "@/lib/targets/schedule";
import { calculateKpis, type KpiSource } from "@/lib/targets/kpiCalculator";
import { kpiPace, kpiRisk, yearElapsedPercent } from "@/lib/targets/kpiRisk";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetAssigned } from "@/lib/notifications/trigger";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { TargetProfileSortField } from "@/lib/targets/profileSortFields";

interface AuthCtx { userId: string; role: string; locale: string; }

/** The schedule a request asks for, checked; a sound one is stored as dates, a bad one is reported. */
function scheduleFor(input: {
  year: number;
  profitTarget: number;
  periodType?: PeriodType;
  strategy?: SplitStrategy;
  periods?: SchedulePeriod[];
}) {
  return resolveSchedule({
    year: input.year,
    profitTarget: input.profitTarget,
    periodType: input.periodType ?? "monthly",
    strategy: input.strategy ?? "equal",
    periods: input.periods,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000,
  );
}

interface SortableRow {
  assigneeName: string;
  teamSize: number;
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
  jobProgress: number;
  onboardedProgress: number;
  revenueProgress: number;
  /** kpi3: mean of the pillars that have a target; profit targets: profit progress. */
  overallProgress: number;
  riskScore: "high" | "medium" | "low";
}

const RISK_RANK: Record<SortableRow["riskScore"], number> = { low: 1, medium: 2, high: 3 };

/** One comparator per shared sort field. Anything else keeps date added (createdAt), newest first unless asc. */
const SORTERS: Record<TargetProfileSortField, (a: SortableRow, b: SortableRow) => number> = {
  name: (a, b) => a.assigneeName.localeCompare(b.assigneeName, undefined, { sensitivity: "base" }),
  teamSize: (a, b) => a.teamSize - b.teamSize,
  profitTarget: (a, b) => a.profitTarget - b.profitTarget,
  profitAchieved: (a, b) => a.profitAchieved - b.profitAchieved,
  // "Performance": the overall progress, whichever kind of target it is.
  profitProgress: (a, b) => a.overallProgress - b.overallProgress,
  jobProgress: (a, b) => a.jobProgress - b.jobProgress,
  onboardedProgress: (a, b) => a.onboardedProgress - b.onboardedProgress,
  revenueProgress: (a, b) => a.revenueProgress - b.revenueProgress,
  risk: (a, b) => RISK_RANK[a.riskScore] - RISK_RANK[b.riskScore],
};

function sortRows<T extends SortableRow>(rows: T[], sortBy: string | null, order: "asc" | "desc"): T[] {
  const compare = sortBy && Object.hasOwn(SORTERS, sortBy) ? SORTERS[sortBy as TargetProfileSortField] : undefined;
  // No sortBy = date added. Rows arrive createdAt desc, so oldest-first is the
  // reverse; an unknown field keeps the default order as it is.
  if (!compare) return !sortBy && order === "asc" ? [...rows].reverse() : rows;
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compare(a, b) * direction);
}

/** The tiles: jobs and onboarded add up; revenue stays per currency. Top-level rows only, so a team counts once. */
function kpiTotals(rows: Array<Record<string, unknown>>) {
  const jobs = { target: 0, actual: 0 };
  const onboarded = { target: 0, actual: 0 };
  const revenue = new Map<string, { currency: string; target: number; actual: number }>();
  for (const row of rows) {
    if (row.targetType !== "kpi3") continue;
    jobs.target += Number(row.jobTarget) || 0;
    jobs.actual += Number(row.jobActual) || 0;
    onboarded.target += Number(row.conversionTarget) || 0;
    onboarded.actual += Number(row.onboardedActual) || 0;
    const currency = String(row.currency || "AED");
    const r = revenue.get(currency) ?? { currency, target: 0, actual: 0 };
    r.target += Number(row.revenueTarget) || 0;
    r.actual += Number(row.revenueActual) || 0;
    revenue.set(currency, r);
  }
  return { jobs, onboarded, revenue: [...revenue.values()].sort((a, b) => b.target - a.target) };
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
  const search = (searchParams.get("search")?.trim() ?? "").trim().toLowerCase();
  const risk = searchParams.get("risk");
  const completion = searchParams.get("completion");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const query: Record<string, unknown> = { ...PROFIT_TARGET_FILTER, year };
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

  // Team size is the agents who point at the super agent, the same team the reports use.
  const saIds = profiles
    .filter((p) => p.assigneeRole === "super_agent")
    .map((p) => String(p.assigneeId));
  const saDocs = saIds.length
    ? await SuperAgent.find({ userId: { $in: saIds } }).select("_id userId canSetRevenueTargets").lean()
    : [];
  const teamCounts = saDocs.length
    ? await Agent.aggregate<{ _id: unknown; count: number }>([
        { $match: { superAgentId: { $in: saDocs.map((sa) => sa._id) } } },
        { $group: { _id: "$superAgentId", count: { $sum: 1 } } },
      ])
    : [];
  const countBySaDoc = new Map(teamCounts.map((row) => [String(row._id), row.count]));
  const teamSizeMap = new Map(saDocs.map((sa) => [String(sa.userId), countBySaDoc.get(String(sa._id)) ?? 0]));
  const revenuePermission = new Map(saDocs.map((sa) => [String(sa.userId), Boolean((sa as { canSetRevenueTargets?: boolean }).canSetRevenueTargets)]));

  // Enrich with achievements
  const enriched = await enrichProfiles(profiles as Record<string, unknown>[]);

  // Calculate KPI3 progress for each profile that has KPI targets
  const kpiSources: KpiSource[] = profiles
    .filter((p) => p.targetType === "kpi3")
    .map((p) => ({
      userId: String(p.assigneeId),
      role: p.assigneeRole === "super_agent" ? "super_agent" : "agent",
      currency: p.currency,
      periods: fromStoredPeriods(p.periods),
    }));

  const kpiMap = kpiSources.length > 0 ? await calculateKpis(kpiSources, year) : new Map();

  // Helper to calculate percentage progress
  const pct = (actual: number, target: number): number => {
    if (target <= 0) return 0;
    return Math.min(Math.round((actual / target) * 100), 999);
  };

  const allRows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    const pRecord = p as unknown as Record<string, unknown>;

    // Get KPI data for this profile
    let jobProgress = 0;
    let onboardedProgress = 0;
    let revenueProgress = 0;
    let actuals = { jobs: 0, onboarded: 0, revenue: 0 };
    let overallProgress = p.profitProgress;
    let riskScore = p.riskScore;

    if (pRecord.targetType === "kpi3") {
      const role = p.assigneeRole === "super_agent" ? "super_agent" : "agent";
      const keyPrefix = `${role}:${p.assigneeId}`;
      const kpi = kpiMap.get(keyPrefix);

      if (kpi) {
        const jobTarget = typeof pRecord.jobTarget === "number" ? pRecord.jobTarget : 0;
        const conversionTarget = typeof pRecord.conversionTarget === "number" ? pRecord.conversionTarget : 0;
        const revenueTarget = typeof pRecord.revenueTarget === "number" ? pRecord.revenueTarget : 0;

        jobProgress = pct(kpi.totals.jobs, jobTarget);
        onboardedProgress = pct(kpi.totals.onboarded, conversionTarget);
        revenueProgress = pct(kpi.totals.revenue, revenueTarget);
        actuals = kpi.totals;
      }
      // Performance and risk come from the three targets, not from profit.
      const set = [
        [jobProgress, pRecord.jobTarget],
        [onboardedProgress, pRecord.conversionTarget],
        [revenueProgress, pRecord.revenueTarget],
      ].filter(([, target]) => typeof target === "number" && target > 0).map(([progress]) => progress as number);
      // Each part counts at most 100%, so beating one target can't hide a missed one
      // (57 of 24 jobs with 0 revenue is not "88% overall").
      overallProgress = set.length ? Math.round(set.reduce((a, b) => a + Math.min(b, 100), 0) / set.length) : 0;
      const kpiInput = {
        actual: actuals,
        target: { jobTarget: Number(pRecord.jobTarget) || 0, conversionTarget: Number(pRecord.conversionTarget) || 0, revenueTarget: Number(pRecord.revenueTarget) || 0 },
        expectedProgress: yearElapsedPercent(new Date(), year),
      };
      riskScore = kpiRisk(kpiInput) ? "high" : kpiPace(kpiInput) === "behind" ? "medium" : "low";
    }

    return {
      ...p,
      assigneeName: user?.name ?? "Unknown",
      assigneeEmail: user?.email ?? "",
      teamSize: teamSizeMap.get(p.assigneeId) ?? 0,
      canSetRevenueTargets: revenuePermission.get(p.assigneeId) ?? false,
      jobProgress,
      onboardedProgress,
      revenueProgress,
      jobActual: actuals.jobs,
      onboardedActual: actuals.onboarded,
      revenueActual: actuals.revenue,
      overallProgress,
      riskScore,
    };
  });

  // A super agent's profit already covers their agents', so only top-level
  // profiles add up; an agent whose parent is not in the list stands alone.
  const listedIds = new Set(allRows.map((r) => r._id));
  const topLevel = allRows.filter((r) => !r.parentProfileId || !listedIds.has(r.parentProfileId));

  // Aggregated totals
  const totals = {
    totalProfiles: allRows.length,
    supervisors: allRows.filter((r) => r.assigneeRole === "super_agent").length,
    totalTeamSize: allRows.reduce((s, r) => s + r.teamSize, 0),
    // One currency at a time: INR plans are never added to AED ones.
    profit: profitTotals(topLevel),
    avgProgress: allRows.length > 0
      ? Math.round(allRows.reduce((s, r) => s + r.overallProgress, 0) / allRows.length)
      : 0,
    kpi: kpiTotals(topLevel),
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
  const rows = sortRows(filteredRows, sortBy, sortOrder).slice(skip, skip + limit);

  return NextResponse.json({
    profiles: rows,
    totals,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/target-profiles — create profit targets           */
/*  Admin sets super-agent targets; agents are funded by their super   */
/*  agent through /api/super-agent/target-profiles?action=distribute.  */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Bulk create: the same target for several super agents
  if (action === "bulk") {
    const body = await validateBody(req, targetProfileBulkCreateSchema);
    const eligibleAssigneeIds = await getEligibleAssigneeIds(body.assigneeIds, body.assigneeRole);

    if (eligibleAssigneeIds.size !== body.assigneeIds.length) {
      return NextResponse.json(
        { error: "One or more selected assignees are inactive or no longer eligible for target assignment" },
        { status: 400 }
      );
    }

    const schedule = scheduleFor({
      year: body.year,
      profitTarget: body.profitTarget,
      periodType: body.periodType,
      strategy: body.distributionStrategy,
      periods: body.periods,
    });

    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error, details: schedule.details }, { status: 400 });
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
          profitTarget: body.profitTarget,
          currency: body.currency ?? "AED",
          periodType: body.periodType,
          distributionStrategy: body.distributionStrategy ?? "equal",
          periods: toStoredPeriods(schedule.periods),
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

  // Bulk tabular: each supervisor gets an individual target
  if (action === "bulk-tabular") {
    const { year, assigneeRole, currency, region, targets } = await validateBody(req, targetProfileBulkTabularSchema);

    const eligibleIds = await getEligibleAssigneeIds(targets.map((target) => target.assigneeId), assigneeRole);
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

      const isKpi = target.targetType === "kpi3";
      const kpiTotals = { jobTarget: target.jobTarget, conversionTarget: target.conversionTarget, revenueTarget: target.revenueTarget };
      let schedule: ReturnType<typeof scheduleFor>;
      if (isKpi) {
        // Monthly, three figures a month: equal split built here, or the admin's own months checked.
        const manual = target.distributionStrategy === "custom" && target.periods;
        if (manual && kpiPeriodIssues(target.periods!, kpiTotals).length > 0) {
          schedule = { error: "The months must add up to each yearly target", details: [] };
        } else {
          schedule = { periods: manual ? manualKpiPeriods(year, target.periods!) : equalKpiPeriods(year, kpiTotals) };
        }
      } else {
        schedule = scheduleFor({
          year,
          profitTarget: target.profitTarget,
          periodType: target.periodType,
          strategy: target.distributionStrategy,
          periods: target.periods,
        });
      }

      if ("error" in schedule) {
        skippedDetails.push({ assigneeId: target.assigneeId, reason: "distribution_invalid" });
        continue;
      }

      try {
        const profile = await TargetProfile.create({
          assigneeId: target.assigneeId,
          assigneeRole,
          assignedBy: ctx.userId,
          year,
          region,
          targetType: target.targetType,
          // Profit is an admin finance figure only on profit targets (R9).
          profitTarget: isKpi ? 0 : target.profitTarget,
          ...(isKpi ? { ...kpiTotals, setByRole: "admin" } : {}),
          currency: target.currency ?? currency,
          periodType: isKpi ? "monthly" : target.periodType ?? "monthly",
          distributionStrategy: target.distributionStrategy ?? "equal",
          periods: toStoredPeriods(schedule.periods),
          notes: target.notes,
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
      ...PROFIT_TARGET_FILTER,
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

      if (src.targetType === "kpi3") {
        // Three targets scaled by the change: counts stay whole, revenue to the cent; months split equally.
        const totals = {
          jobTarget: Math.round((src.jobTarget ?? 0) * adj),
          conversionTarget: Math.round((src.conversionTarget ?? 0) * adj),
          revenueTarget: Math.round((src.revenueTarget ?? 0) * adj * 100) / 100,
        };
        const profile = await TargetProfile.create({
          assigneeId: src.assigneeId,
          assigneeRole: src.assigneeRole,
          assignedBy: ctx.userId,
          year: body.targetYear,
          region: src.region,
          targetType: "kpi3",
          profitTarget: 0,
          ...totals,
          setByRole: src.setByRole ?? "admin",
          currency: src.currency,
          periodType: "monthly",
          distributionStrategy: "equal",
          periods: toStoredPeriods(equalKpiPeriods(body.targetYear, totals)),
          notes: `Cloned from ${body.sourceYear} with ${body.adjustmentPct ?? 0}% adjustment`,
          status: "active",
        });
        cloned.push(profile);
        void notifyTargetAssigned(String(profile.assigneeId), src.assigneeRole as "agent" | "super_agent", String(profile._id), body.targetYear, ctx.locale);
        continue;
      }

      const profitTarget = Math.round(src.profitTarget * adj * 100) / 100;

      const cloned_ = cloneSchedule(
        {
          periodType: (src.periodType as PeriodType | undefined) ?? "monthly",
          strategy: (src.distributionStrategy as SplitStrategy | undefined) ?? "equal",
          periods: fromStoredPeriods(src.periods),
        },
        body.targetYear,
        profitTarget,
      );

      const profile = await TargetProfile.create({
        assigneeId: src.assigneeId,
        assigneeRole: src.assigneeRole,
        assignedBy: ctx.userId,
        year: body.targetYear,
        region: src.region,
        profitTarget,
        currency: src.currency,
        periodType: src.periodType ?? "monthly",
        distributionStrategy: cloned_.strategy,
        periods: toStoredPeriods(cloned_.periods),
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

  const schedule = scheduleFor({
    year: body.year,
    profitTarget: body.profitTarget,
    periodType: body.periodType,
    strategy: body.distributionStrategy,
    periods: body.periods,
  });

  if ("error" in schedule) {
    return NextResponse.json({ error: schedule.error, details: schedule.details }, { status: 400 });
  }

  let profile: ITargetProfile;
  try {
    profile = await TargetProfile.create({
      targetType: body.targetType ?? "kpi3",
      assigneeId: body.assigneeId,
      assigneeRole: body.assigneeRole,
      assignedBy: ctx.userId,
      year: body.year,
      region: body.region,
      profitTarget: body.profitTarget,
      currency: body.currency ?? "AED",
      jobTarget: body.jobTarget,
      conversionTarget: body.conversionTarget,
      revenueTarget: body.revenueTarget,
      setByRole: "admin",
      periodType: body.periodType,
      distributionStrategy: body.distributionStrategy,
      periods: toStoredPeriods(schedule.periods),
      notes: body.notes,
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
    action: "target.create",
    resource: "targets",
    resourceId: String(profile._id),
    meta: {
      year: body.year,
      targetType: profile.targetType,
      assigneeId: body.assigneeId,
      assigneeRole: body.assigneeRole,
      profitTarget: body.profitTarget,
      jobTarget: body.jobTarget,
      conversionTarget: body.conversionTarget,
      revenueTarget: body.revenueTarget,
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
