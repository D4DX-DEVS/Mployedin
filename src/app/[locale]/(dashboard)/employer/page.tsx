import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import { Briefcase, FileText, Calendar, UserCheck, Users, Plus } from "lucide-react";
import { CompanyUser } from "@/models/CompanyUser";
import { SetupGuide } from "@/components/features/employer/SetupGuide";

export default async function EmployerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();
  const userId = (session.user as unknown as { id: string }).id;
  const employer = await Employer.findOne({ userId }).select("_id").lean();
  const employerId = employer?._id;

  const [activeJobs, totalApplications, scheduledInterviews, placements, teamMembers] = employerId
    ? await Promise.all([
        Job.countDocuments({ employerId, status: "active" }),
        Application.countDocuments({ employerId }),
        Interview.countDocuments({ employerId, status: "scheduled" }),
        Placement.countDocuments({ employerId }),
        CompanyUser.countDocuments({ companyId: employerId, status: "active" }),
      ])
    : [0, 0, 0, 0, 0];

  const kpis = [
    { label: "Active Jobs", value: activeJobs, color: "text-primary", icon: Briefcase, href: `/${locale}/employer/jobs`, sub: "Posted and live" },
    { label: "Total Applications", value: totalApplications, color: "text-cyan-600", icon: FileText, href: `/${locale}/employer/applications`, sub: "Across all jobs" },
    { label: "Interviews Scheduled", value: scheduledInterviews, color: "text-amber-600", icon: Calendar, href: `/${locale}/employer/interviews`, sub: "Upcoming sessions" },
    { label: "Placements", value: placements, color: "text-emerald-600", icon: UserCheck, href: `/${locale}/employer/placements`, sub: "Successful hires" },
    { label: "Team Members", value: teamMembers, color: "text-violet-600", icon: Users, href: `/${locale}/employer/team`, sub: "Active team members" },
  ];

  const actions = [
    { href: `/${locale}/employer/jobs/new`, title: "Post a New Job", desc: "Create a job posting to attract candidates", icon: Briefcase },
    { href: `/${locale}/employer/applications`, title: "Review Applications", desc: "View and manage incoming applications", icon: FileText },
    { href: `/${locale}/employer/interviews`, title: "Schedule Interviews", desc: "Manage interviews with shortlisted candidates", icon: Calendar },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Employer Dashboard"
        description="Manage your job postings and review candidates"
        actions={
          <Link href={`/${locale}/employer/jobs/new`} className="btn-primary gap-2">
            <Plus className="w-4 h-4" /> Post a Job
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="card-base p-6 flex flex-col gap-4 group hover:border-border/80 relative overflow-hidden isolate shadow-sm transition-all hover:shadow-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
              <div className={`p-2.5 rounded-xl bg-background border border-border/40 ${kpi.color}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="relative z-10">
              <p className={`text-3xl font-bold ${kpi.color} tracking-tight`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card-base p-5 block hover:border-primary/50 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <a.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm mb-0.5">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Job Creation Setup Guide — only shown to employers who haven't completed all steps */}
      <SetupGuide />
    </div>
  );
}
