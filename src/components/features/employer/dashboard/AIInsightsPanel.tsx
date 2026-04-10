"use client";

import {
  Bot,
  TrendingDown,
  TrendingUp,
  Target,
  Zap,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  type: "warning" | "success" | "info";
}

interface AIInsightsPanelProps {
  activeJobCount: number;
  totalApplications: number;
  avgMatchScore: number;
  highMatchCount: number;
  lowMatchCount: number;
  topMatchScore: number;
  hiredCount: number;
  hasJobsWithNoApps: boolean;
  hasJobsWithoutSalary: boolean;
}

export function AIInsightsPanel({
  activeJobCount,
  totalApplications,
  avgMatchScore,
  highMatchCount,
  lowMatchCount,
  topMatchScore,
  hiredCount,
  hasJobsWithNoApps,
  hasJobsWithoutSalary,
}: AIInsightsPanelProps) {
  const insights: Insight[] = [];

  // Match quality insight (our USP vs Naukri/Indeed)
  if (totalApplications > 0) {
    if (avgMatchScore >= 70) {
      insights.push({
        icon: Target,
        iconColor: "text-emerald-500",
        title: `Candidate quality is strong (${Math.round(avgMatchScore)}%)`,
        description: `${highMatchCount} high-match candidate${highMatchCount !== 1 ? "s" : ""} — move them forward quickly`,
        type: "success",
      });
    } else if (avgMatchScore >= 50) {
      insights.push({
        icon: Target,
        iconColor: "text-amber-500",
        title: `Candidate quality is medium (${Math.round(avgMatchScore)}%)`,
        description: "Refine job requirements or add specific skills to attract better-matched candidates",
        type: "warning",
      });
    } else if (avgMatchScore > 0) {
      insights.push({
        icon: Target,
        iconColor: "text-red-500",
        title: `Low candidate match quality (${Math.round(avgMatchScore)}%)`,
        description: "Review job descriptions — they may not align with the talent pool",
        type: "warning",
      });
    }
  }

  // Top candidate highlight
  if (topMatchScore >= 80) {
    insights.push({
      icon: Sparkles,
      iconColor: "text-primary",
      title: `Top candidate: ${Math.round(topMatchScore)}% match`,
      description: "Don't lose this candidate — schedule an interview soon",
      type: "success",
    });
  }

  // Job performance insight (Indeed-style)
  if (hasJobsWithNoApps && activeJobCount > 0) {
    insights.push({
      icon: TrendingDown,
      iconColor: "text-red-500",
      title: "Some jobs are underperforming",
      description: "Add salary range and detailed skills to increase visibility by up to 30%",
      type: "warning",
    });
  }

  // Salary visibility tip
  if (hasJobsWithoutSalary) {
    insights.push({
      icon: TrendingUp,
      iconColor: "text-amber-500",
      title: "Show salary to boost applications",
      description: "Jobs with visible salary ranges get 30–50% more applicants",
      type: "warning",
    });
  }

  // Speed-to-hire insight
  if (totalApplications > 0 && hiredCount === 0) {
    insights.push({
      icon: Zap,
      iconColor: "text-violet-500",
      title: "Speed matters in hiring",
      description: "Top candidates are off the market within 10 days — review your pipeline daily",
      type: "info",
    });
  }

  if (insights.length === 0) return null;

  const shown = insights.slice(0, 3);

  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          AI Insights
        </h2>
        <span className="ml-auto text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Powered by AI
        </span>
      </div>

      <div className="px-3 pb-4 sm:px-4 space-y-2">
        {shown.map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-3 px-4 py-3 rounded-xl transition-all",
                insight.type === "warning" && "bg-amber-50/50 dark:bg-amber-950/10",
                insight.type === "success" && "bg-emerald-50/50 dark:bg-emerald-950/10",
                insight.type === "info" && "bg-primary/[0.03]"
              )}
            >
              <div className={cn("mt-0.5 shrink-0", insight.iconColor)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {insight.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {insight.description}
                </p>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
