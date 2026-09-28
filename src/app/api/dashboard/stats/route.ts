import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";
import JobSeeker from "@/models/JobSeeker";
import Offer from "@/models/Offer";
import Conversation from "@/models/Conversation";
import SavedSearch from "@/models/SavedSearch";
import { getSeekerActivity, weekBounds } from "@/lib/jobSeeker/dashboard/activity.server";

/**
 * GET /api/dashboard/stats
 *
 * Returns aggregated stats with week-over-week delta values, plus the
 * seven-day series, the application pipeline by status and the waiting
 * counters (offers, messages, alerts) the seeker home's KPI strip shows.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const { startOfWeek } = weekBounds(now);

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("userId").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const seekerObjId = seeker._id;
  // ProfileView is keyed by the User id, unlike every other collection here, and
  // its field is `jobSeekerId` — the `viewedUserId` these queries used does not
  // exist on the schema, so every view counter was permanently 0.
  const viewerScopeId = seeker.userId;

  // ── Parallel queries (totals + the shared week/series/status aggregates) ──
  const [appsTotal, interviewsTotal, matchScoreAgg, viewsTotal, viewsDaily, activity, pendingOffers, unreadMessages, savedSearches] =
    await Promise.all([
      Application.countDocuments({ jobSeekerId: seekerObjId }),
      Interview.countDocuments({ jobSeekerId: seekerObjId, status: { $nin: ["cancelled"] }, scheduledAt: { $gte: now } }),
      Application.aggregate([
        { $match: { jobSeekerId: seekerObjId, aiMatchScore: { $exists: true, $ne: null } } },
        // The seeker's own number per pair — never an employer's re-weighted ranking.
        { $group: { _id: null, avg: { $avg: { $ifNull: ["$seekerMatchScore", "$aiMatchScore"] } } } },
      ]),
      ProfileView.countDocuments({ jobSeekerId: viewerScopeId, viewedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
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
      getSeekerActivity(seekerObjId, viewerScopeId, now),
      Offer.countDocuments({ jobSeekerId: seekerObjId, status: "pending" }),
      Conversation.find({ participants: new Types.ObjectId(String(seeker.userId)), type: { $ne: "customer_care" } })
        .select("unreadCounts")
        .lean()
        .then((convs) =>
          (convs as Array<{ unreadCounts?: Record<string, number> | Map<string, number> }>).reduce((sum, conv) => {
            const counts = conv.unreadCounts instanceof Map ? Object.fromEntries(conv.unreadCounts) : conv.unreadCounts ?? {};
            return sum + (Number(counts[String(seeker.userId)]) || 0);
          }, 0),
        )
        .catch(() => 0),
      SavedSearch.countDocuments({ userId: seeker.userId, emailAlert: true, frequency: { $ne: "never" } }),
    ]);

  // Build 7-element daily array (Mon=0 → Sun=6, $dayOfWeek: 1=Sun…7=Sat)
  const dailyMap: Record<number, number> = {};
  for (const entry of viewsDaily as Array<{ _id: number; count: number }>) {
    dailyMap[entry._id] = entry.count;
  }
  // Map Sunday=1 → index 6, Monday=2 → 0, … Saturday=7 → 5
  const daily = [2, 3, 4, 5, 6, 7, 1].map((dow) => dailyMap[dow] ?? 0);

  const avgMatchScore = matchScoreAgg[0]?.avg != null ? Math.round(matchScoreAgg[0].avg) : null;
  const { week, series, statusBreakdown } = activity;

  return NextResponse.json({
    applicationsSent: { count: appsTotal, delta: week.applications.current - week.applications.previous, daily: series.applications },
    upcomingInterviews: { count: interviewsTotal, delta: week.interviews.current - week.interviews.previous },
    avgMatchScore: { value: avgMatchScore, delta: 0 },
    recruiterViews: {
      total: viewsTotal,
      delta: week.profileViews.current - week.profileViews.previous,
      daily,
      last7Days: series.profileViews,
    },
    pendingOffers: { count: pendingOffers },
    unreadMessages: { count: unreadMessages },
    jobAlerts: { count: savedSearches },
    series,
    statusBreakdown,
  });
});
