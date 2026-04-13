import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import { Offer } from "@/models/Offer";
import dynamic from "next/dynamic";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  InteractivePipeline,
  PriorityActions,
  CurrentOpeningsList,
  OpeningsStats,
  TimeToHire,
} from "@/components/features/employer/dashboard";

// Lazy-load the recharts-based chart component — it's below the fold and not needed for initial paint
const CandidateQualityChart = dynamic(
  () =>
    import("@/components/features/employer/dashboard/CandidateQualityChart").then(
      (m) => m.CandidateQualityChart
    ),
  { ssr: false, loading: () => <div className="h-full min-h-[200px] animate-pulse rounded-2xl bg-muted/50" /> }
);

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
    offerCount,
    offersSent,
    matchStats,
    timeToHireResult,
    lastActivity,
  ] = employerId
    ? await Promise.all([
        Job.countDocuments({ employerId, status: "active" }),
        Application.countDocuments({ employerId }),
        Application.countDocuments({ employerId, status: "applied" }),
        Application.countDocuments({ employerId, status: "shortlisted" }),
        Interview.countDocuments({ employerId, status: "scheduled" }),
        Placement.countDocuments({ employerId }),
        // Total offers created
        Offer.countDocuments({ employerId }),
        // Offers sent (pending = recently sent, not yet responded)
        Offer.countDocuments({ employerId, status: "pending" }),
        // Global match stats for Candidate Quality chart
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
        // Time to hire: avg days from application to placement
        Placement.aggregate([
          { $match: { employerId } },
          {
            $lookup: {
              from: "applications",
              localField: "applicationId",
              foreignField: "_id",
              as: "app",
            },
          },
          { $unwind: { path: "$app", preserveNullAndEmptyArrays: false } },
          {
            $project: {
              days: {
                $divide: [
                  { $subtract: ["$placedAt", "$app.createdAt"] },
                  1000 * 60 * 60 * 24,
                ],
              },
            },
          },
          { $group: { _id: null, avgDays: { $avg: "$days" } } },
        ]),
        // Last application activity (time context)
        Application.findOne({ employerId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0, [], [], null];

  // Extract match stats
  const stats = (matchStats as Array<{ avg: number; max: number; highCount: number; lowCount: number }>)[0];
  const avgMatchScore = stats?.avg ?? 0;
  const highMatchCount = stats?.highCount ?? 0;
  const lowMatchCount = stats?.lowCount ?? 0;

  // Time to hire (avg days)
  const avgTimeToHire = (timeToHireResult as Array<{ avgDays: number }>)[0]?.avgDays ?? null;

  // Compute last activity in minutes
  const lastActivityMinutes = lastActivity?.updatedAt
    ? Math.round((Date.now() - new Date(lastActivity.updatedAt as Date).getTime()) / 60000)
    : null;

  return (
    <div className="page-container">
      {/* ── Smart Welcome Header ── */}
      <SmartHeader
        userName={userName}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        activeJobCount={activeJobCount}
        lastActivityMinutes={lastActivityMinutes}
        locale={locale}
      />

      {/* ── Hiring Pipeline (4-stage: Applied / Screening / Interviews / Offers) ── */}
      <InteractivePipeline
        totalApplications={totalApplications}
        newApplications={newApplications}
        inReview={inReview}
        interviews={scheduledInterviews}
        offers={offerCount as number}
        offersSent={offersSent as number}
        locale={locale}
      />

      {/* ── Priority Actions + Candidate Quality Chart (side by side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3">
          <PriorityActions
            activeJobs={activeJobCount}
            newApplications={newApplications}
            scheduledInterviews={scheduledInterviews}
            totalApplications={totalApplications}
            placements={placements}
            locale={locale}
          />
        </div>
        <div className="lg:col-span-2">
          <CandidateQualityChart
            avgMatchScore={avgMatchScore}
            highMatchCount={highMatchCount}
            lowMatchCount={lowMatchCount}
            totalApplications={totalApplications}
          />
        </div>
      </div>

      {/* ── Stats Row: Current Openings list / stats + Time to Hire ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <CurrentOpeningsList
          activeJobs={activeJobCount}
          totalApplications={totalApplications}
          locale={locale}
        />
        <OpeningsStats
          activeJobs={activeJobCount}
          totalApplications={totalApplications}
        />
        <TimeToHire avgDays={avgTimeToHire} />
      </div>

      {/* Setup Guide (conditional — new employers) */}
      <SetupGuide />
    </div>
  );
}
