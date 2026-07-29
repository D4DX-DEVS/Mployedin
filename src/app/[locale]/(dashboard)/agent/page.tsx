import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CircleDollarSign,
  Target,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

export default async function AgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("agentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  // Load agent metrics
  const agentDoc = await Agent.findOne({ userId: session.user.id })
    .select("_id assignedEmployerIds performance")
    .lean();

  const agentId = agentDoc?._id;
  const employerCount = agentDoc?.assignedEmployerIds?.length ?? 0;
  const perf = agentDoc?.performance ?? {};

  // Job stats
  let activeJobs = 0;
  let totalApps = 0;
  let interviewRate = 0;
  let offerRate = 0;

  interface JobMetricRow {
    jobId: string;
    title: string;
    status: string;
    applications: number;
    interviews: number;
    offers: number;
    interviewRate: number;
    offerRate: number;
  }
  let jobMetrics: JobMetricRow[] = [];

  if (agentId) {
    // Portfolio scope: jobs owned directly or via assigned employers.
    const jobFilter = {
      $or: [
        { agentId },
        ...(agentDoc?.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    };

    // Portfolio-wide active count (not limited to the displayed rows).
    activeJobs = await Job.countDocuments({ ...jobFilter, status: "active" });

    // Per-job status counts across the ENTIRE portfolio for accurate totals
    // and rates, joined to job titles/statuses for the displayed top rows.
    const [perJobCounts, recentJobDocs] = await Promise.all([
      Application.aggregate([
        {
          $lookup: {
            from: "jobs",
            localField: "jobId",
            foreignField: "_id",
            as: "job",
            pipeline: [{ $match: jobFilter }, { $project: { _id: 1 } }],
          },
        },
        { $match: { "job.0": { $exists: true } } },
        {
          $group: {
            _id: { jobId: "$jobId", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]),
      Job.find(jobFilter)
        .select("_id title status")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    {
      // Build per-job map
      const jobMap = new Map<string, Record<string, number>>();
      perJobCounts.forEach((r: { _id: { jobId: unknown; status: string }; count: number }) => {
        const jid = String(r._id.jobId);
        if (!jobMap.has(jid)) jobMap.set(jid, {});
        jobMap.get(jid)![r._id.status] = r.count;
      });

      // Aggregate totals
      let totalInterviews = 0;
      let totalOffers = 0;
      jobMap.forEach((counts) => {
        totalApps += Object.values(counts).reduce((a, b) => a + b, 0);
        totalInterviews +=
          (counts["interview_scheduled"] ?? 0) +
          (counts["selected"] ?? 0) +
          (counts["offer"] ?? 0) +
          (counts["hired"] ?? 0);
        totalOffers += (counts["offer"] ?? 0) + (counts["hired"] ?? 0);
      });

      interviewRate = totalApps > 0 ? Math.round((totalInterviews / totalApps) * 100) : 0;
      offerRate = totalApps > 0 ? Math.round((totalOffers / totalApps) * 100) : 0;

      // Build per-job metrics rows (top 10 by application count)
      jobMetrics = recentJobDocs
        .map((j) => {
          const counts = jobMap.get(String(j._id)) ?? {};
          const apps = Object.values(counts).reduce((a, b) => a + b, 0);
          const intvs =
            (counts["interview_scheduled"] ?? 0) +
            (counts["selected"] ?? 0) +
            (counts["offer"] ?? 0) +
            (counts["hired"] ?? 0);
          const offs = (counts["offer"] ?? 0) + (counts["hired"] ?? 0);
          return {
            jobId: String(j._id),
            title: j.title as string,
            status: j.status as string,
            applications: apps,
            interviews: intvs,
            offers: offs,
            interviewRate: apps > 0 ? Math.round((intvs / apps) * 100) : 0,
            offerRate: apps > 0 ? Math.round((offs / apps) * 100) : 0,
          };
        })
        .sort((a, b) => b.applications - a.applications)
        .slice(0, 4);
    }
  }

  const kpis = [
    { label: t("kpis.activeEmployers"), value: employerCount },
    { label: t("kpis.activeJobs"), value: activeJobs },
    { label: t("kpis.totalApplications"), value: totalApps },
    { label: t("kpis.placements"), value: (perf as Record<string, number>).placementsCompleted ?? 0 },
  ];

  const funnel = [
    { label: t("funnel.leadsGenerated"), value: (perf as Record<string, number>).leadsGenerated ?? 0 },
    { label: t("funnel.employersCreated"), value: (perf as Record<string, number>).employersCreated ?? 0 },
    { label: t("funnel.vacanciesPosted"), value: (perf as Record<string, number>).vacanciesPosted ?? 0 },
    { label: t("funnel.interviewRate"), value: `${interviewRate}%` },
    { label: t("funnel.offerRate"), value: `${offerRate}%` },
    { label: t("kpis.placements"), value: (perf as Record<string, number>).placementsCompleted ?? 0 },
  ];

  const actions = [
    {
      label: t("actions.addEmployerLead.label"),
      href: `/${locale}/agent/leads/new`,
      note: t("actions.addEmployerLead.note"),
      icon: Target,
      tone: "workspace-tone-amber",
    },
    {
      label: t("actions.postJob.label"),
      href: `/${locale}/agent/jobs/new`,
      note: t("actions.postJob.note"),
      icon: BriefcaseBusiness,
      tone: "workspace-tone-sky",
    },
    {
      label: t("actions.myJobs.label"),
      href: `/${locale}/agent/jobs`,
      note: t("actions.myJobs.note"),
      icon: BarChart3,
      tone: "workspace-tone-indigo",
    },
    {
      label: t("actions.candidates.label"),
      href: `/${locale}/agent/candidates`,
      note: t("actions.candidates.note"),
      icon: Users,
      tone: "workspace-tone-emerald",
    },
    {
      label: t("actions.jobSeekers.label"),
      href: `/${locale}/agent/job-seekers`,
      note: t("actions.jobSeekers.note"),
      icon: UserRoundSearch,
      tone: "workspace-tone-violet",
    },
    {
      label: t("actions.performanceReport.label"),
      href: `/${locale}/agent/reports`,
      note: t("actions.performanceReport.note"),
      icon: CircleDollarSign,
      tone: "workspace-tone-rose",
    },
  ];

  const heroStats = [
    {
      label: t("heroStats.activeEmployers.label"),
      value: employerCount,
      description: t("heroStats.activeEmployers.description"),
      icon: Building2,
      tone: "workspace-tone-sky",
    },
    {
      label: t("heroStats.activeJobs.label"),
      value: activeJobs,
      description: t("heroStats.activeJobs.description"),
      icon: BriefcaseBusiness,
      tone: "workspace-tone-emerald",
    },
    {
      label: t("heroStats.applications.label"),
      value: totalApps,
      description: t("heroStats.applications.description"),
      icon: Users,
      tone: "workspace-tone-indigo",
    },
    {
      label: t("heroStats.placements.label"),
      value: (perf as Record<string, number>).placementsCompleted ?? 0,
      description: t("heroStats.placements.description"),
      icon: CalendarCheck2,
      tone: "workspace-tone-amber",
    },
  ];

  function getJobStatusClasses(status: string): string {
    switch (status) {
      case "active":
        return "status-active";
      case "draft":
        return "status-draft";
      case "closed":
        return "status-closed";
      case "expired":
        return "status-expired";
      default:
        return "status-draft";
    }
  }

  function getJobStatusLabel(status: string): string {
    switch (status) {
      case "active":
        return t("statuses.active");
      case "draft":
        return t("statuses.draft");
      case "closed":
        return t("statuses.closed");
      case "expired":
        return t("statuses.expired");
      default:
        return t("statuses.unknown");
    }
  }

  return (
    <div className="page-container space-y-3 sm:space-y-6">
      <DashboardPageHeader
        icon={Target}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        summary={{
          label: t("portfolio.eyebrow"),
          value: t("portfolio.activeAccounts", { count: employerCount }),
          note: t("portfolio.summary", { jobs: activeJobs, applications: totalApps, placements: kpis[3]?.value ?? 0 }),
        }}
        metrics={heroStats.map((stat) => ({
          label: stat.label,
          value: stat.value,
          note: stat.description,
          icon: stat.icon,
          iconClassName: "text-primary",
          iconSurfaceClassName: "bg-primary/10",
        }))}
      />

      <div className="grid items-start gap-2.5 sm:gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <section className="order-2 workspace-panel-surface rounded-2xl p-3.5 sm:p-4 xl:order-1">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.funnel.eyebrow")}</p>
              <h2 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("sections.funnel.title")}</h2>
            </div>
            <div className="workspace-subtle-surface rounded-2xl px-3 py-2 text-right text-primary">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("funnel.offerRate")}</p>
              <p className="mt-1 text-lg font-semibold">{offerRate}%</p>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-3">
            {funnel.map((item) => (
              <div key={item.label} className="workspace-subtle-surface rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-1.5 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="order-1 workspace-panel-surface rounded-2xl p-3.5 sm:p-4 xl:order-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.quickActions.eyebrow")}</p>
            <h2 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("sections.quickActions.title")}</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{t("sections.quickActions.description")}</p>
          </div>

          <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2.5">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="workspace-subtle-surface group relative flex min-h-[76px] flex-col items-start gap-1.5 rounded-xl p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)] sm:min-h-[76px] sm:flex-row sm:items-center sm:gap-3 sm:p-3"
                >
                  <div className={`shrink-0 rounded-xl p-2.5 ${action.tone}`}>
                    <Icon className="h-4 sm:h-5 w-4 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="pe-5 text-xs font-semibold leading-5 text-foreground sm:truncate sm:pe-0 sm:text-sm">{action.label}</h3>
                    <p className="mt-0.5 sm:mt-1 hidden text-xs leading-5 text-muted-foreground sm:line-clamp-1">{action.note}</p>
                  </div>
                  <ArrowRight className="absolute end-2.5 top-2.5 h-3.5 sm:h-4 w-3.5 sm:w-4 shrink-0 text-muted-foreground/55 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary sm:static sm:end-auto sm:top-auto" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="workspace-panel-surface rounded-2xl p-3.5 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.rolePerformance.eyebrow")}</p>
            <h2 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("sections.rolePerformance.title")}</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{t("sections.rolePerformance.description")}</p>
          </div>
          <Link
            href={`/${locale}/agent/jobs`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/85"
          >
            {t("sections.rolePerformance.reviewAll")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {jobMetrics.length > 0 ? (
          <div className="mt-3 sm:mt-4 overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 pr-4 font-semibold text-muted-foreground">{t("table.job")}</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">{t("table.applications")}</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">{t("table.interviews")}</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">{t("table.offers")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {jobMetrics.map((row) => (
                  <tr key={row.jobId} className="transition-colors hover:bg-secondary/70">
                    <td className="py-3 pr-4">
                      <div className="flex min-w-0 flex-col items-start gap-1.5">
                        <Link href={`/${locale}/agent/jobs/${row.jobId}`} className="font-semibold text-foreground transition-colors hover:text-primary">
                          {row.title}
                        </Link>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${getJobStatusClasses(row.status)}`}>
                          {getJobStatusLabel(row.status)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-foreground/80">{row.applications}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className="block font-medium tabular-nums text-foreground/80">{row.interviews}</span>
                      <span className="mt-1 block text-[11px] font-semibold tabular-nums text-primary">
                        {t("table.interviewRate")}: {row.interviewRate}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className="block font-medium tabular-nums text-foreground/80">{row.offers}</span>
                      <span className="mt-1 block text-[11px] font-semibold tabular-nums text-emerald-600">
                        {t("table.offerRate")}: {row.offerRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-empty-state mt-5 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
