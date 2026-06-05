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
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Target,
  Users2,
} from "lucide-react";

export default async function SuperAgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
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

  const totalPlacements = await Placement.countDocuments({
    $or: [
      { agentId: { $in: agentUserIds } },
      { superAgentId: session.user.id },
    ],
  });

  const totalLeads = await Lead.countDocuments({
    agentId: { $in: agentUserIds },
  });

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

  const secondaryKpis = [
    { label: t("secondary.jobsPosted"), value: totalJobs, sub: t("secondary.active", { count: activeJobs }) },
    { label: t("secondary.cvsReceived"), value: totalApplications, sub: t("secondary.totalApplications") },
    { label: t("secondary.leadsGenerated"), value: totalLeads, sub: t("secondary.acrossAgents") },
  ];
  const actions = [
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
      label: t("actions.jobApprovals.label"),
      description: t("actions.jobApprovals.description"),
      href: `/${locale}/super-agent/approvals`,
      icon: CheckCircle2,
    },
    {
      label: t("actions.commissionReport.label"),
      description: t("actions.commissionReport.description"),
      href: `/${locale}/super-agent/commissions`,
      icon: DollarSign,
    },
  ];

  const focusAreas = [
    {
      title: t("focus.teamCoordination.title"),
      description: t("focus.teamCoordination.description"),
      icon: Users2,
    },
    {
      title: t("focus.approvalControl.title"),
      description: t("focus.approvalControl.description"),
      icon: CheckCircle2,
    },
    {
      title: t("focus.regionalGrowth.title"),
      description: t("focus.regionalGrowth.description"),
      icon: Building2,
    },
  ];

  return (
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hero.eyebrow")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("hero.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("hero.description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
            <div className="workspace-glass-panel rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("control.lanesEyebrow")}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{t("control.teamOversight")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("control.teamOversightDesc")}</p>
            </div>
            <div className="workspace-glass-panel rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("control.rhythmEyebrow")}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{t("control.dailyReview")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("control.dailyReviewDesc")}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <div key={kpi.label} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kpi.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{kpi.value}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{kpi.helper}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${kpi.iconClassName}`}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={2.25} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {secondaryKpis.map((sk) => (
            <div key={sk.label} className="workspace-glass-panel rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{sk.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{sk.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sk.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.quickActions.eyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sections.quickActions.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("sections.quickActions.description")}</p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="workspace-subtle-surface group rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="workspace-tone-sky rounded-2xl p-2.5">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{action.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.oversight.eyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sections.oversight.title")}</h2>
          <div className="mt-5 space-y-3">
            {focusAreas.map((area) => {
              const Icon = area.icon;

              return (
                <div key={area.title} className="workspace-subtle-surface rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="workspace-muted-pill rounded-2xl p-2.5">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{area.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{area.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
