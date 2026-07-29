import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Lead from "@/models/Lead";
import { formatCurrency } from "@/lib/currency";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ShieldCheck,
  Target,
  Users2,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
  const [totalJobs, activeJobs, pendingApprovals] = await Promise.all([
    Job.countDocuments(jobFilter),
    Job.countDocuments({ ...jobFilter, status: "active" }),
    Job.countDocuments({ ...jobFilter, "poster.approvalStatus": "pending" }),
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

  const commissions = saProfile?.commissions ?? { total: 0, pending: 0, paid: 0 };
  const currencyCode = saProfile?.currencyCode ?? "AED";

  const kpis = [
    {
      label: t("kpis.activeAgents.label"),
      value: String(activeAgents),
      helper: t("kpis.activeAgents.helper"),
      icon: Users2,
      iconClassName: "border border-emerald-200 bg-emerald-100 text-emerald-700 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/70 dark:text-emerald-200",
    },
    {
      label: t("kpis.totalEmployers.label"),
      value: String(totalEmployers),
      helper: t("kpis.totalEmployers.helper"),
      icon: Building2,
      iconClassName: "border border-sky-200 bg-sky-100 text-sky-700 shadow-sm dark:border-sky-800/70 dark:bg-sky-950/70 dark:text-sky-200",
    },
    {
      label: t("kpis.totalPlacements.label"),
      value: String(totalPlacements),
      helper: t("kpis.totalPlacements.helper"),
      icon: ShieldCheck,
      iconClassName: "border border-indigo-200 bg-indigo-100 text-indigo-700 shadow-sm dark:border-indigo-800/70 dark:bg-indigo-950/70 dark:text-indigo-200",
    },
    {
      label: t("kpis.commissionsEarned.label"),
      value: commissions.total > 0 ? formatCurrency(commissions.total, currencyCode) : formatCurrency(0, currencyCode),
      helper: t("kpis.commissionsEarned.helper"),
      icon: DollarSign,
      iconClassName: "border border-amber-200 bg-amber-100 text-amber-700 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/70 dark:text-amber-200",
    },
  ];

  const actions = [
    {
      label: t("actions.jobApprovals.label"),
      description: t("actions.jobApprovals.description"),
      href: `/${locale}/super-agent/approvals`,
      icon: CheckCircle2,
    },
    {
      label: t("actions.agentPerformance.label"),
      description: t("actions.agentPerformance.description"),
      href: `/${locale}/super-agent/agents`,
      icon: Users2,
    },
    {
      label: t("actions.leadPipeline.label"),
      description: t("actions.leadPipeline.description"),
      href: `/${locale}/super-agent/leads`,
      icon: Target,
    },
    {
      label: t("actions.commissionReport.label"),
      description: t("actions.commissionReport.description"),
      href: `/${locale}/super-agent/commissions`,
      icon: DollarSign,
    },
  ];

  const placementRate = totalApplications > 0
    ? Math.round((totalPlacements / totalApplications) * 100)
    : 0;

  return (
    <div className="page-container space-y-6">
      <DashboardPageHeader
        icon={ShieldCheck}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        summary={{ label: t("control.lanesEyebrow"), value: t("control.teamOversight"), note: t("control.teamOversightDesc") }}
        metrics={kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, note: kpi.helper, icon: kpi.icon }))}
      />

      {pendingApprovals > 0 && (
        <Link
          href={`/${locale}/super-agent/approvals`}
          className="group flex items-center justify-between gap-4 rounded-[24px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.98))] p-5 shadow-[0_24px_60px_-44px_rgba(245,158,11,0.18)] transition-all hover:-translate-y-0.5 dark:border-amber-500/25 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))]"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-amber-500 p-3 text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("approvals.title", { count: pendingApprovals })}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("approvals.description")}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200">
            {t("approvals.action")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      <section className="order-2 workspace-panel-surface rounded-2xl p-4 sm:p-5 lg:order-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.funnel.eyebrow")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sections.funnel.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("sections.funnel.description")}</p>
          </div>
          <div className="workspace-subtle-surface rounded-2xl px-3 py-2 text-right text-primary">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("funnel.placementRate")}</p>
            <p className="mt-1 text-lg font-semibold">{placementRate}%</p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {funnel.map((stage) => (
            <div key={stage.key} className="flex items-center gap-4">
              <div className="w-32 shrink-0 text-sm font-medium text-muted-foreground">{stage.label}</div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-xl bg-secondary/60">
                <div
                  className="flex h-full items-center justify-end rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-3 text-xs font-semibold text-white transition-all"
                  style={{ width: `${Math.max(8, Math.round((stage.value / funnelMax) * 100))}%` }}
                >
                  {stage.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="order-1 grid items-start gap-4 lg:order-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="workspace-panel-surface rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.quickActions.eyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sections.quickActions.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("sections.quickActions.description")}</p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="workspace-subtle-surface group relative flex min-h-[96px] flex-col items-start gap-2 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)] sm:min-h-[76px] sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="workspace-tone-sky shrink-0 rounded-xl p-2.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="pe-5 text-xs font-semibold leading-5 text-foreground sm:truncate sm:pe-0 sm:text-sm">{action.label}</h3>
                    <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:line-clamp-1">{action.description}</p>
                  </div>
                  <ArrowRight className="absolute end-3 top-3 h-4 w-4 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:static" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="workspace-panel-surface rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.leaderboard.eyebrow")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sections.leaderboard.title")}</h2>
            </div>
            <Link
              href={`/${locale}/super-agent/agents`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/85"
            >
              {t("sections.leaderboard.viewAll")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {leaderboard.length > 0 ? (
            <div className="mt-4 space-y-2">
              {leaderboard.map((row, index) => (
                <div key={row.agentId} className="workspace-subtle-surface flex items-center gap-3 rounded-xl p-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    index === 0
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-200"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("leaderboard.summary", { leads: row.leads, jobs: row.jobs })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{row.placements}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("leaderboard.placements")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-empty-state mt-5 rounded-2xl p-6 text-center">
              <p className="text-sm font-medium text-foreground">{t("leaderboard.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("leaderboard.emptyDescription")}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
