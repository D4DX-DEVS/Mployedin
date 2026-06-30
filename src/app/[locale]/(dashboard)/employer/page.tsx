import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  InteractivePipeline,
  PriorityActions,
  CurrentOpeningsList,
  OpeningsStats,
  TimeToHire,
  JobStatusQuickFilters,
  AIRecommendedCandidatesCard,
} from "@/components/features/employer/dashboard";
import { CandidateQualityChartLazy as CandidateQualityChart } from "@/components/features/employer/dashboard/CandidateQualityChartLazy";

export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  const userId = (session.user as unknown as { id: string }).id;
  const userName = session.user.name?.split(" ")[0] ?? "there";

  const {
    activeJobCount,
    draftJobCount,
    pausedJobCount,
    totalApplications,
    newApplications,
    inReview,
    scheduledInterviews,
    placements,
    offerCount,
    offersSent,
    avgMatchScore,
    highMatchCount,
    band90PlusCount,
    band80to89Count,
    needsReviewCount,
    lowMatchCount,
    avgTimeToHire,
    lastActivityMinutes,
  } = await getEmployerDashboardStats(userId);

  return (
    <div className="page-container employer-legacy-surface space-y-5 sm:space-y-6">
      {/* ── Smart Welcome Header ── */}
      <SmartHeader
        userName={userName}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        activeJobCount={activeJobCount}
        highMatchCount={highMatchCount}
        lastActivityMinutes={lastActivityMinutes}
        locale={locale}
      />

      {/* ── Job Status Quick Filters (Active / Draft / Paused) ── */}
      <JobStatusQuickFilters
        activeJobs={activeJobCount}
        draftJobs={draftJobCount}
        pausedJobs={pausedJobCount}
        locale={locale}
      />

      {/* ── Priority Actions + Candidate Quality Chart (side by side) ── */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
        <div>
          <PriorityActions
            activeJobs={activeJobCount}
            newApplications={newApplications}
            scheduledInterviews={scheduledInterviews}
            totalApplications={totalApplications}
            placements={placements}
            locale={locale}
          />
        </div>
        <div>
          <CandidateQualityChart
            avgMatchScore={avgMatchScore}
            highMatchCount={highMatchCount}
            lowMatchCount={lowMatchCount}
            totalApplications={totalApplications}
          />
        </div>
      </div>

      {/* ── AI Recommended Candidates (high-match surfacing) ── */}
      <AIRecommendedCandidatesCard
        highMatchCount={highMatchCount}
        band90PlusCount={band90PlusCount}
        band80to89Count={band80to89Count}
        needsReviewCount={needsReviewCount}
        activeJobCount={activeJobCount}
        locale={locale}
      />

      {/* ── Hiring Pipeline (4-stage: Applied / Screening / Interviews / Offers) ── */}
      <InteractivePipeline
        totalApplications={totalApplications}
        newApplications={newApplications}
        inReview={inReview}
        interviews={scheduledInterviews}
        offers={offerCount}
        offersSent={offersSent}
        locale={locale}
      />

      {/* ── Stats Row: Current Openings list / stats + Time to Hire ── */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(280px,1fr)]">
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
