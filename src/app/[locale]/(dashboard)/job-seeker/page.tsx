import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Progress } from "@/components/ui/progress";

export default async function JobSeekerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  return (
    <div className="page-container">
      <PageHeader
        title={`Welcome back, ${session.user.name?.split(" ")[0] ?? "there"}!`}
        description="Your career journey at a glance"
      />
      {/* Profile completeness */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Profile Completeness</h3>
          <span className="text-sm font-semibold text-brand-blue">0%</span>
        </div>
        <Progress value={0} className="h-2" />
        <p className="mt-2 text-xs text-muted-foreground">
          Complete your profile to get better job matches
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Applications", "Interviews", "Jobs Saved", "AI Match Score"].map((label) => (
          <div key={label} className="card-base p-6">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-bold text-brand-blue">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
