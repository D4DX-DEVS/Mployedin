import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import SavedJob from "@/models/SavedJob";
import JobSeeker from "@/models/JobSeeker";
import ProfileView from "@/models/ProfileView";
import Notification from "@/models/Notification";

/**
 * GET /api/job-seeker/dashboard
 *
 * Aggregated dashboard data for the current job seeker in a single call.
 * Runs all queries in parallel for performance.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    seeker,
    applicationsCount,
    interviewsCount,
    savedJobsCount,
    matchScoreAgg,
    profileViewsCount,
    successAgg,
    recentNotifications,
    upcomingInterviews,
    recentApplications,
  ] = await Promise.all([
    // Profile completeness
    JobSeeker.findOne({ userId: ctx.userId })
      .select("profileCompleteness skills experience education cv preferredRoles preferredCountries preferredSalary preferredJobType")
      .lean(),

    // Total applications
    Application.countDocuments({ jobSeekerId: ctx.userId }),

    // Upcoming interviews (future, not cancelled)
    Interview.countDocuments({
      jobSeekerId: ctx.userId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    }),

    // Saved jobs
    SavedJob.countDocuments({ jobSeekerId: ctx.userId }),

    // Average AI match score
    Application.aggregate([
      { $match: { jobSeekerId: ctx.userId, aiMatchScore: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$aiMatchScore" } } },
    ]),

    // Profile views (last 30 days)
    ProfileView.countDocuments({
      jobSeekerId: ctx.userId,
      viewedAt: { $gte: thirtyDaysAgo },
    }),

    // Application success rate
    Application.aggregate([
      { $match: { jobSeekerId: ctx.userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: {
            $sum: {
              $cond: [
                { $in: ["$status", ["shortlisted", "interview_scheduled", "selected", "offer", "hired"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),

    // Recent notifications (last 5)
    Notification.find({ userId: ctx.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("type title body actionUrl isRead createdAt")
      .lean(),

    // Upcoming interviews (next 3, populated)
    Interview.find({
      jobSeekerId: ctx.userId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    })
      .sort({ scheduledAt: 1 })
      .limit(3)
      .populate("jobId", "title employerId")
      .populate("employerId", "companyName")
      .lean(),

    // Recent applications (last 5 for activity feed)
    Application.find({ jobSeekerId: ctx.userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .select("status jobId employerId updatedAt statusHistory")
      .lean(),
  ]);

  const avgMatchScore = matchScoreAgg[0]?.avg
    ? Math.round(matchScoreAgg[0].avg)
    : null;

  const successData = successAgg[0];
  const applicationSuccessRate = successData && successData.total > 0
    ? Math.round((successData.successful / successData.total) * 100)
    : null;

  // Build recent activity from applications + notifications
  const recentActivity = [
    ...recentApplications.map((app: Record<string, unknown>) => ({
      type: "application" as const,
      status: app.status,
      jobTitle: (app.jobId as Record<string, unknown>)?.title ?? "Unknown",
      companyName: (app.employerId as Record<string, unknown>)?.companyName ?? "Unknown",
      date: app.updatedAt,
    })),
    ...recentNotifications.map((n: Record<string, unknown>) => ({
      type: "notification" as const,
      notificationType: n.type,
      title: n.title,
      body: n.body,
      date: n.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
    .slice(0, 5);

  // Profile completion steps
  const completionSteps = [
    { key: "skills", label: "Add skills", done: (seeker?.skills?.length ?? 0) > 0 },
    { key: "experience", label: "Add experience", done: (seeker?.experience?.length ?? 0) > 0 },
    { key: "education", label: "Add education", done: (seeker?.education?.length ?? 0) > 0 },
    { key: "cv", label: "Upload resume", done: !!seeker?.cv?.originalUrl },
    { key: "preferences", label: "Set job preferences", done: (seeker?.preferredRoles?.length ?? 0) > 0 },
  ];

  return NextResponse.json({
    profileCompleteness: seeker?.profileCompleteness ?? 0,
    completionSteps,
    stats: {
      applicationsCount,
      interviewsCount,
      savedJobsCount,
      avgMatchScore,
      profileViewsCount,
      applicationSuccessRate,
    },
    upcomingInterviews,
    recentActivity,
    recentNotifications,
  });
});
