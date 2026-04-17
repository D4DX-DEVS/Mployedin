import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

/* ────────────────────────────────────────────────────────
   Constants — single source of truth for time windows
   ──────────────────────────────────────────────────────── */

const ANALYSIS_WINDOW_DAYS = 7;
const COMPARISON_WINDOW_DAYS = 14; // current + previous period
const SLOW_RESPONSE_HOURS = 48;
const MODERATE_RESPONSE_HOURS = 24;
const STALE_LEAD_DAYS = ANALYSIS_WINDOW_DAYS; // aligned
const INACTIVE_AGENT_DAYS = ANALYSIS_WINDOW_DAYS; // aligned
const MAX_RESPONSE_CAP_HOURS = 720; // 30 days — discard outliers

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */

type InsightSeverity = "critical" | "warning" | "info";
type InsightType = "alert" | "metric" | "tip" | "opportunity";
type ActionType = "assign_leads" | "send_reminder" | "navigate" | "generate_report";
type ConfidenceLevel = "high" | "medium" | "low";

interface Insight {
  id: string;
  severity: InsightSeverity;
  type: InsightType;
  title: string;
  message: string;
  confidence: ConfidenceLevel;
  cause?: string;
  agentIds?: string[];
  action?: string;
  actionType?: ActionType;
  actionUrl?: string;
  actionPayload?: Record<string, unknown>;
}

/* ────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────── */

function hoursAgo(date: Date): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

function daysAgo(date: Date): number {
  return hoursAgo(date) / 24;
}

/* ────────────────────────────────────────────────────────
   GET /api/super-agent/insights
   ──────────────────────────────────────────────────────── */

export const GET = withAuth(async (req: NextRequest, ctx) => {
  // Rate-limit
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  // ── 1. Resolve super-agent scope ──
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const assignedAgentDocIds = saProfile?.agentIds ?? [];

  if (assignedAgentDocIds.length === 0) {
    return NextResponse.json({
      insights: [{
        id: "insight_empty",
        severity: "info" as InsightSeverity,
        type: "tip" as InsightType,
        title: "No agents assigned",
        message: "Your roster is empty. Add agents to your team to start receiving AI-powered performance insights.",
        confidence: "high" as ConfidenceLevel,
        action: "Go to Team → Agents",
        actionType: "navigate" as ActionType,
        actionUrl: "/super-agent/agents",
      }],
      generatedAt: new Date().toISOString(),
    });
  }

  // ── 2. Parallel data fetch ──
  const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId activityLog performance").lean();
  const agentUserIds = agentDocs.map((a) => a.userId.toString());

  const now = new Date();
  const windowStart = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const comparisonStart = new Date(now.getTime() - COMPARISON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [users, allLeads, recentPlacements] = await Promise.all([
    User.find({ _id: { $in: agentUserIds } }).select("name email").lean(),
    Lead.find({ agentId: { $in: agentUserIds } })
      .select("agentId status createdAt convertedAt followUpAt activityLog")
      .lean(),
    Placement.find({
      agentId: { $in: agentUserIds },
      createdAt: { $gte: comparisonStart },
    }).select("agentId createdAt").lean(),
  ]);

  // ── 3. Build per-agent analytics ──
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  interface AgentAnalytics {
    userId: string;
    name: string;
    email: string;
    leadsThisWeek: number;
    leadsLastWeek: number;
    conversionsThisWeek: number;
    conversionsLastWeek: number;
    totalLeads: number;
    totalConversions: number;
    totalPlacements: number;
    conversionRate: number;
    avgResponseHours: number;
    overdueFollowUps: number;
    staleLeads: number;
    lastActivityDaysAgo: number;
  }

  const agentAnalytics: AgentAnalytics[] = agentUserIds.map((uid) => {
    const user = userMap.get(uid);
    const agentDoc = agentDocs.find((a) => a.userId.toString() === uid);
    const agentLeads = allLeads.filter((l) => l.agentId?.toString() === uid);

    // Week-over-week splits
    const leadsThisWeek = agentLeads.filter((l) => new Date(l.createdAt) >= windowStart).length;
    const leadsLastWeek = agentLeads.filter((l) => {
      const d = new Date(l.createdAt);
      return d >= comparisonStart && d < windowStart;
    }).length;
    const conversionsThisWeek = agentLeads.filter(
      (l) => l.status === "converted" && l.convertedAt && new Date(l.convertedAt) >= windowStart
    ).length;
    const conversionsLastWeek = agentLeads.filter((l) => {
      if (l.status !== "converted" || !l.convertedAt) return false;
      const d = new Date(l.convertedAt);
      return d >= comparisonStart && d < windowStart;
    }).length;

    const totalConversions = agentLeads.filter((l) => l.status === "converted").length;
    const placementsCount = recentPlacements.filter((p) => p.agentId?.toString() === uid).length;

    // Response time: time from lead creation → first activityLog entry
    const responseTimes = agentLeads
      .filter((l) => l.activityLog && l.activityLog.length > 0)
      .map((l) => {
        const firstAction = l.activityLog![0];
        return (new Date(firstAction.timestamp).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60);
      })
      .filter((h) => h > 0 && h < MAX_RESPONSE_CAP_HOURS); // discard outliers

    const avgResponseHours = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : -1; // -1 = no data

    // Overdue follow-ups
    const overdueFollowUps = agentLeads.filter(
      (l) =>
        l.followUpAt &&
        new Date(l.followUpAt) < now &&
        l.status !== "converted" &&
        l.status !== "lost"
    ).length;

    // Stale leads: contacted/interested for >STALE_LEAD_DAYS with no recent activity
    const staleLeads = agentLeads.filter((l) => {
      if (l.status !== "contacted" && l.status !== "interested") return false;
      const lastUpdate = l.activityLog?.length
        ? new Date(l.activityLog[l.activityLog.length - 1].timestamp)
        : new Date(l.createdAt);
      return daysAgo(lastUpdate) > STALE_LEAD_DAYS;
    }).length;

    // Last activity from agent's activityLog
    const lastActivity = agentDoc?.activityLog?.length
      ? agentDoc.activityLog[agentDoc.activityLog.length - 1].timestamp
      : null;
    const lastActivityDaysAgo = lastActivity ? daysAgo(lastActivity) : 999;

    return {
      userId: uid,
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      leadsThisWeek,
      leadsLastWeek,
      conversionsThisWeek,
      conversionsLastWeek,
      totalLeads: agentLeads.length,
      totalConversions,
      totalPlacements: placementsCount,
      conversionRate: agentLeads.length > 0 ? Math.round((totalConversions / agentLeads.length) * 100) : 0,
      avgResponseHours,
      overdueFollowUps,
      staleLeads,
      lastActivityDaysAgo,
    };
  });

  // ── 4. Cross-signal insight engine ──
  const insights: Insight[] = [];
  let insightCounter = 0;
  const nextId = () => `insight_${++insightCounter}`;

  /* ── Confidence heuristic ──
     high   = based on ≥5 data points + clear threshold breach
     medium = based on 2–4 data points or moderate breach
     low    = based on 1 data point or weak signal */
  function computeConfidence(dataPoints: number, thresholdStrength: "strong" | "moderate" | "weak"): ConfidenceLevel {
    if (dataPoints >= 5 && thresholdStrength === "strong") return "high";
    if (dataPoints >= 2 || thresholdStrength === "moderate") return "medium";
    return "low";
  }

  // ─── Insight: Week-over-week conversion change with cause ───
  const totalConvThisWeek = agentAnalytics.reduce((a, b) => a + b.conversionsThisWeek, 0);
  const totalConvLastWeek = agentAnalytics.reduce((a, b) => a + b.conversionsLastWeek, 0);

  if (totalConvLastWeek > 0) {
    const changePct = Math.round(((totalConvThisWeek - totalConvLastWeek) / totalConvLastWeek) * 100);

    if (changePct <= -20) {
      const slowAgents = agentAnalytics.filter((a) => a.avgResponseHours > SLOW_RESPONSE_HOURS && a.totalLeads > 0);
      const cause = slowAgents.length > 0
        ? `mainly due to ${slowAgents.length} agent${slowAgents.length > 1 ? "s" : ""} with delayed follow-ups (>${SLOW_RESPONSE_HOURS}h avg response time)`
        : "review agent follow-up patterns and lead quality";

      insights.push({
        id: nextId(),
        severity: "critical",
        type: "alert",
        title: "Conversion drop",
        message: `Conversions dropped ${Math.abs(changePct)}% this week compared to last week, ${cause}.`,
        confidence: computeConfidence(totalConvLastWeek + totalConvThisWeek, slowAgents.length > 0 ? "strong" : "moderate"),
        cause: slowAgents.length > 0 ? "Slow response times" : "Unknown",
        agentIds: slowAgents.map((a) => a.userId),
        action: "Review underperforming agents",
        actionType: "navigate",
        actionUrl: "/super-agent/agents",
      });
    } else if (changePct <= -5) {
      insights.push({
        id: nextId(),
        severity: "warning",
        type: "metric",
        title: "Slight conversion dip",
        message: `Conversions are down ${Math.abs(changePct)}% this week. Monitor closely to prevent a larger decline.`,
        confidence: computeConfidence(totalConvLastWeek + totalConvThisWeek, "moderate"),
        action: "Check lead pipeline",
        actionType: "navigate",
        actionUrl: "/super-agent/leads",
      });
    } else if (changePct >= 10) {
      insights.push({
        id: nextId(),
        severity: "info",
        type: "opportunity",
        title: "Conversions trending up",
        message: `Conversions increased ${changePct}% this week. Your team momentum is strong — maintain the pace.`,
        confidence: computeConfidence(totalConvLastWeek + totalConvThisWeek, "strong"),
      });
    }
  }

  // ─── Insight: Cross-signal underperformer diagnosis ───
  const underperformers = agentAnalytics.filter(
    (a) => a.totalLeads >= 5 && a.conversionRate < 15 && a.avgResponseHours > MODERATE_RESPONSE_HOURS
  );

  for (const agent of underperformers.slice(0, 2)) {
    const responseLabel = agent.avgResponseHours > SLOW_RESPONSE_HOURS
      ? `very slow response time (${Math.round(agent.avgResponseHours)}h avg)`
      : `slow response time (${Math.round(agent.avgResponseHours)}h avg)`;

    // Confidence: high if we have response time data + enough leads
    const dataPoints = agent.totalLeads;
    const hasResponseData = agent.avgResponseHours > 0;

    insights.push({
      id: nextId(),
      severity: agent.avgResponseHours > SLOW_RESPONSE_HOURS ? "critical" : "warning",
      type: "alert",
      title: `${agent.name} needs attention`,
      message: `${agent.name} has ${agent.totalLeads} leads but only ${agent.conversionRate}% conversion rate, likely due to ${responseLabel}.`,
      confidence: computeConfidence(dataPoints, hasResponseData ? "strong" : "moderate"),
      cause: "High leads + low conversion + slow response",
      agentIds: [agent.userId],
      action: "Send coaching reminder",
      actionType: "send_reminder",
      actionPayload: { agentUserId: agent.userId, agentName: agent.name },
    });
  }

  // ─── Insight: Top performer ───
  const topPerformer = agentAnalytics
    .filter((a) => a.totalLeads >= 3)
    .sort((a, b) => b.conversionRate - a.conversionRate)[0];

  if (topPerformer && topPerformer.conversionRate >= 30) {
    insights.push({
      id: nextId(),
      severity: "info",
      type: "metric",
      title: `${topPerformer.name} is your top performer`,
      message: `${topPerformer.name} leads the team with a ${topPerformer.conversionRate}% conversion rate across ${topPerformer.totalLeads} leads. Consider assigning more leads to maximize output.`,
      confidence: computeConfidence(topPerformer.totalLeads, topPerformer.totalLeads >= 10 ? "strong" : "moderate"),
      agentIds: [topPerformer.userId],
      action: "Assign more leads",
      actionType: "assign_leads",
      actionPayload: { targetAgentUserId: topPerformer.userId, targetAgentName: topPerformer.name },
    });
  }

  // ─── Insight: Overdue follow-ups ───
  const totalOverdue = agentAnalytics.reduce((a, b) => a + b.overdueFollowUps, 0);
  const agentsWithOverdue = agentAnalytics.filter((a) => a.overdueFollowUps > 0);

  if (totalOverdue > 0) {
    insights.push({
      id: nextId(),
      severity: totalOverdue > 5 ? "critical" : "warning",
      type: "alert",
      title: "Overdue follow-ups",
      message: `${totalOverdue} follow-up${totalOverdue > 1 ? "s" : ""} overdue across ${agentsWithOverdue.length} agent${agentsWithOverdue.length > 1 ? "s" : ""}. These leads risk going cold.`,
      confidence: "high", // direct data — no inference needed
      agentIds: agentsWithOverdue.map((a) => a.userId),
      action: "View lead pipeline",
      actionType: "navigate",
      actionUrl: "/super-agent/leads",
    });
  }

  // ─── Insight: Stale pipeline ───
  const totalStale = agentAnalytics.reduce((a, b) => a + b.staleLeads, 0);

  if (totalStale > 0) {
    insights.push({
      id: nextId(),
      severity: totalStale > 10 ? "warning" : "info",
      type: "tip",
      title: "Stale leads detected",
      message: `${totalStale} lead${totalStale > 1 ? "s" : ""} stuck in contacted/interested status for ${STALE_LEAD_DAYS}+ days without activity. Consider reassigning or sending follow-up reminders.`,
      confidence: "high", // direct data
      action: "Review stale leads",
      actionType: "navigate",
      actionUrl: "/super-agent/leads",
    });
  }

  // ─── Insight: Inactive agents ───
  const inactiveAgents = agentAnalytics.filter((a) => a.lastActivityDaysAgo > INACTIVE_AGENT_DAYS);

  if (inactiveAgents.length > 0) {
    const names = inactiveAgents.slice(0, 3).map((a) => a.name).join(", ");
    insights.push({
      id: nextId(),
      severity: "critical",
      type: "alert",
      title: `${inactiveAgents.length} inactive agent${inactiveAgents.length > 1 ? "s" : ""}`,
      message: `${names}${inactiveAgents.length > 3 ? ` and ${inactiveAgents.length - 3} more` : ""} — no activity in ${INACTIVE_AGENT_DAYS}+ days. These agents may need a check-in or lead reassignment.`,
      confidence: inactiveAgents[0].lastActivityDaysAgo > 999 ? "medium" : "high", // medium if no activityLog data at all
      agentIds: inactiveAgents.map((a) => a.userId),
      action: "Send reminder",
      actionType: "send_reminder",
      actionPayload: {
        agentUserIds: inactiveAgents.map((a) => a.userId),
        agentNames: inactiveAgents.map((a) => a.name),
      },
    });
  }

  // ─── Sort by severity priority: critical > warning > info ───
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return NextResponse.json({
    insights: insights.slice(0, 6), // cap at 6 insights
    generatedAt: new Date().toISOString(),
  });
}, { resource: "users", action: "read" });
