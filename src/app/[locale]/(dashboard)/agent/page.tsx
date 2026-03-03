import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function AgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  const kpis = ["Active Employers", "Job Seekers", "Open Leads", "Placements"];
  const actions = [
    { label: "Add Employer Lead", href: `/${locale}/agent/leads/new` },
    { label: "Post a Job", href: `/${locale}/agent/jobs/new` },
    { label: "View Job Seekers", href: `/${locale}/agent/job-seekers` },
    { label: "Performance Report", href: `/${locale}/agent/reports` },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Agent Dashboard" description="Manage your leads, employers, and job seekers" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((label) => (
          <div key={label} className="card-base">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-bold text-primary">—</p>
          </div>
        ))}
      </div>
      <div className="card-base">
        <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
