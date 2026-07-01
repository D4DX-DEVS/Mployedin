import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  InteractivePipeline,
  PriorityActions,
  CurrentOpeningsList,
  TimeToHire,
  JobStatusQuickFilters,
  AIRecommendedCandidatesCard,
  DraftExtractionsCard,
  DraftJobsCard,
  AIChatDraftsCard,
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
      {/* ── Smart Welcome Header (hero + KPI strip) ── */}
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

      {/* ── Work band: Priority Actions | Continue Working | AI Recommended ──
          Mirrors the command-center layout: three action columns side by side on
          desktop, stacked on mobile. Each column self-hides its own content when
          empty (PriorityActions and AIRecommended return null; the Continue
          Working cards return null individually).
          ponytail: on a brand-new account where all three columns are empty this
          leaves grid gaps — acceptable; SetupGuide covers the cold-start state. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
        <PriorityActions
          activeJobs={activeJobCount}
          newApplications={newApplications}
          scheduledInterviews={scheduledInterviews}
          totalApplications={totalApplications}
          placements={placements}
          locale={locale}
        />

        {/* Continue Working — resume surfaces, each self-hides when empty:
            1. Draft Jobs     — manual form autosave (Job{status:"draft"})
            2. AI Chat Drafts — conversational AI creator transcripts
            3. AI Extractions — batch-extracted unposted jobs */}
        <div className="space-y-4 sm:space-y-5">
          <DraftJobsCard locale={locale} />
          <AIChatDraftsCard locale={locale} />
          <DraftExtractionsCard locale={locale} />
        </div>

        <AIRecommendedCandidatesCard
          highMatchCount={highMatchCount}
          band90PlusCount={band90PlusCount}
          band80to89Count={band80to89Count}
          needsReviewCount={needsReviewCount}
          activeJobCount={activeJobCount}
          locale={locale}
        />
      </div>

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

      {/* ── Analytics band: Job Management | Candidate Quality | Time to Hire ── */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
        <CurrentOpeningsList
          activeJobs={activeJobCount}
          totalApplications={totalApplications}
          locale={locale}
        />
        <CandidateQualityChart
          avgMatchScore={avgMatchScore}
          highMatchCount={highMatchCount}
          lowMatchCount={lowMatchCount}
          totalApplications={totalApplications}
        />
        <TimeToHire avgDays={avgTimeToHire} />
      </div>

      {/* Setup Guide (conditional — new employers) */}
      <SetupGuide />
    </div>
  );
}
