import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Target,
  Trophy,
  UserX,
  Users2,
} from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { AssignedRegionBadge } from "@/components/shared/AssignedRegionBadge";
import { DashboardNextAction } from "@/components/shared/DashboardOverview";
import { SuperAgentPriorityQueue, type PriorityItem } from "@/components/features/super-agent/PriorityQueue";
import { SuperAgentKpiCards, type KpiCard, type KpiTrend } from "@/components/features/super-agent/dashboard/KpiCards";
import { RegionalFunnel } from "@/components/features/super-agent/dashboard/RegionalFunnel";
import { TopAgentsTable } from "@/components/features/super-agent/dashboard/TopAgentsTable";
import { TeamActivityChart } from "@/components/features/super-agent/dashboard/TeamActivityChart";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { loadSuperAgentDashboard } from "@/lib/superAgent/dashboardData";
import { localHourIn } from "@/lib/datetime/countryZone";

/**
 * The super-agent home, answering three questions in order: what needs me,
 * how is my region doing, how is my team doing. Every figure is counted live
 * and says its period; every number opens the list it counts, filtered so the
 * list shows the same records. No shortcut tiles: the sidebar, the phone tab
 * bar and the "+" menu already link every destination and create action.
 */
export default async function SuperAgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superAgentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  const now = new Date();
  const data = await loadSuperAgentDashboard(session.user.id as string, now);
  // The super-agent's OWN territory, as an admin assigned it — not the union
  // with their agents' regions that scopes the figures.
  const assignedRegions = await resolveAssignedRegions(data.region, locale);
  const { kpis, funnel, queue } = data;
  const href = (path: string) => `/${locale}/super-agent${path}`;

  // ── Hero ─────────────────────────────────────────────────────────────────
  const firstName = session.user.name?.split(" ")[0] || t("hero.fallbackName");
  const hour = localHourIn(data.timeZone, now);
  const greeting = hour < 12
    ? t("hero.greetingMorning", { name: firstName })
    : hour < 17
      ? t("hero.greetingAfternoon", { name: firstName })
      : t("hero.greetingEvening", { name: firstName });
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: data.timeZone,
  }).format(now);

  // ── KPI cards: each says its period; the trend line is this month's real count ──
  const newThisMonth = (count: number): KpiCard["delta"] => ({
    trend: count > 0 ? "up" : "flat",
    text: t("kpiDelta.newThisMonth", { count }),
  });
  const placementDiff = kpis.placementsThisMonth - kpis.placementsLastMonth;
  const placementTrend: KpiTrend = placementDiff > 0 ? "up" : placementDiff < 0 ? "down" : "flat";
  const cards: KpiCard[] = [
    {
      key: "agents", label: t("kpis.activeAgents.label"), value: kpis.activeAgents,
      context: t("kpiContext.activeAgents"), delta: newThisMonth(kpis.newAgentsThisMonth),
      href: href("/agents?status=active"), icon: Users2, tone: "sky",
    },
    {
      key: "employers", label: t("kpis.totalEmployers.label"), value: kpis.employers,
      context: t("kpiContext.employers"), delta: newThisMonth(kpis.newEmployersThisMonth),
      href: href("/employers"), icon: Building2, tone: "violet",
    },
    {
      key: "jobs", label: t("kpis.activeJobs.label"), value: kpis.activeJobs,
      context: t("kpiContext.activeJobs"),
      delta: { trend: kpis.jobsPostedThisMonth > 0 ? "up" : "flat", text: t("kpiDelta.postedThisMonth", { count: kpis.jobsPostedThisMonth }) },
      href: href("/jobs?status=active"), icon: Briefcase, tone: "emerald",
    },
    {
      key: "placements", label: t("kpis.totalPlacements.label"), value: kpis.placementsThisMonth,
      context: t("kpiContext.placements"),
      delta: {
        trend: placementTrend,
        text: placementDiff > 0
          ? t("kpiDelta.moreThanLastMonth", { count: placementDiff })
          : placementDiff < 0
            ? t("kpiDelta.fewerThanLastMonth", { count: -placementDiff })
            : t("kpiDelta.sameAsLastMonth"),
      },
      href: href("/placements"), icon: Trophy, tone: "amber",
    },
  ];

  // ── Needs your attention ───────────────────────────────────────────────
  // Counts, not ratios. Each list page opens pre-filtered to exactly these
  // records, so the number and the destination agree.
  const priorityItems: PriorityItem[] = [
    queue.pendingExhibitions > 0 && {
      key: "exhibitions", level: "urgent" as const, levelLabel: t("priority.urgent"),
      count: queue.pendingExhibitions,
      title: t("priority.rows.exhibitionsTitle", { count: queue.pendingExhibitions }),
      hint: t("priority.rows.exhibitionsHint"),
      actionLabel: t("priority.exhibitionsAction"), href: href("/exhibitions?status=pending_review"), icon: CalendarDays,
    },
    queue.pendingCommissions > 0 && {
      key: "commissions", level: "urgent" as const, levelLabel: t("priority.urgent"),
      count: queue.pendingCommissions,
      title: t("priority.rows.commissionsTitle", { count: queue.pendingCommissions }),
      hint: t("priority.rows.commissionsHint"),
      actionLabel: t("priority.commissionsAction"), href: href("/commissions?status=pending"), icon: DollarSign,
    },
    queue.overdueFollowUps > 0 && {
      key: "overdueLeads", level: "soon" as const, levelLabel: t("priority.soon"),
      count: queue.overdueFollowUps,
      title: t("priority.rows.overdueLeadsTitle", { count: queue.overdueFollowUps }),
      hint: t("priority.rows.overdueLeadsHint"),
      actionLabel: t("priority.overdueLeadsAction"), href: href("/leads?hasFollowUp=overdue"), icon: Target,
    },
    queue.inactiveAgents > 0 && {
      key: "inactiveAgents", level: "review" as const, levelLabel: t("priority.review"),
      count: queue.inactiveAgents,
      title: t("priority.rows.inactiveAgentsTitle", { count: queue.inactiveAgents }),
      hint: t("priority.rows.inactiveAgentsHint"),
      actionLabel: t("priority.inactiveAgentsAction"), href: href("/agents?status=inactive"), icon: UserX,
    },
    queue.idleAgents > 0 && {
      key: "idleAgents", level: "review" as const, levelLabel: t("priority.review"),
      count: queue.idleAgents,
      title: t("priority.rows.idleAgentsTitle", { count: queue.idleAgents }),
      hint: t("priority.rows.idleAgentsHint"),
      actionLabel: t("priority.idleAgentsAction"), href: href("/agents?performance=no_activity"), icon: Users2,
    },
  ].filter(Boolean) as PriorityItem[];

  // The quiet-day nudge, only once the queue is clear (an inactive agent is
  // itself a queue row, so it never reaches here).
  const nextAction = funnel.leads > funnel.employers
    ? { title: t("actions.leadPipeline.label"), description: t("actions.leadPipeline.description"), href: href("/leads"), icon: Target, badge: t("taskFirst.followUp") }
    : { title: t("actions.jobOversight.label"), description: t("taskFirst.jobOversightDescription"), href: href("/jobs"), icon: CheckCircle2, badge: t("taskFirst.review") };

  // ── Funnel: all-time volume + ratios that say what they divide ─────────
  const ratio = (num: number, den: number, format: (v: number) => string) => (den > 0 ? format(num / den) : "—");
  const funnelStages = [
    { key: "leads", label: t("funnel.leads"), value: funnel.leads },
    { key: "employers", label: t("funnel.employers"), value: funnel.employers },
    { key: "jobs", label: t("funnel.jobs"), value: funnel.jobs },
    { key: "applications", label: t("funnel.applications"), value: funnel.applications },
    { key: "placements", label: t("funnel.placements"), value: funnel.placements },
  ];
  const funnelRatios = [
    {
      key: "jobsPerEmployer", label: t("funnelPanel.jobsPerEmployer"),
      value: ratio(funnel.jobs, funnel.employers, (v) => `${v.toFixed(1)}×`),
      basis: t("funnelPanel.jobsPerEmployerBasis", { jobs: funnel.jobs, employers: funnel.employers }),
    },
    {
      key: "applicationsPerJob", label: t("funnelPanel.applicationsPerJob"),
      value: ratio(funnel.applications, funnel.jobs, (v) => v.toFixed(2)),
      basis: t("funnelPanel.applicationsPerJobBasis", { applications: funnel.applications, jobs: funnel.jobs }),
    },
    {
      key: "placementRate", label: t("funnel.placementRate"),
      value: ratio(funnel.placements, funnel.applications, (v) => `${Math.round(v * 100)}%`),
      basis: t("funnelPanel.placementRateBasis", { placements: funnel.placements, applications: funnel.applications }),
    },
  ];

  // ── Team activity: localised month labels over "YYYY-MM" keys ──────────
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const activityPoints = data.activity.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    return { label: monthLabel.format(new Date(Date.UTC(y, mo - 1, 1))), leads: m.leads, jobs: m.jobs, applications: m.applications };
  });

  return (
    <div className="page-container dashboard-overview-page">
      <WorkspaceHeader
        title={greeting}
        context={
          <>
            <AssignedRegionBadge regions={assignedRegions} className="me-2" />
            {t("hero.subtitle")}
          </>
        }
        actions={
          <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-1.5 sm:flex">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            <div className="leading-tight">
              <p className="text-[11px] font-medium text-muted-foreground">{t("hero.today")}</p>
              <p className="text-sm font-semibold text-foreground">{today}</p>
            </div>
          </div>
        }
      />

      <SuperAgentKpiCards cards={cards} />

      <div className="grid items-stretch gap-3 sm:gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-3 sm:gap-4">
          <SuperAgentPriorityQueue
            headingId="super-agent-priority"
            title={t("priority.title")}
            description={t("priority.description")}
            items={priorityItems}
            emptyTitle={t("priority.empty")}
            emptyHint={t("priority.emptyHint")}
            className="flex-1"
          />
          {priorityItems.length === 0 && (
            <DashboardNextAction
              headingId="super-agent-next-action"
              title={t("taskFirst.recommendedNext")}
              description={t("taskFirst.nextDescription")}
              actionTitle={nextAction.title}
              actionDescription={nextAction.description}
              actionLabel={t("taskFirst.openAction")}
              href={nextAction.href}
              icon={nextAction.icon}
              badge={nextAction.badge}
            />
          )}
        </div>
        <RegionalFunnel
          headingId="super-agent-funnel"
          title={t("funnelPanel.title")}
          description={t("funnelPanel.description")}
          periodLabel={t("funnelPanel.period")}
          stages={funnelStages}
          ratios={funnelRatios}
        />
      </div>

      <div className="grid items-stretch gap-3 sm:gap-4 xl:grid-cols-2">
        <TeamActivityChart
          headingId="super-agent-activity"
          title={t("activity.title")}
          description={t("activity.description")}
          seriesLabels={{ leads: t("funnel.leads"), jobs: t("funnel.jobs"), applications: t("funnel.applications") }}
          monthHeader={t("activity.month")}
          points={activityPoints}
          emptyTitle={t("activity.emptyTitle")}
          emptyDescription={t("activity.emptyDescription")}
        />
        <TopAgentsTable
          headingId="super-agent-top-agents"
          title={t("topAgents.title")}
          description={t("topAgents.description")}
          viewAllLabel={t("sections.leaderboard.viewAll")}
          // The full ranking, not the roster the Active Agents card opens.
          viewAllHref={href("/agents?sortBy=placements&sortOrder=desc")}
          agentHref={(id) => href(`/agents/${id}`)}
          columns={{
            rank: t("topAgents.rank"),
            agent: t("topAgents.agent"),
            leads: t("funnel.leads"),
            jobs: t("topAgents.jobs"),
            applications: t("funnel.applications"),
            placements: t("funnel.placements"),
          }}
          rows={data.topAgents}
          emptyTitle={t("leaderboard.emptyTitle")}
          emptyDescription={t("leaderboard.emptyDescription")}
        />
      </div>
    </div>
  );
}
