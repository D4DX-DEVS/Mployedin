import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";

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
    { label: "Total Users", value: stats.totalUsers, sub: `+${stats.newUsersThisMonth} this month`, color: "text-primary" },
    { label: "Active Jobs", value: stats.activeJobs, sub: `${stats.pendingApprovals} pending approval`, color: "text-green-600" },
    { label: "Total Applications", value: stats.totalApplications, sub: `+${stats.applicationsThisMonth} this month`, color: "text-purple-600" },
    { label: "Pending Approvals", value: stats.pendingApprovals, sub: "Requires review", color: stats.pendingApprovals > 0 ? "text-orange-600" : "text-muted-foreground" },
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
    <div className="p-6 space-y-6">
      <PageHeader title="Admin Dashboard" description="Platform overview and system management" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-base">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-3xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Users by role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-base">
          <h2 className="text-sm font-semibold mb-3">Users by Role</h2>
          <div className="space-y-2">
            {stats.usersByRole.map((r: { _id: string; count: number }) => (
              <div key={r._id} className="flex items-center justify-between">
                <span className="text-sm capitalize">{r._id ?? "unknown"}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (r.count / stats.totalUsers) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">{r.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base">
          <h2 className="text-sm font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <Link key={a.href} href={a.href}
                className="block p-3 rounded-xl border hover:border-primary/40 hover:bg-primary/5 transition-all">
                <p className="text-sm font-medium">{a.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

