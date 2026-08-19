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
  Briefcase,
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

  const totalAgents = agentUserIds.length;
  const placementRate = totalApplications > 0
    ? Math.round((totalPlacements / totalApplications) * 100)
    : 0;

  // Step-over-step conversion; raw counts alone never showed where the region stalls.
  const funnelRows = funnel.map((stage, index) => {
    const previous = index > 0 ? funnel[index - 1].value : 0;
    return {
      ...stage,
      width: stage.value > 0 ? Math.max(3, Math.round((stage.value / funnelMax) * 100)) : 0,
      conversion: index === 0 || previous === 0 ? null : Math.round((stage.value / previous) * 100),
    };
  });

  const kpis = [
    {
      label: t("kpis.activeAgents.label"),
      value: String(activeAgents),
      note: t("kpiNote.agents", { active: activeAgents, inactive: Math.max(0, totalAgents - activeAgents) }),
      icon: Users2,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/70 dark:text-emerald-200",
    },
    {
      label: t("kpis.totalEmployers.label"),
      value: String(totalEmployers),
      note: t("kpiNote.employers", { agents: totalAgents }),
      icon: Building2,
      tone: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/70 dark:text-sky-200",
    },
    {
      label: t("kpis.totalJobs.label"),
      value: String(totalJobs),
      note: t("kpiNote.jobs", { active: activeJobs }),
      icon: Briefcase,
      tone: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/70 dark:text-violet-200",
    },
    {
      label: t("kpis.totalPlacements.label"),
      value: String(totalPlacements),
      note: t("kpiNote.placements", { rate: placementRate }),
      icon: ShieldCheck,
      tone: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/70 dark:text-indigo-200",
    },
    {
      label: t("kpis.commissionsEarned.label"),
      value: formatCurrency(commissions.total ?? 0, currencyCode),
      note: t("kpiNote.commission", { amount: formatCurrency(commissions.pending ?? 0, currencyCode) }),
      icon: DollarSign,
      tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/70 dark:text-amber-200",
    },
  ];

  const actions = [
    { label: t("actions.jobApprovals.label"), href: `/${locale}/super-agent/approvals`, icon: CheckCircle2 },
    { label: t("actions.agentPerformance.label"), href: `/${locale}/super-agent/agents`, icon: Users2 },
    { label: t("actions.leadPipeline.label"), href: `/${locale}/super-agent/leads`, icon: Target },
    { label: t("actions.commissionReport.label"), href: `/${locale}/super-agent/commissions`, icon: DollarSign },
  ];

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={ShieldCheck}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        actions={
          <Link
            href={`/${locale}/super-agent/agents`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-secondary/60"
          >
            {t("control.teamOversight")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {/* KPI band sits outside the hero so neither block owns the whole viewport. */}
      <section className="panel-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="workspace-panel-surface rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{kpi.label}</p>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${kpi.tone}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 truncate text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">{kpi.value}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{kpi.note}</p>
            </div>
          );
        })}
      </section>

      {pendingApprovals > 0 && (
        <Link
          href={`/${locale}/super-agent/approvals`}
          className="group flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 transition-colors hover:bg-amber-50 dark:border-amber-500/25 dark:bg-amber-950/40"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <ClipboardList className="h-4 w-4" />
            </span>
            <p className="truncate text-sm font-semibold text-foreground">{t("approvals.title", { count: pendingApprovals })}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-200">
            {t("approvals.action")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      <section className="order-2 workspace-panel-surface overflow-hidden rounded-2xl lg:order-1">
        <div className="panel-head justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.funnel.eyebrow")}</h2>
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("funnel.placementRate")}</span>
            <span className="text-base font-semibold text-primary">{placementRate}%</span>
            {totalPlacements === 0 && (
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{t("funnel.noPlacements")}</span>
            )}
          </div>
        </div>

        <div className="panel-body">
          {funnelRows.map((stage) => (
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
                title={t("funnel.vsPrevious")}
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
