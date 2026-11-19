import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";
import { calculateKpis, type KpiSource } from "@/lib/targets/kpiCalculator";
import Agent from "@/models/Agent";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: string; locale: string; }

interface AgentRow {
  userId: string;
  name: string;
  email: string;
  currency: string;
  target?: {
    jobTarget: number;
    conversionTarget: number;
    revenueTarget: number;
    setByRole: "admin" | "super_agent";
    overriddenByAdmin: boolean;
  };
  actuals?: {
    jobs: number;
    onboarded: number;
    revenue: number;
  };
}

/**
 * GET /api/super-agent/target-profiles/team?year=
 *
 * Returns the super agent's own target and all agents in their team with:
 * - Current targets (or null if none)
 * - Actual KPI values for the year
 * - Set-by role and admin-override status
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  // Get SA's own target and canSetRevenueTargets permission
  const sa = await SuperAgent.findOne({ userId: ctx.userId })
    .select("canSetRevenueTargets")
    .lean();
  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    year,
    status: { $ne: "cancelled" },
  }).lean();

  // Get the SA's team
  const team = await getSuperAgentTeam(ctx.userId);
  if (!team || team.agentUserIds.length === 0) {
    return NextResponse.json({
      ownTarget: ownProfile ? {
        jobTarget: ownProfile.jobTarget || 0,
        conversionTarget: ownProfile.conversionTarget || 0,
        revenueTarget: ownProfile.revenueTarget || 0,
        currency: ownProfile.currency || "AED",
      } : null,
      agents: [],
      canSetRevenueTargets: sa?.canSetRevenueTargets ?? false,
      year,
    });
  }

  // Get all agents in the team with their targets
  const agents = await Agent.find({ userId: { $in: team.agentUserIds } })
    .select("userId name country currencyCode")
    .lean();

  const userIds = agents.map((a) => a.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Get all targets for agents
  const agentTargets = await TargetProfile.find({
    assigneeId: { $in: userIds },
    assigneeRole: "agent",
    year,
    status: { $ne: "cancelled" },
  }).lean();
  const targetMap = new Map(agentTargets.map((t) => [String(t.assigneeId), t]));

  // Calculate KPIs for all agents at once, each in their own target currency.
  const kpiSources: KpiSource[] = agents.map((agent) => ({
    userId: String(agent.userId),
    role: "agent",
    currency: String(targetMap.get(String(agent.userId))?.currency ?? agent.currencyCode ?? "AED"),
  }));

  let agentKpis: Map<string, { jobs: number; onboarded: number; revenue: number }> = new Map();
  if (kpiSources.length > 0) {
    try {
      const kpiResult = await calculateKpis(kpiSources, year);
      // Extract per-agent actuals from the KPI result
      for (const [key, kpiData] of kpiResult.entries()) {
        const userId = key.split(":")[1];
        if (userId && kpiData) {
          agentKpis.set(userId, {
            jobs: kpiData.totals.jobs,
            onboarded: kpiData.totals.onboarded,
            revenue: kpiData.totals.revenue,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "super-agent team KPI calculation failed");
    }
  }

  // Build the response rows
  const agentRows: AgentRow[] = agents.map((agent) => {
    const user = userMap.get(String(agent.userId));
    const target = targetMap.get(String(agent.userId));
    const kpi = agentKpis.get(String(agent.userId));

    return {
      userId: String(agent.userId),
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      currency: agent.currencyCode ?? "AED",
      target: target
        ? {
            jobTarget: target.jobTarget ?? 0,
            conversionTarget: target.conversionTarget ?? 0,
            revenueTarget: target.revenueTarget ?? 0,
            setByRole: target.setByRole ?? "super_agent",
            overriddenByAdmin: target.overriddenByAdmin ?? false,
          }
        : undefined,
      actuals: kpi
        ? {
            jobs: kpi.jobs,
            onboarded: kpi.onboarded,
            revenue: kpi.revenue,
          }
        : undefined,
    };
  });

  return NextResponse.json({
    ownTarget: ownProfile
      ? {
          jobTarget: ownProfile.jobTarget || 0,
          conversionTarget: ownProfile.conversionTarget || 0,
          revenueTarget: ownProfile.revenueTarget || 0,
        currency: ownProfile.currency || "AED",
        }
      : null,
    agents: agentRows,
    canSetRevenueTargets: sa?.canSetRevenueTargets ?? false,
    year,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
