import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import SavedJob from "@/models/SavedJob";
import ProfileView from "@/models/ProfileView";
import JobSeeker from "@/models/JobSeeker";

/**
 * GET /api/dashboard/stats
 *
 * Returns aggregated stats with week-over-week delta values.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfPrevWeek = new Date(startOfWeek);
  startOfPrevWeek.setDate(startOfWeek.getDate() - 7);

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("userId").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const seekerObjId = seeker._id;
  // ProfileView is keyed by the User id, unlike every other collection here, and
  // its field is `jobSeekerId` — the `viewedUserId` these queries used does not
  // exist on the schema, so every view counter was permanently 0.
  const viewerScopeId = seeker.userId;

  // ── Parallel queries (current + previous week) ───────────────────────────
  const [
    appsTotal,
    appsCurrWeek,
    appsPrevWeek,
    interviewsTotal,
    interviewsCurrWeek,
    interviewsPrevWeek,
    savedTotal,
    savedCurrWeek,
    savedPrevWeek,
    matchScoreAgg,
    viewsTotal,
    viewsCurrWeek,
    viewsPrevWeek,
    viewsDaily,
  ] = await Promise.all([
    Application.countDocuments({ jobSeekerId: seekerObjId }),
    Application.countDocuments({ jobSeekerId: seekerObjId, appliedAt: { $gte: startOfWeek } }),
    Application.countDocuments({ jobSeekerId: seekerObjId, appliedAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    Interview.countDocuments({ jobSeekerId: seekerObjId, status: { $nin: ["cancelled"] }, scheduledAt: { $gte: now } }),
    Interview.countDocuments({ jobSeekerId: seekerObjId, status: { $nin: ["cancelled"] }, scheduledAt: { $gte: startOfWeek } }),
    Interview.countDocuments({ jobSeekerId: seekerObjId, status: { $nin: ["cancelled"] }, scheduledAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    SavedJob.countDocuments({ jobSeekerId: seekerObjId }),
    SavedJob.countDocuments({ jobSeekerId: seekerObjId, savedAt: { $gte: startOfWeek } }),
    SavedJob.countDocuments({ jobSeekerId: seekerObjId, savedAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    Application.aggregate([
      { $match: { jobSeekerId: seekerObjId, aiMatchScore: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$aiMatchScore" } } },
    ]),
    ProfileView.countDocuments({ jobSeekerId: viewerScopeId, viewedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    ProfileView.countDocuments({ jobSeekerId: viewerScopeId, viewedAt: { $gte: startOfWeek } }),
    ProfileView.countDocuments({ jobSeekerId: viewerScopeId, viewedAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    // Daily view counts for the last 7 days (Mon–Sun)
    ProfileView.aggregate([
      {
        $match: {
          jobSeekerId: viewerScopeId,
          viewedAt: {
            $gte: new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: "$viewedAt" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Build 7-element daily array (Mon=0 → Sun=6, $dayOfWeek: 1=Sun…7=Sat)
  const dailyMap: Record<number, number> = {};
  for (const entry of viewsDaily as Array<{ _id: number; count: number }>) {
    dailyMap[entry._id] = entry.count;
  }
  // Map Sunday=1 → index 6, Monday=2 → 0, … Saturday=7 → 5
  const daily = [2, 3, 4, 5, 6, 7, 1].map((dow) => dailyMap[dow] ?? 0);

  const avgMatchScore = matchScoreAgg[0]?.avg != null ? Math.round(matchScoreAgg[0].avg) : null;

  return NextResponse.json({
    applicationsSent: { count: appsTotal, delta: appsCurrWeek - appsPrevWeek },
    upcomingInterviews: { count: interviewsTotal, delta: interviewsCurrWeek - interviewsPrevWeek },
    savedJobs: { count: savedTotal, delta: savedCurrWeek - savedPrevWeek },
    avgMatchScore: { value: avgMatchScore, delta: 0 },
    recruiterViews: {
      total: viewsTotal,
      delta: viewsCurrWeek - viewsPrevWeek,
      daily,
    },
  });
});
