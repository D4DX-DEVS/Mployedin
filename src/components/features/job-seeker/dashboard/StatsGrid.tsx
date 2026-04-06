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

interface StatsGridProps {
  stats: Stats;
}

export function StatsGrid({ stats }: StatsGridProps) {
  const cards = [
    {
      label: "Applications Sent",
      value: stats.applicationsCount,
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Upcoming Interviews",
      value: stats.interviewsCount,
      icon: Calendar,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "Jobs Saved",
      value: stats.savedJobsCount,
      icon: Bookmark,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      label: "Avg Match Score",
      value:
        stats.avgMatchScore !== null ? `${stats.avgMatchScore}%` : "N/A",
      icon: Sparkles,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="card-base flex items-start gap-4 p-5"
        >
          <div className={`rounded-lg p-2.5 ${card.bgColor}`}>
            <card.icon className={`h-5 w-5 ${card.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>
              {card.value}
            </p>
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
