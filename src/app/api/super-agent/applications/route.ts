import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Application from "@/models/Application";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import { relatedEntitySearchOr } from "@/lib/search/relatedEntitySearch";

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

  // Admin sees all agents/applications; super_agent is scoped to their team
  let agentIds: string[] = [];
  let agents: Record<string, unknown>[] = [];

  if (ctx.role === "admin") {
    agents = await Agent.find({}).populate("userId", "name").select("userId assignedEmployerIds").lean() as Record<string, unknown>[];
    agentIds = agents.map((a) => String((a as { _id: unknown })._id));
  } else {
    const scope = await getSuperAgentScope(ctx.userId);
    agentIds = (scope?.effectiveAgentIds ?? []).map(String);
    agents = await Agent.find({ _id: { $in: agentIds } })
      .populate("userId", "name")
      .select("userId assignedEmployerIds")
      .lean() as Record<string, unknown>[];
  }

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

  // Scope first, filter second. This used to be `if (agentFilter) … else if
  // (super_agent) … scope`, so passing ?agent=<any Agent _id> skipped the
  // scope branch entirely and returned another team's applications — with
  // candidate names and emails attached. The team scope now always applies to
  // a non-admin caller, and ?agent= narrows within it.
  if (ctx.role !== "admin") {
    const scopeOr: Record<string, unknown>[] = [];
    if (agentIds.length > 0) scopeOr.push({ agentId: { $in: agentIds } });
    if (teamJobIds.length > 0) scopeOr.push({ jobId: { $in: teamJobIds } });
    if (scopeOr.length === 1) {
      Object.assign(filter, scopeOr[0]);
    } else if (scopeOr.length > 1) {
      filter.$and = [{ $or: scopeOr }];
    } else {
      filter._id = { $in: [] };
    }
  }

  if (agentFilter && agentFilter !== "all") {
    // An out-of-scope id yields no rows rather than someone else's, because
    // the scope clause above is still in the filter.
    if (ctx.role === "admin" || agentIds.includes(agentFilter)) {
      filter.agentId = agentFilter;
    } else {
      filter._id = { $in: [] };
    }
  }
  // admin with no agentFilter: no scope restriction → sees all applications

  if (status && status !== "all") filter.status = status;
  if (search) {
    filter.$and = [
      ...((filter.$and as Record<string, unknown>[]) ?? []),
      { $or: await relatedEntitySearchOr(search) },
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
    name: (a.userId as Record<string, unknown>)?.name ?? "Unknown",
  }));

  return NextResponse.json({
    items: mapped,
    total,
    agents: agentList,
    stats: { total, shortlisted, hired, conversionRate },
  });
}

export const GET = withAuth(handler, { resource: "applications", action: "read" });
