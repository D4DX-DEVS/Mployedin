import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Interview from "@/models/Interview";
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
  const type = url.searchParams.get("type") ?? "";

  const filter: Record<string, unknown> = {};

  // Dual-scoping: team agents + region-based agents. Admin is the only role
  // that reads unscoped here — a super_agent with an empty scope must see
  // nothing, not everything. The previous `if (agentIds.length > 0)` had no
  // else, so a super-agent with no roster and no region overlap (or no
  // SuperAgent document at all) queried Interview.find({}) — every interview
  // on the platform, plus the same leak in the three status counts below.
  if (ctx.role !== "admin") {
    const scope = await getSuperAgentScope(ctx.userId);
    const agentIds = (scope?.effectiveAgentIds ?? []).map(String);
    filter.agentId = { $in: agentIds };
  }
  if (status && status !== "all") filter.status = status;
  if (type && type !== "all") filter.type = type;
  if (search) {
    filter.$or = await relatedEntitySearchOr(search);
  }

  const [items, total, scheduled, completed, cancelled] = await Promise.all([
    Interview.find(filter)
      .sort({ scheduledAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
      .populate("jobSeekerId", "fullName email")
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .lean(),
    Interview.countDocuments(filter),
    Interview.countDocuments({ ...filter, status: "scheduled" }),
    Interview.countDocuments({ ...filter, status: "completed" }),
    Interview.countDocuments({ ...filter, status: { $in: ["cancelled", "no_show"] } }),
  ]);

  const mapped = items.map((i: Record<string, unknown>) => {
    const seeker = i.jobSeekerId as Record<string, unknown> | null;
    const job = i.jobId as Record<string, unknown> | null;
    const emp = i.employerId as Record<string, unknown> | null;
    const agent = i.agentId as Record<string, unknown> | null;
    return {
      _id: String(i._id),
      candidateName: i.candidateName ?? seeker?.fullName ?? "Unknown",
      candidateEmail: seeker?.email ?? "",
      jobTitle: i.jobTitle ?? job?.title ?? "",
      companyName: i.companyName ?? emp?.companyName ?? "",
      agentName: (agent?.userId as Record<string, unknown>)?.name ?? "",
      type: i.type ?? "video",
      status: i.status ?? "scheduled",
      scheduledAt: i.scheduledAt ?? i.createdAt,
      duration: i.duration,
      meetLink: i.meetLink,
      location: i.location,
      createdAt: i.createdAt,
    };
  });

  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  return NextResponse.json({
    items: mapped,
    total,
    stats: { total, scheduled, completed, cancelRate },
  });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
