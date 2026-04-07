import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";

import { SmartWelcome } from "@/components/features/job-seeker/dashboard/SmartWelcome";
import { QuickActions } from "@/components/features/job-seeker/dashboard/QuickActions";
import { StatsGrid, CareerInsights } from "@/components/features/job-seeker/dashboard/StatsGrid";
import { RecommendedJobs } from "@/components/features/job-seeker/dashboard/RecommendedJobs";
import { AIInsightsCard } from "@/components/features/job-seeker/dashboard/AIInsightsCard";
import { RecentActivity } from "@/components/features/job-seeker/dashboard/RecentActivity";
import { UpcomingInterviews } from "@/components/features/job-seeker/dashboard/UpcomingInterviews";

function SectionSkeleton() {
  return (
    <div className="card-base p-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-muted mb-3" />
      <div className="space-y-2">
        <div className="h-3 rounded bg-muted w-full" />
        <div className="h-3 rounded bg-muted w-3/4" />
      </div>
    </div>
  );
}

export default async function JobSeekerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  const userId = session.user.id!;
  const userName = session.user.name?.split(" ")[0] ?? "there";

  // Minimal server-side data for the hero card only
  const seeker = await JobSeeker.findOne({ userId })
    .select("profileCompleteness skills experience education cv preferredRoles")
    .lean();

  const profileCompleteness = seeker?.profileCompleteness ?? 0;
  const completionSteps = [
    { key: "skills", label: "Add skills", done: (seeker?.skills?.length ?? 0) > 0 },
    { key: "experience", label: "Add experience", done: (seeker?.experience?.length ?? 0) > 0 },
    { key: "education", label: "Add education", done: (seeker?.education?.length ?? 0) > 0 },
    { key: "cv", label: "Upload resume", done: !!seeker?.cv?.originalUrl },
    { key: "preferences", label: "Set job preferences", done: (seeker?.preferredRoles?.length ?? 0) > 0 },
  ];
  return (
    <div className="space-y-6">
      {/* Hero card: name, auto-apply toggle, recruiter views, progress */}
      <SmartWelcome
        name={userName}
        profileCompleteness={profileCompleteness}
        completionSteps={completionSteps}
        locale={locale}
      />

      {/* Quick Actions */}
      <QuickActions locale={locale} />

      {/* Stats Row: 4 cards with delta, fetches from /api/dashboard/stats */}
      <Suspense fallback={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="card-base h-20" />)}
        </div>
      }>
        <StatsGrid />
      </Suspense>

      {/* Job Feed: infinite scroll, sort control, optimistic apply/save */}
      <Suspense fallback={<SectionSkeleton />}>
        <RecommendedJobs locale={locale} />
      </Suspense>

      {/* AI Insights */}
      <Suspense fallback={<SectionSkeleton />}>
        <AIInsightsCard />
      </Suspense>

      {/* Recent Activity + Upcoming Interviews — 2 column on larger screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentActivity items={[]} />
        <UpcomingInterviews interviews={[]} locale={locale} />
      </div>
    </div>
  );
}
