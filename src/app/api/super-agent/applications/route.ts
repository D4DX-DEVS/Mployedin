import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Application from "@/models/Application";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const agentFilter = url.searchParams.get("agent") ?? "";

  // Dual-scoping: team agents + region-based agents
  const scope = await getSuperAgentScope(ctx.userId);
  const agentIds = (scope?.effectiveAgentIds ?? []).map(String);

  /* Get agent user IDs for filtering */
  const agents = await Agent.find({ _id: { $in: agentIds } })
    .populate("userId", "fullName")
    .select("userId assignedEmployerIds")
    .lean();

  const agentUserIds = agents.map((a: Record<string, unknown>) => (a.userId as Record<string, unknown>)?._id);

  // Team scope by job: applications belong to the team when their job was posted
  // by a managed agent OR by an employer assigned to a managed agent. This mirrors
  // the dashboard aggregation so application counts stay consistent across screens.
  const employerIds = agents.flatMap(
    (a: Record<string, unknown>) => (a.assignedEmployerIds as unknown[]) ?? []
  );
  const teamJobs = await Job.find({
    $or: [
      { agentId: { $in: agentIds } },
      ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
    ],
  })
    .select("_id")
    .lean();
  const teamJobIds = teamJobs.map((j: Record<string, unknown>) => j._id);

  const filter: Record<string, unknown> = {};
  if (agentFilter && agentFilter !== "all") {
    filter.agentId = agentFilter;
  } else {
    // Match on either the denormalized agentId OR membership in a team job.
    const scopeOr: Record<string, unknown>[] = [];
    if (agentIds.length > 0) scopeOr.push({ agentId: { $in: agentIds } });
    if (teamJobIds.length > 0) scopeOr.push({ jobId: { $in: teamJobIds } });
    if (scopeOr.length === 1) {
      Object.assign(filter, scopeOr[0]);
    } else if (scopeOr.length > 1) {
      filter.$and = [{ $or: scopeOr }];
    } else {
      // No team scope at all → return nothing rather than the whole collection.
      filter._id = { $in: [] };
    }
  }

  if (status && status !== "all") filter.status = status;
  if (search) {
    const safe = escapeRegex(search);
    filter.$and = [
      ...((filter.$and as Record<string, unknown>[]) ?? []),
      {
        $or: [
          { candidateName: { $regex: safe, $options: "i" } },
          { jobTitle: { $regex: safe, $options: "i" } },
          { companyName: { $regex: safe, $options: "i" } },
        ],
      },
    ];
  }

  const [items, total, shortlisted, hired] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("jobSeekerId", "fullName email")
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .lean(),
    Application.countDocuments(filter),
    Application.countDocuments({ ...filter, status: "shortlisted" }),
    Application.countDocuments({ ...filter, status: "hired" }),
  ]);

  const mapped = items.map((a: Record<string, unknown>) => {
    const seeker = a.jobSeekerId as Record<string, unknown> | null;
    const job = a.jobId as Record<string, unknown> | null;
    const emp = a.employerId as Record<string, unknown> | null;
    return {
      _id: String(a._id),
      candidateName: a.candidateName ?? seeker?.fullName ?? "Unknown",
      candidateEmail: seeker?.email ?? "",
      jobTitle: a.jobTitle ?? job?.title ?? "",
      companyName: a.companyName ?? emp?.companyName ?? "",
      agentName: "",
      status: a.status ?? "applied",
      matchScore: a.matchScore ?? a.aiMatchScore,
      appliedAt: a.appliedAt ?? a.createdAt,
      source: a.source ?? "direct",
    };
  });

  const conversionRate = total > 0 ? Math.round((hired / total) * 100) : 0;

  const agentList = agents.map((a: Record<string, unknown>) => ({
    _id: String(a._id),
    name: (a.userId as Record<string, unknown>)?.fullName ?? "Unknown",
  }));

  return NextResponse.json({
    items: mapped,
    total,
    agents: agentList,
    stats: { total, shortlisted, hired, conversionRate },
  });
}

export const GET = withAuth(handler, { resource: "applications", action: "read" });
