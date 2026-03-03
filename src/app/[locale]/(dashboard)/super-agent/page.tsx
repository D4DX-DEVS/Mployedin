import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function SuperAgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  const kpis = ["Region Coverage", "Active Agents", "Total Placements", "Commissions Earned"];
  const actions = [
    { label: "Agent Performance", href: `/${locale}/super-agent/agents` },
    { label: "Lead Pipeline", href: `/${locale}/super-agent/leads` },
    { label: "Job Approvals", href: `/${locale}/super-agent/approvals` },
    { label: "Commission Report", href: `/${locale}/super-agent/commissions` },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Super Agent Dashboard" description="Region overview and team performance" />
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
