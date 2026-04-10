import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  InteractivePipeline,
  PriorityActions,
  AIInsightsPanel,
  DashboardAIHint,
  EnhancedJobsList,
  CandidateQuality,
} from "@/components/features/employer/dashboard";
import type { EnhancedJob } from "@/components/features/employer/dashboard";

export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();
  const userId = (session.user as unknown as { id: string }).id;
  const employer = await Employer.findOne({ userId }).select("_id companyName").lean();
  const employerId = employer?._id;
  const userName = session.user.name?.split(" ")[0] ?? "there";

  // Parallel data fetch — all queries run concurrently
  const [
    activeJobCount,
    totalApplications,
    newApplications,
    inReview,
    scheduledInterviews,
    placements,
    recentJobs,
    matchStats,
    jobsWithoutSalary,
    jobsWithNoApps,
    lastActivity,
  ] = employerId
    ? await Promise.all([
        Job.countDocuments({ employerId, status: "active" }),
        Application.countDocuments({ employerId }),
        Application.countDocuments({ employerId, status: "applied" }),
        Application.countDocuments({ employerId, status: "shortlisted" }),
        Interview.countDocuments({ employerId, status: "scheduled" }),
        Placement.countDocuments({ employerId }),
        // Top 5 active jobs with applicant count + avg match + top match + views + createdAt
        Job.aggregate([
          { $match: { employerId, status: "active" } },
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "applications",
              localField: "_id",
              foreignField: "jobId",
              as: "apps",
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              status: 1,
              views: 1,
              createdAt: 1,
              location: { city: 1, country: 1, isRemote: 1 },
              applicantCount: { $size: "$apps" },
              avgMatchScore: {
                $cond: {
                  if: { $gt: [{ $size: "$apps" }, 0] },
                  then: { $avg: "$apps.aiMatchScore" },
                  else: 0,
                },
              },
              topMatchScore: {
                $cond: {
                  if: { $gt: [{ $size: "$apps" }, 0] },
                  then: { $max: "$apps.aiMatchScore" },
                  else: 0,
                },
              },
            },
          },
        ]),
        // Global match stats for AI Insights + Candidate Quality
        Application.aggregate([
          { $match: { employerId, aiMatchScore: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              avg: { $avg: "$aiMatchScore" },
              max: { $max: "$aiMatchScore" },
              highCount: { $sum: { $cond: [{ $gte: ["$aiMatchScore", 80] }, 1, 0] } },
              lowCount: { $sum: { $cond: [{ $lt: ["$aiMatchScore", 50] }, 1, 0] } },
            },
          },
        ]),
        // Jobs without salary (for AI insight)
        Job.countDocuments({ employerId, status: "active", $or: [{ "salary.min": { $exists: false } }, { "salary.min": 0 }, { showSalary: false }] }),
        // Jobs with zero applications (for AI insight)
        Job.aggregate([
          { $match: { employerId, status: "active" } },
          { $lookup: { from: "applications", localField: "_id", foreignField: "jobId", as: "apps" } },
          { $match: { apps: { $size: 0 } } },
          { $count: "count" },
        ]),
        // Last application activity (time context)
        Application.findOne({ employerId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      ])
    : [0, 0, 0, 0, 0, 0, [], [], 0, [], null];

  const hiredCount = employerId
    ? await Application.countDocuments({ employerId, status: "hired" })
    : 0;

  // Extract match stats
  const stats = (matchStats as Array<{ avg: number; max: number; highCount: number; lowCount: number }>)[0];
  const avgMatchScore = stats?.avg ?? 0;
  const topMatchScore = stats?.max ?? 0;
  const highMatchCount = stats?.highCount ?? 0;
  const lowMatchCount = stats?.lowCount ?? 0;

  const hasJobsWithNoApps = ((jobsWithNoApps as Array<{ count: number }>)[0]?.count ?? 0) > 0;
  const hasJobsWithoutSalary = (jobsWithoutSalary as number) > 0;

  // Compute last activity in minutes
  const lastActivityMinutes = lastActivity?.updatedAt
    ? Math.round((Date.now() - new Date(lastActivity.updatedAt as Date).getTime()) / 60000)
    : null;

  const enhancedJobs: EnhancedJob[] = (recentJobs as Array<{
    _id: { toString(): string };
    title: string;
    status: string;
    applicantCount: number;
    avgMatchScore: number;
    topMatchScore: number;
    views: number;
    createdAt: Date;
    location?: { city?: string; country?: string; isRemote?: boolean };
  }>).map((j) => ({
    _id: j._id.toString(),
    title: j.title,
    status: j.status,
    applicantCount: j.applicantCount,
    avgMatchScore: j.avgMatchScore ?? 0,
    topMatchScore: j.topMatchScore ?? 0,
    views: j.views ?? 0,
    location: j.location,
    createdAt: j.createdAt ? new Date(j.createdAt).toISOString() : "",
  }));

  return (
    <div className="page-container">
      {/* ── Smart Welcome Header with urgency + time context ── */}
      <SmartHeader
        userName={userName}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        activeJobCount={activeJobCount}
        lastActivityMinutes={lastActivityMinutes}
        locale={locale}
      />

      {/* ── Interactive Hiring Pipeline (clickable + animated counts) ── */}
      <InteractivePipeline
        activeJobs={activeJobCount}
        newApplications={newApplications}
        inReview={inReview}
        interviews={scheduledInterviews}
        hired={hiredCount}
        locale={locale}
      />

      {/* ── Priority Actions (urgency-tagged, not generic) ── */}
      <PriorityActions
        activeJobs={activeJobCount}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        totalApplications={totalApplications}
        placements={placements}
        locale={locale}
      />

      {/* ── AI Insights + Candidate Quality (side by side on desktop) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <AIInsightsPanel
          activeJobCount={activeJobCount}
          totalApplications={totalApplications}
          avgMatchScore={avgMatchScore}
          highMatchCount={highMatchCount}
          lowMatchCount={lowMatchCount}
          topMatchScore={topMatchScore}
          hiredCount={hiredCount}
          hasJobsWithNoApps={hasJobsWithNoApps}
          hasJobsWithoutSalary={hasJobsWithoutSalary}
        />
        <CandidateQuality
          avgMatchScore={avgMatchScore}
          highMatchCount={highMatchCount}
          lowMatchCount={lowMatchCount}
          totalApplications={totalApplications}
        />
      </div>

      {/* ── Inline AI Hint (increases discoverability) ── */}
      <DashboardAIHint
        hasJobs={activeJobCount > 0}
        hasApplications={totalApplications > 0}
        hasInterviews={scheduledInterviews > 0}
      />

      {/* ── Enhanced Active Jobs with match scores + views + quick actions ── */}
      <EnhancedJobsList jobs={enhancedJobs} locale={locale} />

      {/* Setup Guide (conditional — new employers) */}
      <SetupGuide />
    </div>
  );
}
