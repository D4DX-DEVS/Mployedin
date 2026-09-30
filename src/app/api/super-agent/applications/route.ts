import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getAgentEmployerIds, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
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

  // Admin sees all agents/applications; super_agent is scoped to their book —
  // the same employer set as their employers, jobs and territory pages
  // (getSuperAgentBook), so a company registered in the territory shows its
  // applicants here even before an agent is assigned to it.
  let agentIds: string[] = [];
  let agents: Record<string, unknown>[] = [];
  let bookEmployerIds: unknown[] = [];

  if (ctx.role === "admin") {
    agents = await Agent.find({}).populate("userId", "name").select("userId").lean() as Record<string, unknown>[];
    agentIds = agents.map((a) => String((a as { _id: unknown })._id));
  } else {
    const book = await getSuperAgentBook(ctx.userId);
    agentIds = (book?.agentIds ?? []).map(String);
    bookEmployerIds = book?.employerIds ?? [];
    agents = await Agent.find({ _id: { $in: agentIds } })
      .populate("userId", "name")
      .select("userId")
      .lean() as Record<string, unknown>[];
  }

  const filter: Record<string, unknown> = {};

  // Scope first, filter second. This used to be `if (agentFilter) … else if
  // (super_agent) … scope`, so passing ?agent=<any Agent _id> skipped the
  // scope branch entirely and returned another team's applications — with
  // candidate names and emails attached. The team scope now always applies to
  // a non-admin caller, and ?agent= narrows within it.
  if (ctx.role !== "admin") {
    // Jobs a team agent posted belong to the team even at an employer outside
    // the book; Application.agentId is rarely stamped, so match on the job too.
    const teamJobIds = agentIds.length > 0
      ? (await Job.find({ agentId: { $in: agentIds } }).select("_id").lean()).map((j) => j._id)
      : [];
    const scopeOr: Record<string, unknown>[] = [];
    if (agentIds.length > 0) scopeOr.push({ agentId: { $in: agentIds } });
    if (bookEmployerIds.length > 0) scopeOr.push({ employerId: { $in: bookEmployerIds } });
    if (teamJobIds.length > 0) scopeOr.push({ jobId: { $in: teamJobIds } });
    if (scopeOr.length > 0) {
      filter.$and = [{ $or: scopeOr }];
    } else {
      filter._id = { $in: [] };
    }
  }

  if (agentFilter && agentFilter !== "all") {
    // An out-of-scope id yields no rows rather than someone else's, because
    // the scope clause above is still in the filter. Narrows to what that
    // agent sees: their own applications plus their employers' applicants.
    if (ctx.role === "admin" || agentIds.includes(agentFilter)) {
      const agentDoc = await Agent.findById(agentFilter).select("userId").lean();
      const agentEmployerIds = agentDoc?.userId ? await getAgentEmployerIds(String(agentDoc.userId)) : [];
      filter.$and = [
        ...((filter.$and as Record<string, unknown>[]) ?? []),
        { $or: [{ agentId: agentFilter }, { employerId: { $in: agentEmployerIds } }] },
      ];
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
