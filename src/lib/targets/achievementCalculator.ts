/**
 * Achievement calculator for Target module.
 * Calculates real-time achievement values for employer, employee, and finance targets
 * by querying the relevant collections.
 */

import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";

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

/**
 * Get all agent doc IDs for a super_agent (their team).
 */
async function getTeamAgentIds(superAgentUserId: string): Promise<string[]> {
  const sa = await SuperAgent.findOne({ userId: superAgentUserId })
    .select("agentIds")
    .lean();
  if (!sa) return [];
  return (sa.agentIds ?? []).map(String);
}

/**
 * Get the agent doc _id for a given user ID.
 */
async function getAgentDocId(userId: string): Promise<string | null> {
  const agent = await Agent.findOne({ userId }).select("_id").lean();
  return agent ? String(agent._id) : null;
}

/**
 * Calculate employer achievement: count of employers created within the period.
 */
export async function calculateEmployerAchievement(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  await connectDB();
  const { start, end } = getDateRange(year, month);

  if (role === "agent") {
    const agentId = await getAgentDocId(userId);
    if (!agentId) return 0;
    return Employer.countDocuments({
      agentId,
      createdAt: { $gte: start, $lte: end },
    });
  }

  // super_agent: sum across team
  const teamAgentIds = await getTeamAgentIds(userId);
  if (teamAgentIds.length === 0) return 0;
  return Employer.countDocuments({
    agentId: { $in: teamAgentIds },
    createdAt: { $gte: start, $lte: end },
  });
}

/**
 * Calculate employee achievement: count of placements created within the period.
 */
export async function calculateEmployeeAchievement(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  await connectDB();
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

/**
 * Calculate finance achievement: sum of approved+paid commissions within the period.
 */
export async function calculateFinanceAchievement(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  month?: number
): Promise<number> {
  await connectDB();
  const { start, end } = getDateRange(year, month);

  const matchStage: Record<string, unknown> = {
    status: { $in: ["approved", "paid"] },
    createdAt: { $gte: start, $lte: end },
  };

  if (role === "agent") {
    const agentId = await getAgentDocId(userId);
    if (!agentId) return 0;
    matchStage.agentId = agentId;
  } else {
    const teamAgentIds = await getTeamAgentIds(userId);
    if (teamAgentIds.length === 0) return 0;
    matchStage.$or = [
      { agentId: { $in: teamAgentIds } },
      { superAgentId: userId },
    ];
  }

  const result = await Commission.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total ?? 0;
}

/**
 * Calculate achievement for a given target type.
 */
export async function calculateAchievement(
  userId: string,
  role: "agent" | "super_agent",
  type: "employer" | "employee" | "finance",
  year: number,
  month?: number
): Promise<number> {
  switch (type) {
    case "employer":
      return calculateEmployerAchievement(userId, role, year, month);
    case "employee":
      return calculateEmployeeAchievement(userId, role, year, month);
    case "finance":
      return calculateFinanceAchievement(userId, role, year, month);
    default:
      return 0;
  }
}

/**
 * Enrich a target document with its computed achievement value.
 */
export async function enrichTargetWithAchievement<
  T extends {
    assigneeId: { toString(): string };
    assigneeRole: string;
    type: string;
    year: number;
    month?: number;
  }
>(target: T): Promise<T & { achieved: number; progress: number }> {
  const achieved = await calculateAchievement(
    target.assigneeId.toString(),
    target.assigneeRole as "agent" | "super_agent",
    target.type as "employer" | "employee" | "finance",
    target.year,
    target.month
  );
  const tv = (target as unknown as { targetValue: number }).targetValue;
  const progress = tv > 0 ? Math.min(Math.round((achieved / tv) * 100), 100) : 0;
  return { ...target, achieved, progress };
}
