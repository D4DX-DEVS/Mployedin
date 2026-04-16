import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CircleDollarSign,
  Sparkles,
  Target,
  UserRoundSearch,
  Users,
} from "lucide-react";

export default async function AgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
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
    const jobDocs = await Job.find({
      $or: [
        { agentId },
        ...(agentDoc?.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    })
      .select("_id title status")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    activeJobs = jobDocs.filter((j) => j.status === "active").length;

    const allJobIds = jobDocs.map((j) => j._id);
    if (allJobIds.length > 0) {
      const perJobCounts = await Application.aggregate([
        { $match: { jobId: { $in: allJobIds } } },
        {
          $group: {
            _id: { jobId: "$jobId", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]);

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
      jobMetrics = jobDocs
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
        .slice(0, 10);
    }
  }

  const kpis = [
    { label: "Active Employers", value: employerCount },
    { label: "Active Jobs", value: activeJobs },
    { label: "Total Applications", value: totalApps },
    { label: "Placements", value: (perf as Record<string, number>).placementsCompleted ?? 0 },
  ];

  const funnel = [
    { label: "Leads Generated", value: (perf as Record<string, number>).leadsGenerated ?? 0 },
    { label: "Employers Created", value: (perf as Record<string, number>).employersCreated ?? 0 },
    { label: "Vacancies Posted", value: (perf as Record<string, number>).vacanciesPosted ?? 0 },
    { label: "Interview Rate", value: `${interviewRate}%` },
    { label: "Offer Rate", value: `${offerRate}%` },
    { label: "Placements", value: (perf as Record<string, number>).placementsCompleted ?? 0 },
  ];

  const actions = [
    {
      label: "Add Employer Lead",
      href: `/${locale}/agent/leads/new`,
      note: "Capture new accounts and keep the pipeline moving.",
      icon: Target,
      tone: "workspace-tone-amber",
    },
    {
      label: "Post a Job",
      href: `/${locale}/agent/jobs/new`,
      note: "Launch a role for one of your assigned employers.",
      icon: BriefcaseBusiness,
      tone: "workspace-tone-sky",
    },
    {
      label: "My Jobs",
      href: `/${locale}/agent/jobs`,
      note: "Review active, draft, and closed postings in one view.",
      icon: BarChart3,
      tone: "workspace-tone-indigo",
    },
    {
      label: "Candidates",
      href: `/${locale}/agent/candidates`,
      note: "Move shortlists, interviews, and offers forward.",
      icon: Users,
      tone: "workspace-tone-emerald",
    },
    {
      label: "View Job Seekers",
      href: `/${locale}/agent/job-seekers`,
      note: "Search profiles, match talent, and follow up faster.",
      icon: UserRoundSearch,
      tone: "workspace-tone-violet",
    },
    {
      label: "Performance Report",
      href: `/${locale}/agent/reports`,
      note: "Track conversion quality, response rates, and wins.",
      icon: CircleDollarSign,
      tone: "workspace-tone-rose",
    },
  ];

  const heroStats = [
    {
      label: "Active employers",
      value: employerCount,
      description: "Accounts currently assigned to you.",
      icon: Building2,
      tone: "workspace-tone-sky",
    },
    {
      label: "Active jobs",
      value: activeJobs,
      description: "Live roles you can progress today.",
      icon: BriefcaseBusiness,
      tone: "workspace-tone-emerald",
    },
    {
      label: "Applications",
      value: totalApps,
      description: "Total candidate demand across managed roles.",
      icon: Users,
      tone: "workspace-tone-indigo",
    },
    {
      label: "Placements",
      value: (perf as Record<string, number>).placementsCompleted ?? 0,
      description: "Confirmed hires completed from your book.",
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

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Agent Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Stay on top of assigned employers, active roles, and candidate momentum from the same modern workspace now used across hiring.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{employerCount} active accounts</p>
            <p className="text-xs text-muted-foreground">
              {activeJobs} live roles, {totalApps} applications, and {kpis[3]?.value ?? 0} completed placements in your current book.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {heroStats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div key={stat.label} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                  <div className={`rounded-2xl p-2.5 ${stat.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conversion funnel</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Track which parts of the desk need attention</h2>
            </div>
            <div className="workspace-subtle-surface rounded-2xl px-3 py-2 text-right text-primary">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Offer rate</p>
              <p className="mt-1 text-lg font-semibold">{offerRate}%</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {funnel.map((item) => (
              <div key={item.label} className="workspace-subtle-surface rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick actions</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Jump into the work most agents do every day</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each shortcut keeps the underlying route and permissions unchanged.</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="workspace-subtle-surface group rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`rounded-2xl p-2.5 ${action.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/55 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{action.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{action.note}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role performance</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">See where jobs are converting and where they stall</h2>
            <p className="mt-1 text-sm text-muted-foreground">Top managed roles ranked by demand, interview flow, and offer conversion.</p>
          </div>
          <Link
            href={`/${locale}/agent/jobs`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/85"
          >
            Review all jobs
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {jobMetrics.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 pr-4 font-semibold text-muted-foreground">Job</th>
                  <th className="pb-3 pr-4 font-semibold text-muted-foreground">Status</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">Applications</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">Interviews</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">Offers</th>
                  <th className="pb-3 pr-4 text-right font-semibold text-muted-foreground">Interview rate</th>
                  <th className="pb-3 text-right font-semibold text-muted-foreground">Offer rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {jobMetrics.map((row) => (
                  <tr key={row.jobId} className="transition-colors hover:bg-secondary/70">
                    <td className="py-4 pr-4">
                      <Link href={`/${locale}/agent/jobs/${row.jobId}`} className="font-semibold text-foreground transition-colors hover:text-primary">
                        {row.title}
                      </Link>
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getJobStatusClasses(row.status)}`}>
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-right font-medium tabular-nums text-foreground/80">{row.applications}</td>
                    <td className="py-4 pr-4 text-right font-medium tabular-nums text-foreground/80">{row.interviews}</td>
                    <td className="py-4 pr-4 text-right font-medium tabular-nums text-foreground/80">{row.offers}</td>
                    <td className="py-4 pr-4 text-right font-semibold tabular-nums text-primary">{row.interviewRate}%</td>
                    <td className="py-4 text-right font-semibold tabular-nums text-emerald-600">{row.offerRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-empty-state mt-5 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-foreground">No job performance data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Post a role or start receiving applications to unlock per-job conversion metrics here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
