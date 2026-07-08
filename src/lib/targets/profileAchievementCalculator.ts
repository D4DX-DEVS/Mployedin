/**
 * Achievement calculator for the unified TargetProfile module.
 * Computes real-time achievement for employer, employee, and finance categories
 * by querying the relevant collections.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { ITargetProfile, IMonthlyTarget } from "@/models/TargetProfile";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface DateRange {
  start: Date;
  end: Date;
}

function getDateRange(year: number, month?: number): DateRange {
  if (month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
}

async function getTeamAgentIds(superAgentUserId: string): Promise<string[]> {
  // Canonical SA scope: getSuperAgentScope(). Do not read sa.agentIds directly.
  const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
  const scope = await getSuperAgentScope(superAgentUserId);
  return (scope?.effectiveAgentIds ?? []).map(String);
}

async function getAgentDocId(userId: string): Promise<string | null> {
  const agent = await Agent.findOne({ userId }).select("_id").lean();
  return agent ? String(agent._id) : null;
}

/* ------------------------------------------------------------------ */
/*  Per-type achievement calculations                                  */
/* ------------------------------------------------------------------ */

async function calcEmployer(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  const { start, end } = getDateRange(year, month);

  if (role === "agent") {
    const agentId = await getAgentDocId(userId);
    if (!agentId) return 0;
    return Employer.countDocuments({
      agentId,
      createdAt: { $gte: start, $lte: end },
    });
  }

  const teamAgentIds = await getTeamAgentIds(userId);
  if (teamAgentIds.length === 0) return 0;
  return Employer.countDocuments({
    agentId: { $in: teamAgentIds },
    createdAt: { $gte: start, $lte: end },
  });
}

async function calcEmployee(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  const { start, end } = getDateRange(year, month);

  if (role === "agent") {
    const agentId = await getAgentDocId(userId);
    if (!agentId) return 0;
    return Placement.countDocuments({
      agentId,
      createdAt: { $gte: start, $lte: end },
    });
  }

  const teamAgentIds = await getTeamAgentIds(userId);
  if (teamAgentIds.length === 0) return 0;
  return Placement.countDocuments({
    agentId: { $in: teamAgentIds },
    createdAt: { $gte: start, $lte: end },
  });
}

async function calcFinance(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  const { start, end } = getDateRange(year, month);

  const matchStage: Record<string, unknown> = {
    status: { $in: ["approved", "paid"] },
    createdAt: { $gte: start, $lte: end },
  };

  if (role === "agent") {
    const agentIdStr = await getAgentDocId(userId);
    if (!agentIdStr) return 0;
    matchStage.agentId = new mongoose.Types.ObjectId(agentIdStr);
  } else {
    const teamAgentIdStrs = await getTeamAgentIds(userId);
    const sa = await SuperAgent.findOne({ userId }).select("_id").lean();
    if (teamAgentIdStrs.length === 0 && !sa) return 0;
    const orArms: Record<string, unknown>[] = [];
    if (teamAgentIdStrs.length > 0) {
      orArms.push({ agentId: { $in: teamAgentIdStrs.map((s) => new mongoose.Types.ObjectId(s)) } });
    }
    if (sa?._id) orArms.push({ superAgentId: sa._id });
    if (orArms.length === 0) return 0;
    matchStage.$or = orArms;
  }

  const result = await Commission.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Achievement result interfaces                                      */
/* ------------------------------------------------------------------ */

export interface AchievementResult {
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
}

export interface MonthlyAchievement extends AchievementResult {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
}

export type IncentiveTier = "none" | "bronze" | "silver" | "gold" | "platinum";

export interface EnrichedProfile {
  // Spread from ITargetProfile (lean)
  _id: string;
  assigneeId: string;
  assigneeRole: string;
  assignedBy: string;
  year: number;
  region?: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;
  distributionStrategy: string;
  monthlyTargets: IMonthlyTarget[];
  parentProfileId?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;

  // Enriched
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
  employerPending: number;
  employeePending: number;
  financePending: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: IncentiveTier;
  monthlyAchievements: MonthlyAchievement[];
}

/* ------------------------------------------------------------------ */
/*  Main — calculate all 3 achievements for a year                     */
/* ------------------------------------------------------------------ */

export async function calculateProfileAchievements(
  userId: string,
  role: "agent" | "super_agent",
  year: number
): Promise<AchievementResult> {
  await connectDB();
  const [employerAchieved, employeeAchieved, financeAchieved] =
    await Promise.all([
      calcEmployer(userId, role, year),
      calcEmployee(userId, role, year),
      calcFinance(userId, role, year),
    ]);
  return { employerAchieved, employeeAchieved, financeAchieved };
}

/* ------------------------------------------------------------------ */
/*  Calculate monthly achievements (for all 12 months)                 */
/* ------------------------------------------------------------------ */

export async function calculateMonthlyAchievements(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  monthlyTargets: IMonthlyTarget[]
): Promise<MonthlyAchievement[]> {
  await connectDB();

  const monthlyMap = new Map(monthlyTargets.map((mt) => [mt.month, mt]));
  const results: MonthlyAchievement[] = [];

  // Calculate in parallel for all distributed months
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const achievementPromises = months
    .filter((m) => monthlyMap.has(m))
    .map(async (month) => {
      const mt = monthlyMap.get(month)!;
      const [ea, emA, fA] = await Promise.all([
        calcEmployer(userId, role, year, month),
        calcEmployee(userId, role, year, month),
        calcFinance(userId, role, year, month),
      ]);
      const ep = mt.employerTarget > 0 ? Math.min(Math.round((ea / mt.employerTarget) * 100), 999) : 0;
      const emp = mt.employeeTarget > 0 ? Math.min(Math.round((emA / mt.employeeTarget) * 100), 999) : 0;
      const fp = mt.financeTarget > 0 ? Math.min(Math.round((fA / mt.financeTarget) * 100), 999) : 0;
      const overall = calculateOverallTargetProgress([
        { target: mt.employerTarget, progress: ep },
        { target: mt.employeeTarget, progress: emp },
        { target: mt.financeTarget, progress: fp },
      ]);

      return {
        month,
        employerTarget: mt.employerTarget,
        employeeTarget: mt.employeeTarget,
        financeTarget: mt.financeTarget,
        employerAchieved: ea,
        employeeAchieved: emA,
        financeAchieved: fA,
        employerProgress: ep,
        employeeProgress: emp,
        financeProgress: fp,
        overallProgress: overall,
      };
    });

  const resolved = await Promise.all(achievementPromises);
  results.push(...resolved);
  results.sort((a, b) => a.month - b.month);
  return results;
}

/* ------------------------------------------------------------------ */
/*  Enrich a profile with computed achievements + risk                  */
/* ------------------------------------------------------------------ */

function pct(achieved: number, target: number): number {
  return target > 0 ? Math.min(Math.round((achieved / target) * 100), 999) : 0;
}

export function calculateOverallTargetProgress(
  categories: { target: number; progress: number }[]
): number {
  const activeCategories = categories.filter((category) => category.target > 0);

  if (activeCategories.length === 0) {
    return 0;
  }

  const totalProgress = activeCategories.reduce((sum, category) => sum + category.progress, 0);
  return Math.min(Math.round(totalProgress / activeCategories.length), 999);
}

export function getIncentiveTier(overallProgress: number): IncentiveTier {
  if (overallProgress >= 100) return "platinum";
  if (overallProgress >= 80) return "gold";
  if (overallProgress >= 60) return "silver";
  if (overallProgress >= 40) return "bronze";
  return "none";
}

export async function enrichProfile(
  profile: Record<string, unknown>
): Promise<EnrichedProfile> {
  const userId = String(profile.assigneeId);
  const role = profile.assigneeRole as "agent" | "super_agent";
  const year = profile.year as number;
  const monthlyTargets = (profile.monthlyTargets ?? []) as IMonthlyTarget[];

  const achievements = await calculateProfileAchievements(userId, role, year);
  const monthlyAchievements = monthlyTargets.length > 0
    ? await calculateMonthlyAchievements(userId, role, year, monthlyTargets)
    : [];

  const empTarget = (profile.employerTarget as number) ?? 0;
  const emplTarget = (profile.employeeTarget as number) ?? 0;
  const finTarget = (profile.financeTarget as number) ?? 0;

  const employerProgress = pct(achievements.employerAchieved, empTarget);
  const employeeProgress = pct(achievements.employeeAchieved, emplTarget);
  const financeProgress = pct(achievements.financeAchieved, finTarget);
  const overallProgress = calculateOverallTargetProgress([
    { target: empTarget, progress: employerProgress },
    { target: emplTarget, progress: employeeProgress },
    { target: finTarget, progress: financeProgress },
  ]);

  // Risk calculation
  const currentMonth = new Date().getMonth() + 1;
  const expectedPct = Math.round((currentMonth / 12) * 100);
  const riskScore: "high" | "medium" | "low" =
    overallProgress < expectedPct - 20 ? "high" :
    overallProgress < expectedPct - 10 ? "medium" :
    "low";

  return {
    _id: String(profile._id),
    assigneeId: userId,
    assigneeRole: role,
    assignedBy: String(profile.assignedBy),
    year,
    region: profile.region as string | undefined,
    employerTarget: empTarget,
    employeeTarget: emplTarget,
    financeTarget: finTarget,
    currency: (profile.currency as string) ?? "AED",
    distributionStrategy: (profile.distributionStrategy as string) ?? "equal",
    monthlyTargets,
    parentProfileId: profile.parentProfileId ? String(profile.parentProfileId) : undefined,
    notes: profile.notes as string | undefined,
    status: (profile.status as string) ?? "active",
    createdAt: String(profile.createdAt),
    updatedAt: String(profile.updatedAt),

    ...achievements,
    employerProgress,
    employeeProgress,
    financeProgress,
    overallProgress,
    employerPending: Math.max(0, empTarget - achievements.employerAchieved),
    employeePending: Math.max(0, emplTarget - achievements.employeeAchieved),
    financePending: Math.max(0, finTarget - achievements.financeAchieved),
    riskScore,
    incentiveTier: getIncentiveTier(overallProgress),
    monthlyAchievements,
  } as EnrichedProfile;
}

/* ------------------------------------------------------------------ */
/*  Batch enrich multiple profiles                                     */
/*  Optimized: uses aggregate pipelines to count all agents in one     */
/*  query per collection instead of N queries per agent per month.     */
/* ------------------------------------------------------------------ */

async function batchCalcEmployerByMonth(
  agentDocIds: string[],
  year: number
): Promise<Map<string, Map<number, number>>> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const results = await Employer.aggregate([
    { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: { agentId: "$agentId", month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
  ]);

  const map = new Map<string, Map<number, number>>();
  for (const r of results) {
    const agentId = String(r._id.agentId);
    if (!map.has(agentId)) map.set(agentId, new Map());
    map.get(agentId)!.set(r._id.month, r.count);
  }
  return map;
}

async function batchCalcEmployeeByMonth(
  agentDocIds: string[],
  year: number
): Promise<Map<string, Map<number, number>>> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const results = await Placement.aggregate([
    { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: { agentId: "$agentId", month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
  ]);

  const map = new Map<string, Map<number, number>>();
  for (const r of results) {
    const agentId = String(r._id.agentId);
    if (!map.has(agentId)) map.set(agentId, new Map());
    map.get(agentId)!.set(r._id.month, r.count);
  }
  return map;
}

async function batchCalcFinanceByMonth(
  agentDocIds: string[],
  year: number
): Promise<Map<string, Map<number, number>>> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const results = await Commission.aggregate([
    { $match: { agentId: { $in: agentDocIds }, status: { $in: ["approved", "paid"] }, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: { agentId: "$agentId", month: { $month: "$createdAt" } }, total: { $sum: "$amount" } } },
  ]);

  const map = new Map<string, Map<number, number>>();
  for (const r of results) {
    const agentId = String(r._id.agentId);
    if (!map.has(agentId)) map.set(agentId, new Map());
    map.get(agentId)!.set(r._id.month, r.total);
  }
  return map;
}

export async function enrichProfiles(
  profiles: Record<string, unknown>[]
): Promise<EnrichedProfile[]> {
  if (profiles.length === 0) return [];
  await connectDB();

  // Check if all profiles are agents (common case for super-agent team view)
  const allAgentRole = profiles.every((p) => p.assigneeRole === "agent");

  if (!allAgentRole || profiles.length <= 1) {
    // Fallback to individual enrichment for mixed roles or single profiles
    return Promise.all(profiles.map(enrichProfile));
  }

  // Batch approach: resolve all agent doc IDs in one query
  const userIds = [...new Set(profiles.map((p) => String(p.assigneeId)))];
  const year = profiles[0].year as number;

  const agents = await Agent.find({ userId: { $in: userIds } })
    .select("_id userId")
    .lean();
  const userToAgentId = new Map(agents.map((a) => [String(a.userId), String(a._id)]));
  const agentIdToUserId = new Map(agents.map((a) => [String(a._id), String(a.userId)]));
  const agentDocIds = agents.map((a) => String(a._id));

  // 3 aggregate queries total (instead of 3 × 12 × N individual queries)
  const [employerMap, employeeMap, financeMap] = await Promise.all([
    batchCalcEmployerByMonth(agentDocIds, year),
    batchCalcEmployeeByMonth(agentDocIds, year),
    batchCalcFinanceByMonth(agentDocIds, year),
  ]);

  // Helper to sum all months for an agent
  function sumAllMonths(monthMap: Map<number, number> | undefined): number {
    if (!monthMap) return 0;
    let total = 0;
    for (const v of monthMap.values()) total += v;
    return total;
  }

  return profiles.map((profile) => {
    const userId = String(profile.assigneeId);
    const agentDocId = userToAgentId.get(userId) ?? "";
    const monthlyTargets = (profile.monthlyTargets ?? []) as IMonthlyTarget[];

    const empMonths = employerMap.get(agentDocId);
    const emplMonths = employeeMap.get(agentDocId);
    const finMonths = financeMap.get(agentDocId);

    const employerAchieved = sumAllMonths(empMonths);
    const employeeAchieved = sumAllMonths(emplMonths);
    const financeAchieved = sumAllMonths(finMonths);

    const empTarget = (profile.employerTarget as number) ?? 0;
    const emplTarget = (profile.employeeTarget as number) ?? 0;
    const finTarget = (profile.financeTarget as number) ?? 0;

    const employerProgress = pct(employerAchieved, empTarget);
    const employeeProgress = pct(employeeAchieved, emplTarget);
    const financeProgress = pct(financeAchieved, finTarget);
    const overallProgress = calculateOverallTargetProgress([
      { target: empTarget, progress: employerProgress },
      { target: emplTarget, progress: employeeProgress },
      { target: finTarget, progress: financeProgress },
    ]);

    // Monthly achievements from batch data
    const monthlyAchievements: MonthlyAchievement[] = monthlyTargets.map((mt) => {
      const ea = empMonths?.get(mt.month) ?? 0;
      const emA = emplMonths?.get(mt.month) ?? 0;
      const fA = finMonths?.get(mt.month) ?? 0;
      const ep = mt.employerTarget > 0 ? Math.min(Math.round((ea / mt.employerTarget) * 100), 999) : 0;
      const emp = mt.employeeTarget > 0 ? Math.min(Math.round((emA / mt.employeeTarget) * 100), 999) : 0;
      const fp = mt.financeTarget > 0 ? Math.min(Math.round((fA / mt.financeTarget) * 100), 999) : 0;
      const monthOverall = calculateOverallTargetProgress([
        { target: mt.employerTarget, progress: ep },
        { target: mt.employeeTarget, progress: emp },
        { target: mt.financeTarget, progress: fp },
      ]);
      return {
        month: mt.month,
        employerTarget: mt.employerTarget,
        employeeTarget: mt.employeeTarget,
        financeTarget: mt.financeTarget,
        employerAchieved: ea,
        employeeAchieved: emA,
        financeAchieved: fA,
        employerProgress: ep,
        employeeProgress: emp,
        financeProgress: fp,
        overallProgress: monthOverall,
      };
    });

    const currentMonth = new Date().getMonth() + 1;
    const expectedPct = Math.round((currentMonth / 12) * 100);
    const riskScore: "high" | "medium" | "low" =
      overallProgress < expectedPct - 20 ? "high" :
      overallProgress < expectedPct - 10 ? "medium" :
      "low";

    return {
      _id: String(profile._id),
      assigneeId: userId,
      assigneeRole: "agent",
      assignedBy: String(profile.assignedBy),
      year,
      region: profile.region as string | undefined,
      employerTarget: empTarget,
      employeeTarget: emplTarget,
      financeTarget: finTarget,
      currency: (profile.currency as string) ?? "AED",
      distributionStrategy: (profile.distributionStrategy as string) ?? "equal",
      monthlyTargets,
      parentProfileId: profile.parentProfileId ? String(profile.parentProfileId) : undefined,
      notes: profile.notes as string | undefined,
      status: (profile.status as string) ?? "active",
      createdAt: String(profile.createdAt),
      updatedAt: String(profile.updatedAt),
      employerAchieved,
      employeeAchieved,
      financeAchieved,
      employerProgress,
      employeeProgress,
      financeProgress,
      overallProgress,
      employerPending: Math.max(0, empTarget - employerAchieved),
      employeePending: Math.max(0, emplTarget - employeeAchieved),
      financePending: Math.max(0, finTarget - financeAchieved),
      riskScore,
      incentiveTier: getIncentiveTier(overallProgress),
      monthlyAchievements,
    } as EnrichedProfile;
  });
}
