import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  DashboardStatCards,
  InteractivePipeline,
  QuickInsights,
  PriorityActions,
  JobStatusQuickFilters,
  AIRecommendedCandidatesCard,
  DraftExtractionsCard,
  DraftJobsCard,
  AIChatDraftsCard,
} from "@/components/features/employer/dashboard";

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
    lastActivityMinutes,
  } = await getEmployerDashboardStats(userId);

  return (
    <div className="page-container employer-legacy-surface space-y-5 sm:space-y-6">
      {/* ── Hero: AI Hiring Summary + mascot + Create-with-AI CTA ── */}
      <SmartHeader
        userName={userName}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        activeJobCount={activeJobCount}
        highMatchCount={highMatchCount}
        lastActivityMinutes={lastActivityMinutes}
        locale={locale}
      />

      {/* ── Headline KPI cards ── */}
      <DashboardStatCards
        activeJobCount={activeJobCount}
        newApplications={newApplications}
        highMatchCount={highMatchCount}
        scheduledInterviews={scheduledInterviews}
        locale={locale}
      />

      {/* ── Job status quick filters (Active / Draft / Paused) ── */}
      <JobStatusQuickFilters
        activeJobs={activeJobCount}
        draftJobs={draftJobCount}
        pausedJobs={pausedJobCount}
        locale={locale}
      />

      {/* ── Work band: AI Recommended Candidates | Priority Actions + resume-work drafts ──
          Left column self-hides when there are no scored candidates; right column
          self-hides individually (PriorityActions + each draft card return null when
          empty). ponytail: on a brand-new account both columns can be empty — the
          SetupGuide below covers that cold-start state. */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AIRecommendedCandidatesCard
            highMatchCount={highMatchCount}
            band90PlusCount={band90PlusCount}
            band80to89Count={band80to89Count}
            needsReviewCount={needsReviewCount}
            activeJobCount={activeJobCount}
            locale={locale}
          />
        </div>
        <PriorityActions
          activeJobs={activeJobCount}
          newApplications={newApplications}
          scheduledInterviews={scheduledInterviews}
          totalApplications={totalApplications}
          placements={placements}
          locale={locale}
        />
      </div>

      {/* ── Continue working: resume drafts, side by side (each self-hides when empty) ── */}
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        <DraftJobsCard locale={locale} />
        <AIChatDraftsCard locale={locale} />
        <DraftExtractionsCard locale={locale} />
      </div>

      {/* ── Analytics band: 5-stage Hiring Pipeline | Quick Insights ── */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InteractivePipeline
            totalApplications={totalApplications}
            newApplications={newApplications}
            inReview={inReview}
            interviews={scheduledInterviews}
            offers={offerCount}
            offersSent={offersSent}
            placements={placements}
            locale={locale}
          />
        </div>
        <QuickInsights avgMatchScore={avgMatchScore} highMatchCount={highMatchCount} />
      </div>

      {/* Setup Guide (conditional — new employers) */}
      <SetupGuide />
    </div>
  );
}
