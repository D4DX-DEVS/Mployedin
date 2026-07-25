import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import {
  SmartHeader,
  DashboardStatCards,
  InteractivePipeline,
  PriorityActions,
  AIRecommendedCandidatesCard,
  DraftExtractionsCard,
  DraftJobsCard,
  AIChatDraftsCard,
} from "@/components/features/employer/dashboard";

export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
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
    interviewsToday,
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
    <div className="page-container space-y-3 sm:space-y-4">
      <SmartHeader
        userName={userName}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        activeJobCount={activeJobCount}
        highMatchCount={highMatchCount}
        lastActivityMinutes={lastActivityMinutes}
        locale={locale}
      />

      <PriorityActions
        activeJobs={activeJobCount}
        newApplications={newApplications}
        scheduledInterviews={scheduledInterviews}
        totalApplications={totalApplications}
        placements={placements}
        locale={locale}
      />

      {/* ── Headline KPI cards ── */}
      <DashboardStatCards
        activeJobCount={activeJobCount}
        draftJobCount={draftJobCount}
        pausedJobCount={pausedJobCount}
        newApplications={newApplications}
        highMatchCount={highMatchCount}
        interviewsToday={interviewsToday}
        locale={locale}
      />

      <InteractivePipeline
        totalApplications={totalApplications}
        newApplications={newApplications}
        inReview={inReview}
        interviews={scheduledInterviews}
        offers={offerCount}
        offersSent={offersSent}
        placements={placements}
        avgMatchScore={avgMatchScore}
        locale={locale}
      />

      <AIRecommendedCandidatesCard
        highMatchCount={highMatchCount}
        band90PlusCount={band90PlusCount}
        band80to89Count={band80to89Count}
        needsReviewCount={needsReviewCount}
        activeJobCount={activeJobCount}
        locale={locale}
      />

      <div className="grid gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <DraftJobsCard locale={locale} />
        <AIChatDraftsCard locale={locale} />
        <DraftExtractionsCard locale={locale} />
      </div>

      {/* Setup Guide (conditional — new employers) */}
      <SetupGuide />
    </div>
  );
}
