import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Application from "@/models/Application";
import Agent from "@/models/Agent";
import User from "@/models/User";

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

  const superAgent = await SuperAgent.findOne({ userId: ctx.userId }).lean();
  const agentIds = ((superAgent as Record<string, unknown>)?.agentIds ?? []) as string[];

  /* Get agent user IDs for filtering */
  const agents = await Agent.find({ _id: { $in: agentIds } })
    .populate("userId", "fullName")
    .lean();

  const agentUserIds = agents.map((a: Record<string, unknown>) => (a.userId as Record<string, unknown>)?._id);

  const filter: Record<string, unknown> = {};
  if (agentFilter && agentFilter !== "all") {
    filter.agentId = agentFilter;
  } else if (agentIds.length > 0) {
    filter.agentId = { $in: agentIds };
  }

  if (status && status !== "all") filter.status = status;
  if (search) {
    filter.$or = [
      { candidateName: { $regex: search, $options: "i" } },
      { jobTitle: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
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
