import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  const kpis = [
    { label: "Active Jobs", color: "text-primary" },
    { label: "Total Applications", color: "text-cyan-600" },
    { label: "Interviews Scheduled", color: "text-amber-600" },
    { label: "Placements", color: "text-emerald-600" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Employer Dashboard"
        description="Manage your job postings and review candidates"
        actions={
          <Link
            href={`/${locale}/employer/jobs/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Post a Job
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card-base">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className={`mt-2 text-3xl font-bold ${kpi.color}`}>—</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { href: `/${locale}/employer/jobs/new`, title: "Post a New Job", desc: "Create a job posting to attract candidates" },
          { href: `/${locale}/employer/applications`, title: "Review Applications", desc: "View and manage incoming applications" },
          { href: `/${locale}/employer/interviews`, title: "Schedule Interviews", desc: "Manage interviews with shortlisted candidates" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card-base block hover:border-primary/50 hover:shadow-md transition-all"
          >
            <p className="font-semibold text-sm mb-1">{a.title}</p>
            <p className="text-xs text-muted-foreground">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
