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

  if (agentId) {
    const jobIds = await Job.find({
      $or: [
        { agentId },
        ...(agentDoc?.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    })
      .select("_id status")
      .lean();

    activeJobs = jobIds.filter((j) => j.status === "active").length;

    const allJobIds = jobIds.map((j) => j._id);
    if (allJobIds.length > 0) {
      const statusCounts = await Application.aggregate([
        { $match: { jobId: { $in: allJobIds } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      const countMap: Record<string, number> = {};
      statusCounts.forEach((s: { _id: string; count: number }) => {
        countMap[s._id] = s.count;
      });

      totalApps =
        Object.values(countMap).reduce((a: number, b: number) => a + b, 0);
      const interviews =
        (countMap["interview_scheduled"] ?? 0) +
        (countMap["selected"] ?? 0) +
        (countMap["offer"] ?? 0) +
        (countMap["hired"] ?? 0);
      const offers =
        (countMap["offer"] ?? 0) + (countMap["hired"] ?? 0);

      interviewRate = totalApps > 0 ? Math.round((interviews / totalApps) * 100) : 0;
      offerRate = totalApps > 0 ? Math.round((offers / totalApps) * 100) : 0;
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
