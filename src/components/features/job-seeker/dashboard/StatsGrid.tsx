"use client";

import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Calendar,
  Bookmark,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface Stats {
  applicationsCount: number;
  interviewsCount: number;
  savedJobsCount: number;
  avgMatchScore: number | null;
  profileViewsCount: number;
  applicationSuccessRate: number | null;
}

// Legacy prop-based interface (used by server-rendered dashboard page)
interface StatsGridProps {
  stats?: Stats;
}

function StatCardSkeleton() {
  return (
    <div className="card-base p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-9 w-9 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-20 rounded bg-muted" />
          <div className="h-6 w-12 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function StatsGrid({ stats: propStats }: StatsGridProps) {
  // Prefer fetching from the spec API if no props given
  const { data: apiStats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    staleTime: 2 * 60 * 1000,
    enabled: !propStats,
  });

  if (isLoading && !propStats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)}
      </div>
    );
  }

  const appCount = propStats?.applicationsCount ?? apiStats?.applicationsSent?.count ?? 0;
  const appDelta = apiStats?.applicationsSent?.delta ?? 0;
  const intCount = propStats?.interviewsCount ?? apiStats?.upcomingInterviews?.count ?? 0;
  const intDelta = apiStats?.upcomingInterviews?.delta ?? 0;
  const savedCount = propStats?.savedJobsCount ?? apiStats?.savedJobs?.count ?? 0;
  const savedDelta = apiStats?.savedJobs?.delta ?? 0;
  const avgScore = propStats?.avgMatchScore ?? apiStats?.avgMatchScore?.value ?? null;

  const cards = [
    {
      label: "Applications Sent",
      value: appCount,
      delta: appDelta,
      icon: FileText,
      tone: "dashboard-tone-primary",
      emptyState: "Send your first application today",
    },
    {
      label: "Upcoming Interviews",
      value: intCount,
      delta: intDelta,
      icon: Calendar,
      tone: "dashboard-tone-success",
      emptyState: "Interviews appear after you apply",
    },
    {
      label: "Jobs Saved",
      value: savedCount,
      delta: savedDelta,
      icon: Bookmark,
      tone: "dashboard-tone-metric",
      emptyState: "Save jobs you like to revisit them",
    },
    {
      label: "Avg Match Score",
      value: avgScore !== null ? `${avgScore}%` : null,
      delta: 0,
      icon: Sparkles,
      tone: "dashboard-tone-warning",
      emptyState: "Set preferences to see your score",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="card-base flex items-start gap-4 p-5">
          <div className={`rounded-lg border p-2.5 ${card.tone}`}>
            <card.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            {card.value !== null ? (
              <div className="flex items-baseline gap-2">
                <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
                {typeof card.delta === "number" && card.delta !== 0 && (
                  <span
                    className={`text-xs font-medium ${
                      card.delta > 0 ? "dashboard-tone-positive" : "dashboard-tone-negative"
                    }`}
                  >
                    {card.delta > 0 ? (
                      <TrendingUp className="inline h-3 w-3 mr-0.5" />
                    ) : (
                      <TrendingDown className="inline h-3 w-3 mr-0.5" />
                    )}
                    {Math.abs(card.delta)}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground italic">{card.emptyState}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CareerInsights({
  stats,
}: {
  stats: Stats;
}) {
  const insights = [
    {
      label: "Profile Views (30d)",
      value: stats.profileViewsCount,
      icon: TrendingUp,
      description:
        stats.profileViewsCount > 0
          ? "Recruiters are checking your profile"
          : "Complete your profile to attract recruiters",
    },
    {
      label: "Success Rate",
      value:
        stats.applicationSuccessRate !== null
          ? `${stats.applicationSuccessRate}%`
          : "N/A",
      icon:
        (stats.applicationSuccessRate ?? 0) >= 30
          ? TrendingUp
          : TrendingDown,
      description:
        (stats.applicationSuccessRate ?? 0) >= 30
          ? "You're doing well! Keep applying"
          : "Improve your profile to increase your success rate",
    },
  ];

  return (
    <div className="card-base p-6">
      <h3 className="mb-4 text-sm font-semibold">Career Insights</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {insights.map((insight) => (
          <div
            key={insight.label}
            className="flex items-start gap-3 rounded-lg border border-border p-4"
          >
            <div className="rounded-lg bg-primary/10 p-2">
              <insight.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{insight.label}</p>
              <p className="text-lg font-bold text-foreground">
                {insight.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {insight.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
