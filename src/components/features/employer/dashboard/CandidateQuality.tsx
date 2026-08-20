"use client";

import { useTranslations } from "next-intl";
import { Target, TrendingUp, TrendingDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CandidateQualityProps {
  avgMatchScore: number;
  highMatchCount: number;
  lowMatchCount: number;
  totalApplications: number;
}

export function CandidateQuality({
  avgMatchScore,
  highMatchCount,
  lowMatchCount,
  totalApplications,
}: CandidateQualityProps) {
  const t = useTranslations("employerDashboard.candidateQuality");

  if (totalApplications === 0) return null;

  const qualityLevel =
    avgMatchScore >= 70 ? "strong" :
    avgMatchScore >= 50 ? "medium" : "low";

  const qualityConfig = {
    strong: { labelKey: "strong" as const, color: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
    medium: { labelKey: "medium" as const, color: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20" },
    low: { labelKey: "low" as const, color: "text-red-500", ring: "stroke-red-500", bg: "bg-red-50 dark:bg-red-950/20" },
  };

  const config = qualityConfig[qualityLevel];
  const percentage = Math.round(avgMatchScore);
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (circumference * percentage) / 100;

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("candidateQuality")}
        </h2>
      </div>

      <div className="px-5 pb-5 sm:px-6 flex items-center gap-6">
        {/* Score ring */}
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
            <circle cx="48" cy="48" r="40" fill="none" strokeWidth="6" strokeLinecap="round" className={cn("score-ring", config.ring)} strokeDasharray={circumference} strokeDashoffset={dashOffset} transform="rotate(-90 48 48)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-xl font-bold", config.color)}>{percentage}%</span>
            <span className="text-[10px] text-muted-foreground">{t("avgMatch")}</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className={cn("px-2 py-0.5 rounded-md text-xs font-semibold", config.bg, config.color)}>
              {t(config.labelKey)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                {t("highMatch")} (&gt;80%)
              </span>
              <span className="font-semibold">{highMatchCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-red-500">
                <TrendingDown className="h-3 w-3" />
                {t("lowMatch")} (&lt;50%)
              </span>
              <span className="font-semibold">{lowMatchCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3 w-3" />
                {t("totalCandidates")}
              </span>
              <span className="font-semibold">{totalApplications}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
