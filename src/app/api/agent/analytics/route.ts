import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import JobSeeker from "@/models/JobSeeker";
import { getAgentEmployerIds, getAgentSeekerArea, seekerRegionMatch } from "@/lib/auth/agentRestrictions";
import { buildBroughtInFilter } from "@/lib/jobseekers/onboarded";
import { professionBreakdown, type JobSeekerWithProfession } from "@/lib/jobseekers/profession";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET /api/agent/analytics
 * Structured analytics for the agent dashboard/reports:
 * - KPIs with 30-day trend comparisons
 * - Lead funnel (new→contacted→interested→negotiating→converted/lost)
 * - Application status breakdown
 * - Monthly trends (6 months)
 * - Commission summary
 */
async function handler(_req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const agent = await Agent.findOne({ userId: ctx.userId })
    .select("_id assignedEmployerIds performance commissionRate assignedJobSeekerIds assignedCityIds assignedStateIds superAgentId")
    .lean();
  if (!agent) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  const agentId = agent._id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const sixtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS * 2);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // BUG-04: single source of truth with the lists and the agent dashboard —
  // portfolio scope (own jobs + jobs at visible employers), NOT bare agentId.
  // Application.agentId is almost never stamped, so bare-agentId counts
  // returned ~0 applications; Job.agentId misses employer-owned jobs.
  const visibleEmployerIds = await getAgentEmployerIds(String(ctx.userId));
  const portfolioFilter: Record<string, unknown> = {
    $or: [
      { agentId },
      ...(visibleEmployerIds.length > 0 ? [{ employerId: { $in: visibleEmployerIds } }] : []),
    ],
  };
  const portfolioJobIds = (
    await Job.find({ ...portfolioFilter, deletedAt: null }).select("_id").lean()
  ).map((j) => j._id);
  const appFilter: Record<string, unknown> =
    portfolioJobIds.length > 0 ? { jobId: { $in: portfolioJobIds } } : { _id: { $in: [] } };
  const jobFilter = { ...portfolioFilter, deletedAt: null };

  // ── Job Seeker Scope ──
  const agentDocId = agent._id;
  const assignedSeekerIds = ((agent as { assignedJobSeekerIds?: unknown[] }).assignedJobSeekerIds ?? []) as import("mongoose").Types.ObjectId[];
  const broughtIn = buildBroughtInFilter(agentDocId, assignedSeekerIds);
  const seekerArea = await getAgentSeekerArea({
    assignedCityIds: ((agent as { assignedCityIds?: unknown[] }).assignedCityIds ?? []) as import("mongoose").Types.ObjectId[],
    assignedStateIds: ((agent as { assignedStateIds?: unknown[] }).assignedStateIds ?? []) as import("mongoose").Types.ObjectId[],
    superAgentId: (agent as { superAgentId?: unknown } | null)?.superAgentId,
  });
  const seekerAreaMatch = seekerRegionMatch(seekerArea);
  const seekerScope = {
    roleArchivedAt: null,
    $or: [
      ...(broughtIn.$or as Record<string, unknown>[]),
      ...(seekerAreaMatch ? [seekerAreaMatch] : []),
    ],
  };
  // "In my area" = exactly what the Job Seekers "In my area" tab lists; no region, nobody.
  const inArea = seekerAreaMatch ? { roleArchivedAt: null, ...seekerAreaMatch } : null;

  // ── KPIs with trend comparisons ──
  const [
    currentLeads, previousLeads,
    currentPlacements, previousPlacements,
    currentApps, previousApps,
    currentInterviews, previousInterviews,
    totalLeads, totalPlacements, totalApps,
    activeJobs, totalOffers, scheduledInterviews,
    onboardedCount, onboardedPremiumCount, inAreaCount, premiumInAreaCount, referredCount, referredLastMonthCount, allSeekerDocs,
  ] = await Promise.all([
    Lead.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Lead.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Placement.countDocuments({ ...portfolioFilter, createdAt: { $gte: thirtyDaysAgo } }),
    Placement.countDocuments({ ...portfolioFilter, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Application.countDocuments({ ...appFilter, createdAt: { $gte: thirtyDaysAgo } }),
    Application.countDocuments({ ...appFilter, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Interview.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Interview.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Lead.countDocuments({ agentId }),
    Placement.countDocuments(portfolioFilter),
    Application.countDocuments(appFilter),
    Job.countDocuments({ ...jobFilter, status: "active" }),
    // Offers have no agentId; scope them to the agent's visible employers.
    visibleEmployerIds.length > 0
      ? Offer.countDocuments({ employerId: { $in: visibleEmployerIds } })
      : Promise.resolve(0),
    // Confirmed ones are still upcoming — they used to drop out of the count.
    Interview.countDocuments({ agentId, status: { $in: ["scheduled", "confirmed"] } }),
    JobSeeker.countDocuments(broughtIn),
    JobSeeker.countDocuments({ ...broughtIn, badges: "premium" }),
    inArea ? JobSeeker.countDocuments(inArea) : Promise.resolve(0),
    inArea ? JobSeeker.countDocuments({ ...inArea, badges: "premium" }) : Promise.resolve(0),
    JobSeeker.countDocuments({ roleArchivedAt: null, "referral.agentId": agentDocId }),
    JobSeeker.countDocuments({ roleArchivedAt: null, "referral.agentId": agentDocId, createdAt: { $gte: thirtyDaysAgo } }),
    // Only the profession fields: this list can run to a few thousand in a big region.
    JobSeeker.find(seekerScope)
      .select("careerProfile.jobRole careerProfile.roleCategory preferredRoles experience.jobTitle experience.isCurrent")
      .lean(),
  ]);

  function buildTrend(current: number, previous: number) {
    const delta = previous === 0
      ? current === 0 ? 0 : 100
      : Math.round(((current - previous) / previous) * 100);
    return { current, previous, delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
  }

  // ── Lead Funnel ──
  const leadFunnel = await Lead.aggregate([
    { $match: { agentId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const leadFunnelMap: Record<string, number> = {};
  for (const r of leadFunnel) leadFunnelMap[r._id] = r.count;

  // ── Application Status Breakdown (portfolio scope — BUG-04) ──
  const appStatus = await Application.aggregate([
    { $match: appFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const appStatusMap: Record<string, number> = {};
  for (const r of appStatus) appStatusMap[r._id] = r.count;

  // ── Commission Summary ──
  const commAgg = await Commission.aggregate([
    { $match: { agentId } },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const commByStatus: Record<string, { total: number; count: number }> = {};
  for (const r of commAgg) commByStatus[r._id] = { total: r.total, count: r.count };

  // ── Monthly Trends (6 months): leads, placements, applications ──
  const [leadsByMonth, placementsByMonth, appsByMonth] = await Promise.all([
    Lead.aggregate([
      { $match: { agentId, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: { ...portfolioFilter, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      { $match: { ...appFilter, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
  ]);

  const mkKey = (r: { _id: { y: number; m: number } }) => `${r._id.y}-${r._id.m}`;
  const leadsM = new Map(leadsByMonth.map((r) => [mkKey(r), r.count]));
  const placementsM = new Map(placementsByMonth.map((r) => [mkKey(r), r.count]));
  const appsM = new Map(appsByMonth.map((r) => [mkKey(r), r.count]));

  const monthlyTrends: { month: string; leads: number; placements: number; applications: number; trend: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const leads = leadsM.get(key) ?? 0;
    const placements = placementsM.get(key) ?? 0;
    const applications = appsM.get(key) ?? 0;

    const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${prevD.getMonth() + 1}`;
    const prevLeads = leadsM.get(prevKey) ?? 0;
    const trend = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : leads > 0 ? 100 : 0;

    monthlyTrends.push({
      month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
      leads,
      placements,
      applications,
      trend,
    });
  }

  // ── Overdue follow-ups ──
  const overdueFollowUps = await Lead.countDocuments({
    agentId,
    status: { $nin: ["converted", "lost"] },
    followUpAt: { $lt: now },
  });

  // ── Job seekers by profession (onboarded + in area: the agent's whole book) ──
  const seekerProfessions = professionBreakdown(allSeekerDocs as JobSeekerWithProfession[]);

  return NextResponse.json({
    kpis: {
      totalLeads,
      totalPlacements,
      totalApplications: totalApps,
      activeJobs,
      totalOffers,
      scheduledInterviews,
      employers: visibleEmployerIds.length,
      overdueFollowUps,
    },
    trends: {
      leads: buildTrend(currentLeads, previousLeads),
      placements: buildTrend(currentPlacements, previousPlacements),
      applications: buildTrend(currentApps, previousApps),
      interviews: buildTrend(currentInterviews, previousInterviews),
    },
    leadFunnel: {
      new: leadFunnelMap["new"] ?? 0,
      contacted: leadFunnelMap["contacted"] ?? 0,
      interested: leadFunnelMap["interested"] ?? 0,
      negotiating: leadFunnelMap["negotiating"] ?? 0,
      converted: leadFunnelMap["converted"] ?? 0,
      lost: leadFunnelMap["lost"] ?? 0,
    },
    applicationBreakdown: appStatusMap,
    commissions: {
      pending: commByStatus["pending"] ?? { total: 0, count: 0 },
      approved: commByStatus["approved"] ?? { total: 0, count: 0 },
      paid: commByStatus["paid"] ?? { total: 0, count: 0 },
    },
    jobSeekers: {
      onboarded: onboardedCount,
      onboardedPremium: onboardedPremiumCount,
      inArea: inAreaCount,
      premiumInArea: premiumInAreaCount,
      areaAssigned: inArea !== null,
      referred: referredCount,
      referredLastMonth: referredLastMonthCount,
      professionTotal: allSeekerDocs.length,
      professionBreakdown: seekerProfessions,
    },
    performance: agent.performance,
    commissionRate: agent.commissionRate ?? 0,
    monthlyTrends,
  });
}

export const GET = withAuth(handler);
