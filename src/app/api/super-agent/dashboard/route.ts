import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Lead from "@/models/Lead";
import Commission from "@/models/Commission";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

export const GET = withAuth(async (_req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const agentDocIds = scope.effectiveAgentIds;

  // Resolve agent user IDs
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId assignedEmployerIds performance")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

  // Count active agents
  const activeAgents = await User.countDocuments({
    _id: { $in: agentUserIds },
    isActive: true,
  });

  // Total employers under all agents
  const allEmployerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);
  const uniqueEmployerIds = [...new Set(allEmployerIds.map(String))];
  const totalEmployers = uniqueEmployerIds.length;

  // Total jobs posted by agents or their employers
  const jobFilter: Record<string, unknown> = {
    $or: [
      { agentId: { $in: agentDocIds } },
      ...(uniqueEmployerIds.length > 0
        ? [{ employerId: { $in: uniqueEmployerIds } }]
        : []),
    ],
  };
  const [totalJobs, activeJobs] = await Promise.all([
    Job.countDocuments(jobFilter),
    Job.countDocuments({ ...jobFilter, status: "active" }),
  ]);

  // Applications (CVs received)
  const jobIds = await Job.find(jobFilter).select("_id").lean();
  const jobIdList = jobIds.map((j) => j._id);
  const totalApplications = jobIdList.length > 0
    ? await Application.countDocuments({ jobId: { $in: jobIdList } })
    : 0;

  // Application status breakdown
  const appStatusBreakdown = jobIdList.length > 0
    ? await Application.aggregate([
        { $match: { jobId: { $in: jobIdList } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
    : [];
  const statusMap: Record<string, number> = {};
  appStatusBreakdown.forEach((s: { _id: string; count: number }) => {
    statusMap[s._id] = s.count;
  });

  // Placements — scope by team agents or this super-agent's profile.
  const totalPlacements = await Placement.countDocuments({
    $or: [
      { agentId: { $in: agentDocIds } },
      { superAgentId: scope.saProfileId },
    ],
  });

  // Leads — Lead.agentId references Agent doc _id, not User _id
  const totalLeads = await Lead.countDocuments({
    agentId: { $in: agentDocIds },
  });
  const convertedLeads = await Lead.countDocuments({
    agentId: { $in: agentDocIds },
    status: "converted",
  });

  // Per-agent performance — derive from live collections so figures match the
  // agents/reports/placements pages (the denormalized Agent.performance subdoc
  // can drift and previously produced phantom placement/commission totals).
  const agentIdStrings = agentDocIds.map(String);
  const [placementsByAgent, leadsByAgent, employersByAgent, vacanciesByAgent] = await Promise.all([
    Placement.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", count: { $sum: 1 } } },
    ]),
    Job.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", employers: { $addToSet: "$employerId" } } },
    ]),
    Job.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", count: { $sum: 1 } } },
    ]),
  ]);
  const placementsAgentMap = new Map(placementsByAgent.map((r) => [String(r._id), r.count]));
  const leadsAgentMap = new Map(leadsByAgent.map((r) => [String(r._id), r.count]));
  const vacanciesAgentMap = new Map(vacanciesByAgent.map((r) => [String(r._id), r.count]));
  const employersAgentMap = new Map(
    employersByAgent.map((r) => [String(r._id), (r.employers ?? []).filter(Boolean).length])
  );

  // Agent performance aggregation (live, not denormalized)
  const agentPerformance = agentDocs.map((a) => {
    const key = String(a._id);
    return {
      agentId: a._id,
      userId: a.userId,
      employersCreated: employersAgentMap.get(key) ?? (a.assignedEmployerIds?.length ?? 0),
      leadsGenerated: leadsAgentMap.get(key) ?? 0,
      vacanciesPosted: vacanciesAgentMap.get(key) ?? 0,
      placementsCompleted: placementsAgentMap.get(key) ?? 0,
    };
  });

  // Commissions — aggregate from the Commission collection (single source of
  // truth shared with the reports & commissions pages) rather than the
  // SuperAgent.commissions denormalized counter which could be stale.
  const commissionAgg = await Commission.aggregate([
    {
      $match: {
        $or: [
          { agentId: { $in: agentIdStrings } },
          { superAgentId: ctx.userId },
        ],
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
        paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
      },
    },
  ]);
  const commData = commissionAgg[0] ?? { total: 0, pending: 0, paid: 0 };

  return NextResponse.json({
    kpis: {
      activeAgents,
      totalEmployers,
      totalJobs,
      activeJobs,
      totalApplications,
      totalPlacements,
      totalLeads,
      convertedLeads,
      commissions: {
        total: commData.total ?? 0,
        pending: commData.pending ?? 0,
        paid: commData.paid ?? 0,
      },
    },
    applicationBreakdown: statusMap,
    agentPerformance,
  });
}, { resource: "agents", action: "read" });
