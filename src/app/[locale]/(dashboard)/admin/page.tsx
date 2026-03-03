import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { Users, Briefcase, FileText, AlertCircle, ArrowRight } from "lucide-react";

async function getAdminStats() {
  await connectDB();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, newUsersThisMonth, activeJobs, pendingApprovals, totalApplications, applicationsThisMonth, usersByRole] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Job.countDocuments({ status: "active" }),
      Job.countDocuments({ approvalStatus: "pending" }),
      Application.countDocuments(),
      Application.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

  return { totalUsers, newUsersThisMonth, activeJobs, pendingApprovals, totalApplications, applicationsThisMonth, usersByRole };
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  const stats = await getAdminStats();

  const kpis = [
    { label: "Total Users", value: stats.totalUsers, sub: `+${stats.newUsersThisMonth} this month`, color: "text-brand-blue", icon: Users },
    { label: "Active Jobs", value: stats.activeJobs, sub: `${stats.pendingApprovals} pending approval`, color: "text-emerald-600", icon: Briefcase },
    { label: "Total Applications", value: stats.totalApplications, sub: `+${stats.applicationsThisMonth} this month`, color: "text-purple-600", icon: FileText },
    { label: "Pending Approvals", value: stats.pendingApprovals, sub: "Requires review", color: stats.pendingApprovals > 0 ? "text-orange-500" : "text-muted-foreground", icon: AlertCircle },
  ];

  const actions = [
    { label: "User Management", href: `/${locale}/admin/users`, desc: "Manage roles & access" },
    { label: "Job Approvals", href: `/${locale}/admin/approvals`, desc: `${stats.pendingApprovals} pending` },
    { label: "Jobs Management", href: `/${locale}/admin/jobs`, desc: "All platform jobs" },
    { label: "Audit Logs", href: `/${locale}/admin/audit-logs`, desc: "Security & activity trail" },
    { label: "Task Board", href: `/${locale}/admin/tasks`, desc: "Project progress tracker" },
    { label: "Design System", href: `/${locale}/admin/design-system`, desc: "UI component library" },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Admin Dashboard" description="Platform overview and system management" />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {kpis.map((Kpi, idx) => (
          <div key={idx} className="card-base p-6 flex flex-col gap-5 group hover:border-border/80 relative overflow-hidden isolate shadow-sm transition-all hover:shadow-md">
            {/* Subtle glow effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="flex items-center justify-between relative z-10 transition-transform group-hover:translate-x-0.5">
              <p className="text-[15px] font-medium text-muted-foreground">{Kpi.label}</p>
              <div className={`p-2.5 rounded-xl bg-background shadow-xs border border-border/40 ${Kpi.color}`}>
                <Kpi.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="relative z-10">
              <p className={`text-3xl font-bold ${Kpi.color} tracking-tight`}>{Kpi.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-1">{Kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        {/* Users by role */}
        <div className="card-base p-7 lg:p-9 flex flex-col h-full shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-blue" /> Users by Role
          </h2>
          <div className="space-y-6 flex-1">
            {stats.usersByRole.map((r: { _id: string; count: number }) => (
              <div key={r._id} className="flex items-center justify-between group">
                <span className="text-[15px] font-medium capitalize text-muted-foreground group-hover:text-foreground transition-colors">{r._id ?? "unknown"}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 sm:w-48 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-gradient rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, (r.count / stats.totalUsers) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-8 text-right text-foreground">{r.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card-base p-7 lg:p-9 flex flex-col h-full shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {actions.map((a) => (
              <Link key={a.href} href={a.href}
                className="group flex flex-col justify-center p-5 rounded-xl border border-border/60 bg-background hover:border-brand-blue/30 hover:shadow-soft hover:bg-brand-blue/5 transition-all relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[15px] font-semibold text-foreground group-hover:text-brand-blue transition-colors">{a.label}</p>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-brand-blue group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">{a.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

