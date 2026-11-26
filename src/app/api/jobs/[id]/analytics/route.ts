import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import Job from "@/models/Job";
import mongoose from "mongoose";
import { getScopedEmployerIds, getSuperAgentBook } from "@/lib/auth/agentRestrictions";

/**
 * Whether the caller sits on the job's owning side: admin; the employer
 * (scoped); an agent whose book holds the employer, or who posted the job; a
 * super agent whose book holds the employer or the posting agent. Job seekers
 * and unknown roles never do (getScopedEmployerIds gives them an empty list).
 */
async function isJobOwnerSide(
  ctx: { userId: string; role: string },
  job: { employerId?: unknown; agentId?: unknown },
): Promise<boolean> {
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    return Boolean(
      book &&
        (book.agentIds.map(String).includes(String(job.agentId ?? "")) ||
          book.employerIds.map(String).includes(String(job.employerId))),
    );
  }
  const employerIds = await getScopedEmployerIds(ctx);
  if (employerIds === null || employerIds.map(String).includes(String(job.employerId))) return true;
  if (ctx.role === "agent" && job.agentId) {
    const { default: Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(agent && String(agent._id) === String(job.agentId));
  }
  return false;
}

export const GET = withAuth(
  async (
    _req,
    ctx,
    params
  ) => {
    const id = params?.id ?? "";

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    await connectDB();

    const job = await Job.findById(id)
      .select("title status employerId agentId createdAt")
      .lean();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Pipeline stats (counts by status, interview/offer rates, daily trends)
    // are the owning side's business only. The jobs:read guard is role-level,
    // and this check used to cover just employer and agent, so any job seeker
    // or any super agent could read any job's pipeline (audit 2026-11-26
    // JS-02/V-4). Same owning-side rule as GET /api/jobs/[id].
    if (!(await isJobOwnerSide(ctx, job))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Status breakdown
    const statusAgg = await Application.aggregate([
      { $match: { jobId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusMap: Record<string, number> = {};
    let total = 0;
    statusAgg.forEach((s: { _id: string; count: number }) => {
      statusMap[s._id] = s.count;
      total += s.count;
    });

    const interviews =
      (statusMap["interview_scheduled"] ?? 0) +
      (statusMap["selected"] ?? 0) +
      (statusMap["offer"] ?? 0) +
      (statusMap["hired"] ?? 0);
    const offers = (statusMap["offer"] ?? 0) + (statusMap["hired"] ?? 0);

    // Daily application trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTrend = await Application.aggregate([
      {
        $match: {
          jobId: new mongoose.Types.ObjectId(id),
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return NextResponse.json({
      job: {
        _id: job._id,
        title: job.title,
        status: job.status,
        createdAt: job.createdAt,
      },
      analytics: {
        totalApplications: total,
        statusBreakdown: statusMap,
        interviews,
        offers,
        interviewRate: total > 0 ? Math.round((interviews / total) * 100) : 0,
        offerRate: total > 0 ? Math.round((offers / total) * 100) : 0,
        dailyTrend: dailyTrend.map((d: { _id: string; count: number }) => ({
          date: d._id,
          count: d.count,
        })),
      },
    });
  },
  { resource: "jobs", action: "read" }
);
