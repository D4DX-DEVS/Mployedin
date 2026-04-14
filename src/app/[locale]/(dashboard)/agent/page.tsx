import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";

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
    { label: "Add Employer Lead", href: `/${locale}/agent/leads/new` },
    { label: "Post a Job", href: `/${locale}/agent/jobs/new` },
    { label: "My Jobs", href: `/${locale}/agent/jobs` },
    { label: "Candidates", href: `/${locale}/agent/candidates` },
    { label: "View Job Seekers", href: `/${locale}/agent/job-seekers` },
    { label: "Performance Report", href: `/${locale}/agent/reports` },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Agent Dashboard" description="Manage your leads, employers, and job seekers" />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card-base">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="mt-2 text-3xl font-bold text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Conversion Funnel */}
      <div className="card-base">
        <h2 className="text-sm font-semibold mb-4">Conversion Funnel</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {funnel.map((f, i) => (
            <div key={f.label} className="text-center p-3 rounded-lg border border-border/50 bg-muted/10">
              <p className="text-2xl font-bold text-primary">{f.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{f.label}</p>
              {i < funnel.length - 1 && (
                <span className="hidden lg:inline-block absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground/30">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-Job Metrics */}
      {jobMetrics.length > 0 && (
        <div className="card-base">
          <h2 className="text-sm font-semibold mb-4">Job Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Job Title</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Apps</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Interviews</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Offers</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Int. Rate</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Offer Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {jobMetrics.map((row) => (
                  <tr key={row.jobId} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-4 font-medium truncate max-w-[200px]">
                      <Link href={`/${locale}/agent/jobs/${row.jobId}`} className="hover:text-primary transition-colors">
                        {row.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        row.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : row.status === "draft"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{row.applications}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{row.interviews}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{row.offers}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-blue-600 dark:text-blue-400">{row.interviewRate}%</td>
                    <td className="py-2.5 text-right tabular-nums text-green-600 dark:text-green-400">{row.offerRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card-base">
        <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {actions.map((a) => (
            <Link key={a.href} href={a.href}
              className="block p-4 rounded-xl border text-center text-sm font-medium hover:border-primary/50 hover:bg-primary/5 transition-all">
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
