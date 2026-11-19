import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfiles, expectedProgressPct } from "@/lib/targets/profileAchievementCalculator";
import { targetPace } from "@/lib/targets/pace";
import { profitTotals } from "@/lib/targets/profitTotals";
import { categoriesOf } from "@/lib/targets/profitReport";
import { loadPreviousYearProfits, loadTargetReport } from "@/lib/targets/loadReport";
import { targetInsights } from "@/lib/targets/insights";
import { defaultReportYear } from "@/lib/targets/reportYear";
import { isValidObjectId } from "@/lib/security/sanitize";
import { calculateKpis, achievement, kpiOwnerKey } from "@/lib/targets/kpiCalculator";
import { fromStoredPeriods, defaultBounds } from "@/lib/targets/schedule";

interface AuthCtx { userId: string; role: string; locale: string; }

/** The TargetProfile schema's own bounds. */
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

const round2 = (value: number) => Math.round(value * 100) / 100;

type PeriodType = "month" | "quarter" | "year";

/** Parse and validate period query parameters. Returns error message if invalid. */
function parsePeriodParams(
  periodParam: string | null,
  monthParam: string | null,
  quarterParam: string | null,
  _year: number,
): { error?: string; period?: PeriodType; month?: number; quarter?: number } {
  const period = (periodParam || "month") as PeriodType;
  if (!["month", "quarter", "year"].includes(period)) {
    return { error: "period must be 'month', 'quarter', or 'year'" };
  }

  if (period === "month") {
    if (!monthParam) return { error: "month is required when period=month" };
    const month = Number.parseInt(monthParam, 10);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "month must be an integer from 1 to 12" };
    }
    return { period, month };
  }

  if (period === "quarter") {
    if (!quarterParam) return { error: "quarter is required when period=quarter" };
    const quarter = Number.parseInt(quarterParam, 10);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      return { error: "quarter must be an integer from 1 to 4" };
    }
    return { period, quarter };
  }

  return { period };
}

/** Get the start and end dates for a period. */
function getPeriodBounds(period: PeriodType, month?: number, quarter?: number, _year?: number): { startDate: string; endDate: string } {
  const year = _year || new Date().getFullYear();

  if (period === "month" && month) {
    const monthStr = String(month).padStart(2, "0");
    const days = [31, year % 4 === 0 && year % 100 !== 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return {
      startDate: `${year}-${monthStr}-01`,
      endDate: `${year}-${monthStr}-${String(days[month - 1]).padStart(2, "0")}`,
    };
  }

  if (period === "quarter" && quarter) {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const days = [31, year % 4 === 0 && year % 100 !== 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return {
      startDate: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      endDate: `${year}-${String(endMonth).padStart(2, "0")}-${String(days[endMonth - 1]).padStart(2, "0")}`,
    };
  }

  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

interface KpiPeriodInfo {
  type: PeriodType;
  month?: number;
  quarter?: number;
  startDate: string;
  endDate: string;
}

interface KpiMetric {
  target: number | null;
  actual: number;
  pct: number | null;
}

interface KpiRevenue extends KpiMetric {
  currency: string;
}

interface OrgKpi {
  jobs: KpiMetric;
  onboarded: KpiMetric;
  revenue: KpiRevenue[];
  commission: {
    agent: { pending: number; approved: number; paid: number };
    superAgent: { pending: number; approved: number; paid: number };
  };
}

interface KpiRow {
  profileId: string;
  assigneeId: string;
  name: string;
  role: "agent" | "super_agent";
  currency: string;
  setByRole?: string;
  overriddenByAdmin?: boolean;
  teamSize?: number;
  jobs: KpiMetric;
  onboarded: KpiMetric;
  revenue: KpiRevenue;
  status: "on_track" | "behind" | "at_risk" | null;
}

interface KpiResponse {
  period: KpiPeriodInfo;
  org: OrgKpi;
  rows: KpiRow[];
}

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-report?year=                                */
/*  One year of profit targets against what was achieved: totals, the  */
/*  month by month line, where the profit came from, and every         */
/*  target's progress, completion status, growth and schedule. With no */
/*  year it opens on the one that has targets.                         */
/*                                                                     */
/*  GET  /api/admin/target-report?profileId=                           */
/*  The full report of one super agent (with their team) or agent.     */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const searchParams = new URL(req.url).searchParams;
  const profileId = searchParams.get("profileId");
  if (profileId) {
    if (!isValidObjectId(profileId)) return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
    const profile = await TargetProfile.findOne({
      _id: profileId,
      ...PROFIT_TARGET_FILTER,
      status: { $ne: "cancelled" },
    }).lean();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ report: await loadTargetReport(profile, { includeTeam: true }) });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const yearsWithTargets = (await TargetProfile.distinct("year", { ...PROFIT_TARGET_FILTER, status: "active" })) as number[];
  const requested = Number.parseInt(searchParams.get("year") ?? "", 10);
  const year = Number.isInteger(requested) && requested >= MIN_YEAR && requested <= MAX_YEAR
    ? requested
    : defaultReportYear(yearsWithTargets, currentYear);

  const profiles = await TargetProfile.find({ ...PROFIT_TARGET_FILTER, year, status: "active" }).lean();

  const [enriched, users] = await Promise.all([
    profiles.length > 0 ? enrichProfiles(profiles as unknown as Record<string, unknown>[]) : Promise.resolve([]),
    User.find({ _id: { $in: profiles.map((profile) => profile.assigneeId) } }).select("_id name email").lean(),
  ]);
  const previousProfit = enriched.length > 0 ? await loadPreviousYearProfits(enriched, year) : new Map<string, number>();
  const insightsOf = new Map(enriched.map((profile) => [profile._id, targetInsights(profile, previousProfit.get(profile._id) ?? 0, now)]));
  const userById = new Map(users.map((user) => [String(user._id), user]));

  /* Totals count each target once. A super agent's profit already covers their
     agents, so only top-level profiles add up — an agent whose parent plan is
     not active this year stands on its own. */
  const activeIds = new Set(enriched.map((profile) => profile._id));
  const topLevel = enriched.filter((profile) => !profile.parentProfileId || !activeIds.has(profile.parentProfileId));
  const profit = profitTotals(topLevel);
  const mainCurrency = profit.currency;
  // Money is never added across currencies, so the breakdowns follow the main one.
  const mainTopLevel = topLevel.filter((profile) => profile.currency === mainCurrency);

  // What the plans expect by now, weighted by size: each schedule has its own pace (a
  // weekly plan and an annual one are not at the same point on the same day).
  const targetSum = mainTopLevel.reduce((sum, profile) => sum + profile.profitTarget, 0);
  const expectedProgress = targetSum > 0
    ? Math.round(mainTopLevel.reduce((sum, profile) => sum + profile.expectedProgress * profile.profitTarget, 0) / targetSum)
    : expectedProgressPct(year, now);

  const pace = { achieved: 0, onPace: 0, behind: 0, notStarted: 0 };
  for (const profile of enriched) pace[insightsOf.get(profile._id)!.status] += 1;

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const point = { month: `${year}-${String(month).padStart(2, "0")}`, target: 0, achieved: 0 };
    for (const profile of mainTopLevel) {
      const row = profile.monthlyAchievements.find((entry) => entry.month === month);
      if (!row) continue;
      point.target += row.profitTarget;
      point.achieved += row.profitAchieved;
    }
    return { ...point, target: round2(point.target), achieved: round2(point.achieved) };
  });

  const drivers = mainTopLevel.reduce(
    (total, profile) => ({
      revenue: round2(total.revenue + profile.drivers.revenue),
      commissionCost: round2(total.commissionCost + profile.drivers.commissionCost),
      invoicesPaid: total.invoicesPaid + profile.drivers.invoicesPaid,
      placements: total.placements + profile.drivers.placements,
      newEmployers: total.newEmployers + profile.drivers.newEmployers,
    }),
    { revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 },
  );

  const categoryProfit = new Map<string, number>();
  for (const profile of mainTopLevel) {
    for (const row of profile.byCategory) {
      categoryProfit.set(row.category, (categoryProfit.get(row.category) ?? 0) + row.profit);
    }
  }
  const byCategory = categoriesOf(
    [...categoryProfit.entries()]
      .map(([category, value]) => ({ category, profit: round2(value) }))
      .sort((left, right) => right.profit - left.profit),
  );

  const people = enriched
    .map((profile) => {
      const user = userById.get(profile.assigneeId);
      return {
        id: profile._id,
        userId: profile.assigneeId,
        parentProfileId: profile.parentProfileId ?? null,
        name: user?.name ?? "",
        email: user?.email ?? "",
        role: profile.assigneeRole as "agent" | "super_agent",
        region: profile.region ?? null,
        currency: profile.currency,
        profitTarget: profile.profitTarget,
        profitAchieved: profile.profitAchieved,
        progress: profile.profitProgress,
        pace: targetPace(profile),
        expectedProgress: profile.expectedProgress,
        incentiveTier: profile.incentiveTier,
        periodType: profile.periodType,
        periods: profile.periods,
        insights: insightsOf.get(profile._id)!,
      };
    })
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name));

  // Calculate KPIs for kpi3 profiles
  const periodParam = searchParams.get("period");
  const monthParam = searchParams.get("month");
  const quarterParam = searchParams.get("quarter");
  const periodValidation = parsePeriodParams(periodParam, monthParam, quarterParam, year);

  let kpiResponse: KpiResponse | null = null;
  if (!periodValidation.error) {
    // Filter enriched to get only kpi3 profiles - enriched has all fields we need
    const kpi3Profiles: Array<{
      _id: string;
      assigneeId: string;
      assigneeRole: "agent" | "super_agent";
      currency: string;
      year?: number;
      parentProfileId?: string;
      periods?: Array<{ startDate: Date | string; endDate: Date | string; profitTarget: number; jobTarget?: number; conversionTarget?: number; revenueTarget?: number }>;
      jobTarget?: number;
      conversionTarget?: number;
      revenueTarget?: number;
      setByRole?: string;
      overriddenByAdmin?: boolean;
    }> = enriched.filter((p) => {
      const matchingProfile = profiles.find((prof) => String(prof._id) === String(p._id));
      return matchingProfile?.targetType === "kpi3";
    }) as unknown as typeof kpi3Profiles;

    if (kpi3Profiles.length > 0) {
      const kpiSources = kpi3Profiles.map((profile) => {
        let bounds: Array<{ startDate: string; endDate: string }>;
        if (profile.periods) {
          const schedule = fromStoredPeriods(profile.periods);
          bounds = schedule.map((p) => ({ startDate: p.startDate, endDate: p.endDate }));
        } else {
          bounds = defaultBounds(profile.year === year ? "monthly" : "annual", year).map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
          }));
        }
        return {
          userId: String(profile.assigneeId),
          role: profile.assigneeRole as "agent" | "super_agent",
          currency: profile.currency,
          periods: bounds,
        };
      });

      const kpiMap = await calculateKpis(kpiSources, year);

      // Find the period bounds
      const { startDate, endDate } = getPeriodBounds(
        periodValidation.period || "month",
        periodValidation.month,
        periodValidation.quarter,
        year,
      );

      // Build org-level totals
      const orgJobs = { target: 0, actual: 0 };
      const orgOnboarded = { target: 0, actual: 0 };
      const orgRevenues = new Map<string, { target: number; actual: number }>();
      const orgCommission = { agent: { pending: 0, approved: 0, paid: 0 }, superAgent: { pending: 0, approved: 0, paid: 0 } };

      const rows: KpiRow[] = [];
      const topLevelKpi3 = kpi3Profiles.filter(
        (profile) => !profile.parentProfileId || !new Set(kpi3Profiles.map((p) => p._id)).has(String(profile.parentProfileId)),
      );

      for (const profile of kpi3Profiles) {
        const key = kpiOwnerKey(profile.assigneeRole, String(profile.assigneeId));
        const kpi = kpiMap.get(key);
        if (!kpi) continue;

        // Aggregate for org totals and rows
        const isTopLevel = topLevelKpi3.some((p) => String(p._id) === String(profile._id));
        const isAgent = profile.assigneeRole === "agent";

        if (isTopLevel) {
          // Get period target by summing matching periods
          let periodJobTarget = 0;
          let periodConversionTarget = 0;
          let periodRevenueTarget = 0;

          if (profile.periods) {
            for (const period of profile.periods) {
              const pStart = typeof period.startDate === "string" ? period.startDate : period.startDate.toISOString().slice(0, 10);
              const pEnd = typeof period.endDate === "string" ? period.endDate : period.endDate.toISOString().slice(0, 10);
              if (pStart <= endDate && pEnd >= startDate) {
                periodJobTarget += period.jobTarget || 0;
                periodConversionTarget += period.conversionTarget || 0;
                periodRevenueTarget += period.revenueTarget || 0;
              }
            }
          } else {
            periodJobTarget = profile.jobTarget || 0;
            periodConversionTarget = profile.conversionTarget || 0;
            periodRevenueTarget = profile.revenueTarget || 0;
          }

          // Get actual values for the period
          let periodJobs = 0;
          let periodOnboarded = 0;
          const periodRevByCity = new Map<string, number>();

          if (periodValidation.period === "month" && periodValidation.month) {
            const monthKpi = kpi.months[periodValidation.month - 1];
            if (monthKpi) {
              periodJobs = monthKpi.jobs;
              periodOnboarded = monthKpi.onboarded;
              for (const event of kpi.otherCurrencies) {
                periodRevByCity.set(event.currency, event.revenue);
              }
            }
          } else if (periodValidation.period === "quarter" && periodValidation.quarter) {
            // Sum months in the quarter
            const startMonth = (periodValidation.quarter - 1) * 3;
            const endMonth = startMonth + 3;
            for (let m = startMonth; m < endMonth; m++) {
              const monthKpi = kpi.months[m];
              if (monthKpi) {
                periodJobs += monthKpi.jobs;
                periodOnboarded += monthKpi.onboarded;
              }
            }
            // For other currencies, sum them
            for (const event of kpi.otherCurrencies) {
              periodRevByCity.set(event.currency, (periodRevByCity.get(event.currency) ?? 0) + event.revenue);
            }
          } else {
            // Year total
            periodJobs = kpi.totals.jobs;
            periodOnboarded = kpi.totals.onboarded;
            for (const event of kpi.otherCurrencies) {
              periodRevByCity.set(event.currency, event.revenue);
            }
          }

          // Add to org totals (only if this is a top-level agent not under a super agent in this year's data)
          orgJobs.target += periodJobTarget;
          orgJobs.actual += periodJobs;
          orgOnboarded.target += periodConversionTarget;
          orgOnboarded.actual += periodOnboarded;
          orgRevenues.set(profile.currency, {
            target: (orgRevenues.get(profile.currency)?.target ?? 0) + periodRevenueTarget,
            actual: (orgRevenues.get(profile.currency)?.actual ?? 0) + kpi.totals.revenue,
          });

          // Add commission to org totals
          if (isAgent) {
            orgCommission.agent.pending += kpi.commission.pending;
            orgCommission.agent.approved += kpi.commission.approved;
            orgCommission.agent.paid += kpi.commission.paid;
          } else {
            orgCommission.superAgent.pending += kpi.commission.pending;
            orgCommission.superAgent.approved += kpi.commission.approved;
            orgCommission.superAgent.paid += kpi.commission.paid;
          }
        }

        // Build row (only for top-level and kpi3 profiles, exclude agents under SAs for team-only rule)
        if (isTopLevel) {
          const user = userById.get(profile.assigneeId);

          // Calculate period targets and actuals for this row
          let rowPeriodJobTarget = 0;
          let rowPeriodConversionTarget = 0;
          let rowPeriodRevenueTarget = 0;

          if (profile.periods) {
            for (const period of profile.periods) {
              const pStart = typeof period.startDate === "string" ? period.startDate : period.startDate.toISOString().slice(0, 10);
              const pEnd = typeof period.endDate === "string" ? period.endDate : period.endDate.toISOString().slice(0, 10);
              if (pStart <= endDate && pEnd >= startDate) {
                rowPeriodJobTarget += period.jobTarget || 0;
                rowPeriodConversionTarget += period.conversionTarget || 0;
                rowPeriodRevenueTarget += period.revenueTarget || 0;
              }
            }
          } else {
            rowPeriodJobTarget = profile.jobTarget || 0;
            rowPeriodConversionTarget = profile.conversionTarget || 0;
            rowPeriodRevenueTarget = profile.revenueTarget || 0;
          }

          // Get actual values for the row
          let rowPeriodJobs = 0;
          let rowPeriodOnboarded = 0;
          let rowPeriodRevenue = 0;

          if (periodValidation.period === "month" && periodValidation.month) {
            const monthKpi = kpi.months[periodValidation.month - 1];
            if (monthKpi) {
              rowPeriodJobs = monthKpi.jobs;
              rowPeriodOnboarded = monthKpi.onboarded;
              rowPeriodRevenue = monthKpi.revenue;
            }
          } else if (periodValidation.period === "quarter" && periodValidation.quarter) {
            const startMonth = (periodValidation.quarter - 1) * 3;
            const endMonth = startMonth + 3;
            for (let m = startMonth; m < endMonth; m++) {
              const monthKpi = kpi.months[m];
              if (monthKpi) {
                rowPeriodJobs += monthKpi.jobs;
                rowPeriodOnboarded += monthKpi.onboarded;
                rowPeriodRevenue += monthKpi.revenue;
              }
            }
          } else {
            rowPeriodJobs = kpi.totals.jobs;
            rowPeriodOnboarded = kpi.totals.onboarded;
            rowPeriodRevenue = kpi.totals.revenue;
          }

          // Calculate status (avg percentage >= 90 on_track, >= 60 behind, else at_risk)
          // Only calculate status if at least one target is set (> 0)
          const jobsPct = rowPeriodJobTarget > 0 ? achievement(rowPeriodJobs, rowPeriodJobTarget) : null;
          const onboardedPct = rowPeriodConversionTarget > 0 ? achievement(rowPeriodOnboarded, rowPeriodConversionTarget) : null;
          const revenuePct = rowPeriodRevenueTarget > 0 ? achievement(rowPeriodRevenue, rowPeriodRevenueTarget) : null;
          const percentages = [jobsPct, onboardedPct, revenuePct].filter((p) => p !== null);
          let status: "on_track" | "behind" | "at_risk" | null = null;
          if (percentages.length > 0) {
            const avg = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);
            if (avg >= 90) status = "on_track";
            else if (avg >= 60) status = "behind";
            else status = "at_risk";
          }

          rows.push({
            profileId: String(profile._id),
            assigneeId: String(profile.assigneeId),
            name: user?.name ?? "",
            role: profile.assigneeRole,
            currency: profile.currency,
            setByRole: profile.setByRole,
            overriddenByAdmin: profile.overriddenByAdmin,
            teamSize: profile.assigneeRole === "super_agent" ? kpi.byAgent.size : undefined,
            jobs: {
              target: rowPeriodJobTarget > 0 ? rowPeriodJobTarget : null,
              actual: rowPeriodJobs,
              pct: achievement(rowPeriodJobs, rowPeriodJobTarget),
            },
            onboarded: {
              target: rowPeriodConversionTarget > 0 ? rowPeriodConversionTarget : null,
              actual: rowPeriodOnboarded,
              pct: achievement(rowPeriodOnboarded, rowPeriodConversionTarget),
            },
            revenue: {
              target: rowPeriodRevenueTarget > 0 ? rowPeriodRevenueTarget : null,
              actual: rowPeriodRevenue,
              pct: achievement(rowPeriodRevenue, rowPeriodRevenueTarget),
              currency: profile.currency,
            },
            status,
          });
        }
      }

      // Build org revenue array
      const orgRevenueArray: KpiRevenue[] = Array.from(orgRevenues.entries())
        .map(([currency, { target, actual }]) => ({
          target: target > 0 ? target : null,
          actual,
          pct: achievement(actual, target),
          currency,
        }))
        .sort((a, b) => b.actual - a.actual);

      kpiResponse = {
        period: {
          type: periodValidation.period!,
          month: periodValidation.month,
          quarter: periodValidation.quarter,
          startDate,
          endDate,
        },
        org: {
          jobs: {
            target: orgJobs.target > 0 ? orgJobs.target : null,
            actual: orgJobs.actual,
            pct: achievement(orgJobs.actual, orgJobs.target),
          },
          onboarded: {
            target: orgOnboarded.target > 0 ? orgOnboarded.target : null,
            actual: orgOnboarded.actual,
            pct: achievement(orgOnboarded.actual, orgOnboarded.target),
          },
          revenue: orgRevenueArray,
          commission: orgCommission,
        },
        rows,
      };
    }
  }

  const response: Record<string, unknown> = {
    year,
    years: [...new Set([...yearsWithTargets, currentYear, year])].sort((left, right) => right - left),
    expectedProgress,
    totals: {
      profit,
      drivers,
      people: { total: enriched.length, ...pace },
    },
    monthly,
    byCategory,
    people,
  };

  if (!periodValidation.error && kpiResponse) {
    response.kpi = kpiResponse;
  }

  return NextResponse.json(response);
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
