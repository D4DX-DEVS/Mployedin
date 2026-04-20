import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Lead from "@/models/Lead";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

export const GET = withAuth(async (_req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const saProfile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("agentIds assignedCityIds assignedStateIds commissions overrideRate")
    .lean();

  if (!saProfile) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const agentDocIds = saProfile.agentIds ?? [];

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

  // Placements
  const totalPlacements = await Placement.countDocuments({
    $or: [
      { agentId: { $in: agentUserIds } },
      { superAgentId: ctx.userId },
    ],
  });

  // Leads
  const totalLeads = await Lead.countDocuments({
    agentId: { $in: agentUserIds },
  });
  const convertedLeads = await Lead.countDocuments({
    agentId: { $in: agentUserIds },
    status: "converted",
  });

  // Agent performance aggregation
  const agentPerformance = agentDocs.map((a) => ({
    agentId: a._id,
    userId: a.userId,
    employersCreated: a.performance?.employersCreated ?? 0,
    leadsGenerated: a.performance?.leadsGenerated ?? 0,
    vacanciesPosted: a.performance?.vacanciesPosted ?? 0,
    placementsCompleted: a.performance?.placementsCompleted ?? 0,
  }));

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
      commissions: saProfile.commissions ?? { total: 0, pending: 0, paid: 0 },
    },
    applicationBreakdown: statusMap,
    agentPerformance,
  });
}, { resource: "users", action: "read" });
