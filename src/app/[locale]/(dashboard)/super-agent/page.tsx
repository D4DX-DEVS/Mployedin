import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Lead from "@/models/Lead";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Briefcase,
  DollarSign,
  ShieldCheck,
  Target,
  Users2,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { DashboardNextAction, DashboardSignalStrip } from "@/components/shared/DashboardOverview";

export default async function SuperAgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superAgentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  // Load live data
  const saProfile = await SuperAgent.findOne({ userId: session.user.id })
    .select("agentIds assignedCityIds assignedStateIds commissions overrideRate currencyCode")
    .lean();

  const agentDocIds = saProfile?.agentIds ?? [];
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId assignedEmployerIds performance")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

  const activeAgents = await User.countDocuments({
    _id: { $in: agentUserIds },
    isActive: true,
  });

  const allEmployerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);
  const uniqueEmployerIds = [...new Set(allEmployerIds.map(String))];
  const totalEmployers = uniqueEmployerIds.length;

  const jobFilter: Record<string, unknown> = {
    $or: [
      { agentId: { $in: agentDocIds } },
      ...(uniqueEmployerIds.length > 0
        ? [{ employerId: { $in: uniqueEmployerIds } }]
        : []),
    ],
  };
  const [totalJobs, activeJobs] = await Promise.all([
    Job.countDocuments(jobFilter),
    Job.countDocuments({ ...jobFilter, status: "active" }),
  ]);

  const jobIds = await Job.find(jobFilter).select("_id").lean();
  const jobIdList = jobIds.map((j) => j._id);
  const totalApplications = jobIdList.length > 0
    ? await Application.countDocuments({ jobId: { $in: jobIdList } })
    : 0;

  // Lead.agentId and Placement.agentId reference the Agent doc _id (not User id),
  // and Placement.superAgentId references the SuperAgent doc _id.
  const saProfileId = (saProfile as { _id?: unknown } | null)?._id;
  const totalPlacements = await Placement.countDocuments({
    $or: [
      { agentId: { $in: agentDocIds } },
      ...(saProfileId ? [{ superAgentId: saProfileId }] : []),
    ],
  });

  const totalLeads = await Lead.countDocuments({
    agentId: { $in: agentDocIds },
  });

  // Resolve agent display names for the team leaderboard.
  const agentUsers = await User.find({ _id: { $in: agentUserIds } })
    .select("name email")
    .lean();
  const agentNameMap = new Map(
    agentUsers.map((u) => [String(u._id), (u.name as string) || (u.email as string) || "Agent"]),
  );

  interface LeaderboardRow {
    agentId: string;
    name: string;
    placements: number;
    leads: number;
    jobs: number;
    employers: number;
  }
  const leaderboard: LeaderboardRow[] = agentDocs
    .map((a) => {
      const perf = (a.performance ?? {}) as Record<string, number>;
      return {
        agentId: String(a._id),
        name: agentNameMap.get(String(a.userId)) ?? "Agent",
        placements: perf.placementsCompleted ?? 0,
        leads: perf.leadsGenerated ?? 0,
        jobs: perf.vacanciesPosted ?? 0,
        employers: perf.employersCreated ?? 0,
      };
    })
    .sort((a, b) => b.placements - a.placements || b.leads - a.leads)
    .slice(0, 3);

  // Conversion funnel — Leads → Employers → Jobs → CVs → Placements.
  const funnel = [
    { key: "leads", label: t("funnel.leads"), value: totalLeads },
    { key: "employers", label: t("funnel.employers"), value: totalEmployers },
    { key: "jobs", label: t("funnel.jobs"), value: totalJobs },
    { key: "applications", label: t("funnel.applications"), value: totalApplications },
    { key: "placements", label: t("funnel.placements"), value: totalPlacements },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const totalAgents = agentUserIds.length;
  const placementRate = totalApplications > 0
    ? Math.round((totalPlacements / totalApplications) * 100)
    : null;

  // Step-over-step conversion; raw counts alone never showed where the region stalls.
  const funnelRows = funnel.map((stage, index) => {
    const previous = index > 0 ? funnel[index - 1].value : 0;
    return {
      ...stage,
      width: stage.value > 0 ? Math.max(3, Math.round((stage.value / funnelMax) * 100)) : 0,
      conversion: index === 0 || previous === 0 ? null : Math.round((stage.value / previous) * 100),
    };
  });

  const actions = [
    { label: t("actions.jobOversight.label"), href: `/${locale}/super-agent/jobs`, icon: CheckCircle2 },
    { label: t("actions.agentPerformance.label"), href: `/${locale}/super-agent/agents`, icon: Users2 },
    { label: t("actions.leadPipeline.label"), href: `/${locale}/super-agent/leads`, icon: Target },
    { label: t("actions.commissionReport.label"), href: `/${locale}/super-agent/commissions`, icon: DollarSign },
  ];

  const inactiveAgents = Math.max(0, totalAgents - activeAgents);
  const nextAction = inactiveAgents > 0
    ? { title: t("actions.agentPerformance.label"), description: t("actions.agentPerformance.description"), href: `/${locale}/super-agent/agents`, icon: Users2, badge: t("taskFirst.attention") }
    : totalLeads > totalEmployers
      ? { title: t("actions.leadPipeline.label"), description: t("actions.leadPipeline.description"), href: `/${locale}/super-agent/leads`, icon: Target, badge: t("taskFirst.followUp") }
      : { title: t("actions.jobOversight.label"), description: t("taskFirst.jobOversightDescription"), href: `/${locale}/super-agent/jobs`, icon: CheckCircle2, badge: t("taskFirst.review") };

  const signals = [
    { label: t("kpis.activeAgents.label"), value: activeAgents, href: `/${locale}/super-agent/agents`, icon: Users2 },
    { label: t("kpis.totalEmployers.label"), value: totalEmployers, href: `/${locale}/super-agent/employers`, icon: Building2 },
    { label: t("kpis.totalJobs.label"), value: activeJobs, href: `/${locale}/super-agent/jobs`, icon: Briefcase },
    { label: t("kpis.totalPlacements.label"), value: totalPlacements, href: `/${locale}/super-agent/placements`, icon: ShieldCheck },
  ];

  return (
    <div className="page-container dashboard-overview-page">
      <DashboardPageHeader
        icon={ShieldCheck}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
      />

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

      <DashboardSignalStrip headingId="super-agent-signals" title={t("taskFirst.atAGlance")} signals={signals} />

      <section className="order-2 workspace-panel-surface overflow-hidden rounded-2xl lg:order-1">
        <div className="panel-head justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.funnel.eyebrow")}</h2>
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("funnel.placementRate")}</span>
            <span className="text-base font-semibold text-primary">
              {placementRate === null ? "—" : `${placementRate}%`}
            </span>
            {placementRate === null ? (
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{t("funnel.noApplicationData")}</span>
            ) : totalPlacements === 0 && (
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{t("funnel.noPlacements")}</span>
            )}
          </div>
        </div>

        <div className="panel-body">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            {t("sections.funnel.description")} {t("funnel.ratioExplanation")}
          </p>
          {funnelRows.map((stage, index) => (
            <div key={stage.key} className="flex h-9 items-center gap-3">
              <div className="w-24 shrink-0 truncate text-xs font-medium text-muted-foreground sm:w-32 sm:text-sm">{stage.label}</div>
              <div className="relative h-[22px] flex-1 overflow-hidden rounded-lg bg-secondary/60">
                <div
                  className="h-full rounded-lg bg-gradient-to-r from-sky-500/80 to-indigo-500/80"
                  style={{ width: `${stage.width}%` }}
                />
              </div>
              <div className="w-10 shrink-0 text-end text-sm font-semibold tabular-nums text-foreground">{stage.value}</div>
              <div
                className={`w-12 shrink-0 text-end text-xs font-semibold tabular-nums ${
                  stage.conversion === null
                    ? "text-muted-foreground/60"
                    : stage.conversion >= 100
                      ? "text-emerald-600 dark:text-emerald-400"
                      : stage.conversion >= 50
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400"
                }`}
                title={stage.conversion === null
                  ? t("funnel.ratioUnavailable")
                  : t("funnel.ratioValue", {
                      value: stage.conversion,
                      current: stage.label,
                      previous: funnel[index - 1]?.label ?? "",
                    })}
              >
                {stage.conversion === null ? "—" : `${stage.conversion}%`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Both panels stretch to the taller one — the action tiles grow with auto-rows-fr
          instead of leaving a ragged gap under Quick actions. */}
      <section className="panel-grid order-1 lg:order-2 xl:grid-cols-2">
        <div className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="panel-head">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.quickActions.eyebrow")}</h2>
          </div>
          <div className="panel-body flex-1">
            <div className="panel-grid h-full auto-rows-fr sm:grid-cols-2">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="workspace-subtle-surface group flex min-h-[56px] items-center gap-3 rounded-xl px-4 transition-all hover:border-primary/25 hover:bg-card"
                  >
                    <span className="workspace-tone-sky flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{action.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="panel-head justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.leaderboard.title")}</h2>
            <Link
              href={`/${locale}/super-agent/agents`}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/85"
            >
              {t("sections.leaderboard.viewAll")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {leaderboard.length > 0 ? (
            <div className="panel-body flex flex-1 flex-col justify-center divide-y divide-border/60 py-0">
              {leaderboard.map((row, index) => (
                <div key={row.agentId} className="flex items-center gap-3 py-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    index === 0
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-200"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("leaderboard.summary", { leads: row.leads, jobs: row.jobs })}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <span className="text-base font-semibold tabular-nums text-foreground">{row.placements}</span>
                    <span className="ms-1 text-[11px] text-muted-foreground">{t("leaderboard.placements")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-body flex-1">
              <div className="workspace-empty-state flex h-full flex-col items-center justify-center rounded-xl p-4 text-center">
                <p className="text-sm font-medium text-foreground">{t("leaderboard.emptyTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("leaderboard.emptyDescription")}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
