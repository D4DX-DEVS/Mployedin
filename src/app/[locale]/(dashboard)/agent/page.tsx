import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BriefcaseBusiness, ClipboardList, Target, UserPlus } from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/shared/DashboardKit";
import { AssignedRegionBadge } from "@/components/shared/AssignedRegionBadge";
import { resolveAgentScope, type AgentScope } from "@/lib/agents/workQueue";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { localHourIn } from "@/lib/datetime/countryZone";
import { KpiStripSkeleton, PanelSkeleton } from "../admin/_components/section-states";
import {
  KpiSection,
  LeadFunnelSection,
  QueueSection,
  RecruitmentSection,
  TargetSection,
  TrendSection,
  type AgentSectionContext,
} from "./_components/sections";

/*
 * The agent home: one scrollable overview, ordered by what an agent opens it for.
 *
 *   1. greeting, assigned region, the four things an agent creates;
 *   2. six headline numbers with 30-day sparklines;
 *   3. this month's target beside what is waiting on them today;
 *   4. activity over time beside the employer-lead funnel;
 *   5. pipeline by status, the busiest roles, this month's commission.
 *
 * Every figure is counted from stored data and scoped to the agent's book —
 * jobs owned directly or through an assigned employer, the same definition
 * the nav badges use. Each section streams in on its own so one slow query
 * never holds up the rest.
 */
export default async function AgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("agentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  const userName = session.user.name?.split(" ")[0] ?? "there";

  const agentDoc = await Agent.findOne({ userId: session.user.id })
    .select("_id assignedEmployerIds assignedCityIds assignedStateIds timezone currencyCode")
    .lean();

  // Greeting by the agent's own clock, as on the super-agent home.
  const now = new Date();
  const timeZone = isValidTimeZone(agentDoc?.timezone) ? (agentDoc!.timezone as string) : "Asia/Dubai";
  const hour = localHourIn(timeZone, now);
  const greeting = t(
    hour < 12 ? "smartHeader.greetingMorning" : hour < 17 ? "smartHeader.greetingAfternoon" : "smartHeader.greetingEvening",
    { userName },
  );

  // The region an admin assigned, and the portfolio scope every section
  // counts within (the same module the nav badges read).
  const [assignedRegions, scope] = await Promise.all([
    resolveAssignedRegions(agentDoc, locale),
    agentDoc ? resolveAgentScope(String(session.user.id)) : Promise.resolve<AgentScope | null>(null),
  ]);

  const context: AgentSectionContext = {
    locale,
    userId: String(session.user.id),
    scope,
    currency: agentDoc?.currencyCode ?? "AED",
    now,
  };

  const p = (path: string) => `/${locale}${path}`;
  const loading = (section: string) => t("sectionLoading", { section });
  const updatedLabel = t("hero.updated", {
    time: now.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });

  // The same destinations the Create menu and ⌘K offer an agent
  // (src/lib/nav/quickActions.ts); `?new=1` opens the inline form on arrival.
  const quickActions: QuickAction[] = [
    { key: "addLead", label: t("quickActions.addLead"), href: p("/agent/leads?new=1"), icon: Target, primary: true },
    { key: "postJob", label: t("quickActions.postJob"), href: p("/agent/jobs/new"), icon: BriefcaseBusiness },
    { key: "addCandidate", label: t("quickActions.addCandidate"), href: p("/agent/job-seekers"), icon: UserPlus },
    { key: "logFollowUp", label: t("quickActions.logFollowUp"), href: p("/agent/tasks?new=1"), icon: ClipboardList },
  ];

  return (
    <div className="page-container dashboard-overview-page space-y-4">
      {/* 1. Greeting, region, quick actions */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{greeting}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <AssignedRegionBadge regions={assignedRegions} />
              <span>{t("hero.subtitleOverview")}</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            <time dateTime={now.toISOString()}>{updatedLabel}</time>
          </p>
        </div>
        <QuickActions actions={quickActions} ariaLabel={t("quickActions.label")} />
      </header>

      {/* 2. Headline numbers */}
      <Suspense fallback={<KpiStripSkeleton label={loading(t("kpi.title"))} />}>
        <KpiSection {...context} />
      </Suspense>

      {/* 3. Target + today's queue */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <Suspense fallback={<PanelSkeleton label={loading(t("target.title"))} rows={4} className="h-full" />}>
            <TargetSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-8">
          <Suspense fallback={<PanelSkeleton label={loading(t("queue.title"))} rows={6} className="h-full" />}>
            <QueueSection {...context} />
          </Suspense>
        </div>
      </div>

      {/* 4. Activity trend + lead funnel */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Suspense fallback={<PanelSkeleton label={loading(t("trends.title"))} rows={7} className="h-full" />}>
            <TrendSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<PanelSkeleton label={loading(t("leadFunnel.title"))} rows={7} className="h-full" />}>
            <LeadFunnelSection {...context} />
          </Suspense>
        </div>
      </div>

      {/* 5. Pipeline by status, role performance, commission */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          fallback={
            <>
              <PanelSkeleton label={loading(t("pipelineStatus.title"))} />
              <PanelSkeleton label={loading(t("rolePerformance.title"))} />
              <PanelSkeleton label={loading(t("commission.title"))} />
            </>
          }
        >
          <RecruitmentSection {...context} />
        </Suspense>
      </div>
    </div>
  );
}
