import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { SetupGuide } from "@/components/features/employer/SetupGuide";
import { KpiStripSkeleton, PanelSkeleton } from "@/app/[locale]/(dashboard)/admin/_components/section-states";
import {
  AIRecommendedCandidatesCard,
  ApplicationsTrendPanel,
  AttentionPanel,
  DraftsCard,
  EmployerHeader,
  EmployerKpiStrip,
  JobsHealthPanel,
  PipelinePanel,
  TopJobsPanel,
} from "@/components/features/employer/dashboard";

/*
 * Employer dashboard: one scrollable page, ordered by what an employer opens it for.
 *
 *   1. greeting + the verbs (post a job, review candidates, interviews, talent pool);
 *   2. onboarding banner while setup is incomplete;
 *   3. headline numbers with a 30-day sparkline each;
 *   4. applications & interviews over time beside what needs a decision;
 *   5. pipeline by status, job health, AI match estimates;
 *   6. jobs drawing the most applications beside drafts to resume.
 *
 * Every figure is counted from stored data by `getEmployerDashboardStats`, which
 * the streamed sections share (one query batch, cached briefly), so a slow
 * aggregate holds up only its own panel.
 */
export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  if (!session?.user) redirect(`/${locale}/login`);

  const userId = (session.user as unknown as { id: string }).id;
  const userName = session.user.name?.split(" ")[0] ?? "there";
  const t = await getTranslations("employerDashboard.overview");
  const loading = (section: string) => t("sectionLoading", { section });

  return (
    <div className="page-container dashboard-overview-page space-y-4">
      <EmployerHeader userName={userName} locale={locale} />

      {/* Setup guide (client, self-hides when complete or dismissed) */}
      <SetupGuide />

      {/* 1. Headline numbers */}
      <Suspense fallback={<KpiStripSkeleton label={loading(t("kpi.title"))} />}>
        <KpiSection userId={userId} locale={locale} />
      </Suspense>

      {/* 2. Trend + what needs attention */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Suspense fallback={<PanelSkeleton label={loading(t("trend.title"))} rows={7} className="h-full" />}>
            <TrendSection userId={userId} locale={locale} />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<PanelSkeleton label={loading(t("attention.title"))} rows={7} className="h-full" />}>
            <AttentionSection userId={userId} locale={locale} />
          </Suspense>
        </div>
      </div>

      {/* 3. Pipeline, job health, AI matches */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          fallback={
            <>
              <PanelSkeleton label={loading(t("pipeline.title"))} />
              <PanelSkeleton label={loading(t("jobsHealth.title"))} />
              <PanelSkeleton label={loading(t("aiMatchesTitle"))} />
            </>
          }
        >
          <BreakdownSection userId={userId} locale={locale} />
        </Suspense>
      </div>

      {/* 4. Top jobs + drafts */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Suspense fallback={<PanelSkeleton label={loading(t("topJobs.title"))} rows={6} className="h-full" />}>
            <TopJobsSection userId={userId} locale={locale} />
          </Suspense>
        </div>
        <div className="xl:col-span-5">
          <DraftsCard locale={locale} />
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  userId: string;
  locale: string;
}

async function KpiSection({ userId, locale }: SectionProps) {
  const stats = await getEmployerDashboardStats(userId);
  return <EmployerKpiStrip stats={stats} locale={locale} />;
}

async function TrendSection({ userId, locale }: SectionProps) {
  const stats = await getEmployerDashboardStats(userId);
  return <ApplicationsTrendPanel daily={stats.daily} days={stats.windowDays} locale={locale} />;
}

async function AttentionSection({ userId, locale }: SectionProps) {
  const stats = await getEmployerDashboardStats(userId);
  return <AttentionPanel stats={stats} locale={locale} />;
}

async function BreakdownSection({ userId, locale }: SectionProps) {
  const stats = await getEmployerDashboardStats(userId);
  return (
    <>
      <PipelinePanel pipeline={stats.pipelineByStatus} locale={locale} />
      <JobsHealthPanel stats={stats} locale={locale} />
      <AIRecommendedCandidatesCard
        highMatchCount={stats.highMatchCount}
        band90PlusCount={stats.band90PlusCount}
        band80to89Count={stats.band80to89Count}
        needsReviewCount={stats.needsReviewCount}
        activeJobCount={stats.activeJobCount}
        locale={locale}
      />
    </>
  );
}

async function TopJobsSection({ userId, locale }: SectionProps) {
  const stats = await getEmployerDashboardStats(userId);
  return <TopJobsPanel jobs={stats.topJobs} days={stats.windowDays} locale={locale} />;
}
