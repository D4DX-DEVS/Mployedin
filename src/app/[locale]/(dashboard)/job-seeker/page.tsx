import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import SavedJob from "@/models/SavedJob";
import JobSeeker from "@/models/JobSeeker";
import ProfileView from "@/models/ProfileView";
import Notification from "@/models/Notification";

import { SmartWelcome } from "@/components/features/job-seeker/dashboard/SmartWelcome";
import { QuickActions } from "@/components/features/job-seeker/dashboard/QuickActions";
import { StatsGrid, CareerInsights } from "@/components/features/job-seeker/dashboard/StatsGrid";
import { RecommendedJobs } from "@/components/features/job-seeker/dashboard/RecommendedJobs";
import { AIInsightsCard } from "@/components/features/job-seeker/dashboard/AIInsightsCard";
import { RecentActivity } from "@/components/features/job-seeker/dashboard/RecentActivity";
import { UpcomingInterviews } from "@/components/features/job-seeker/dashboard/UpcomingInterviews";
import { Loader2 } from "lucide-react";

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default async function JobSeekerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const userId = session.user.id!;
  const userName = session.user.name?.split(" ")[0] ?? "there";

  // Parallel queries for dashboard data
  const [
    seeker,
    applicationsCount,
    interviewsCount,
    savedJobsCount,
    matchScoreAgg,
    profileViewsCount,
    successAgg,
    recentNotifications,
    upcomingInterviewsData,
    recentApplications,
  ] = await Promise.all([
    JobSeeker.findOne({ userId })
      .select("profileCompleteness skills experience education cv preferredRoles preferredCountries preferredSalary preferredJobType")
      .lean(),
    Application.countDocuments({ jobSeekerId: userId }),
    Interview.countDocuments({
      jobSeekerId: userId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    }),
    SavedJob.countDocuments({ jobSeekerId: userId }),
    Application.aggregate([
      { $match: { jobSeekerId: userId, aiMatchScore: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$aiMatchScore" } } },
    ]),
    ProfileView.countDocuments({
      jobSeekerId: userId,
      viewedAt: { $gte: thirtyDaysAgo },
    }),
    Application.aggregate([
      { $match: { jobSeekerId: userId } },
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
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("type title body actionUrl isRead createdAt")
      .lean(),
    Interview.find({
      jobSeekerId: userId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    })
      .sort({ scheduledAt: 1 })
      .limit(3)
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .lean(),
    Application.find({ jobSeekerId: userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .select("status jobId employerId updatedAt")
      .lean(),
  ]);

  const profileCompleteness = seeker?.profileCompleteness ?? 0;
  const avgMatchScore = matchScoreAgg[0]?.avg ? Math.round(matchScoreAgg[0].avg) : null;
  const successData = successAgg[0];
  const applicationSuccessRate =
    successData && successData.total > 0
      ? Math.round((successData.successful / successData.total) * 100)
      : null;

  const completionSteps = [
    { key: "skills", label: "Add skills", done: (seeker?.skills?.length ?? 0) > 0 },
    { key: "experience", label: "Add experience", done: (seeker?.experience?.length ?? 0) > 0 },
    { key: "education", label: "Add education", done: (seeker?.education?.length ?? 0) > 0 },
    { key: "cv", label: "Upload resume", done: !!seeker?.cv?.originalUrl },
    { key: "preferences", label: "Set job preferences", done: (seeker?.preferredRoles?.length ?? 0) > 0 },
  ];

  const stats = {
    applicationsCount,
    interviewsCount,
    savedJobsCount,
    avgMatchScore,
    profileViewsCount,
    applicationSuccessRate,
  };

  // Build recent activity
  const recentActivity = [
    ...recentApplications.map((app: Record<string, unknown>) => ({
      type: "application" as const,
      status: app.status as string,
      jobTitle: (app.jobId as Record<string, unknown>)?.title as string ?? "Unknown",
      companyName: (app.employerId as Record<string, unknown>)?.companyName as string ?? "Unknown",
      date: String(app.updatedAt),
    })),
    ...recentNotifications.map((n) => ({
      type: "notification" as const,
      notificationType: n.type,
      title: n.title,
      body: n.body,
      date: String(n.createdAt),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Serialize interviews for client component
  const upcomingInterviews = JSON.parse(JSON.stringify(upcomingInterviewsData));

  return (
    <div className="page-container space-y-6">
      {/* Smart Welcome + Profile Progress */}
      <SmartWelcome
        name={userName}
        profileCompleteness={profileCompleteness}
        completionSteps={completionSteps}
        locale={locale}
      />

      {/* Quick Actions */}
      <QuickActions locale={locale} />

      {/* Stats Grid */}
      <StatsGrid stats={stats} />

      {/* Recommended Jobs (client) */}
      <Suspense fallback={<LoadingSkeleton />}>
        <RecommendedJobs locale={locale} />
      </Suspense>

      {/* AI Insights (client) */}
      <Suspense fallback={<LoadingSkeleton />}>
        <AIInsightsCard />
      </Suspense>

      {/* Recent Activity + Upcoming Interviews — 2 column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentActivity items={recentActivity} />
        <UpcomingInterviews interviews={upcomingInterviews} locale={locale} />
      </div>

      {/* Career Insights */}
      <CareerInsights stats={stats} />
    </div>
  );
}
