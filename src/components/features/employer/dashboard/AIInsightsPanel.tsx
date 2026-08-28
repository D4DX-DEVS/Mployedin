"use client";

import { useTranslations } from "next-intl";
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
  titleKey: string;
  titleValues?: Record<string, string | number | Date>;
  descKey: string;
  descValues?: Record<string, string | number | Date>;
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
  const t = useTranslations("employerDashboard.aiInsights");

  const insights: Insight[] = [];

  if (totalApplications > 0) {
    if (avgMatchScore >= 70) {
      insights.push({
        icon: Target,
        iconColor: "text-emerald-500",
        titleKey: "qualityStrong",
        titleValues: { score: Math.round(avgMatchScore) },
        descKey: highMatchCount !== 1 ? "highMatchMovePlural" : "highMatchMove",
        descValues: { count: highMatchCount },
        type: "success",
      });
    } else if (avgMatchScore >= 50) {
      insights.push({
        icon: Target,
        iconColor: "text-amber-500",
        titleKey: "qualityMedium",
        titleValues: { score: Math.round(avgMatchScore) },
        descKey: "refineSuggestion",
        type: "warning",
      });
    } else if (avgMatchScore > 0) {
      insights.push({
        icon: Target,
        iconColor: "text-red-500",
        titleKey: "qualityLow",
        titleValues: { score: Math.round(avgMatchScore) },
        descKey: "reviewDescriptions",
        type: "warning",
      });
    }
  }

  if (topMatchScore >= 80) {
    insights.push({
      icon: Sparkles,
      iconColor: "text-primary",
      titleKey: "topCandidate",
      titleValues: { score: Math.round(topMatchScore) },
      descKey: "dontLose",
      type: "success",
    });
  }

  if (hasJobsWithNoApps && activeJobCount > 0) {
    insights.push({
      icon: TrendingDown,
      iconColor: "text-red-500",
      titleKey: "underperforming",
      descKey: "addSalarySkills",
      type: "warning",
    });
  }

  if (hasJobsWithoutSalary) {
    insights.push({
      icon: TrendingUp,
      iconColor: "text-amber-500",
      titleKey: "showSalary",
      descKey: "salaryRange",
      type: "warning",
    });
  }

  if (totalApplications > 0 && hiredCount === 0) {
    insights.push({
      icon: Zap,
      iconColor: "text-violet-500",
      titleKey: "speedMatters",
      descKey: "topCandidatesOffMarket",
      type: "info",
    });
  }

  if (insights.length === 0) return null;

  const shown = insights.slice(0, 3);

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="heading-label font-semibold text-muted-foreground uppercase tracking-wide">
          {t("title")}
        </h2>
        <span className="ml-auto text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          {t("poweredByAI")}
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
                insight.type === "warning" && "bg-amber-50/50",
                insight.type === "success" && "bg-emerald-50/50",
                insight.type === "info" && "bg-primary/[0.03]"
              )}
            >
              <div className={cn("mt-0.5 shrink-0", insight.iconColor)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {t(insight.titleKey, insight.titleValues)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t(insight.descKey, insight.descValues)}
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
