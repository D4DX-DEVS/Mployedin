"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  FileText,
  Calendar,
  TrendingUp,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Briefcase,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  icon: React.ElementType;
  textKey: string;
  textValues?: Record<string, string | number | Date>;
  href: string;
  priority: "high" | "medium" | "low";
  color: string;
}

interface SuggestedActionsProps {
  activeJobs: number;
  newApplications: number;
  scheduledInterviews: number;
  totalApplications: number;
  placements: number;
  locale: string;
}

export function SuggestedActions({
  activeJobs,
  newApplications,
  scheduledInterviews,
  totalApplications,
  placements,
  locale,
}: SuggestedActionsProps) {
  const t = useTranslations("employerDashboard.suggestedActions");

  const suggestions: Suggestion[] = [];

  if (newApplications > 0) {
    suggestions.push({
      icon: FileText,
      textKey: newApplications !== 1 ? "reviewAppsPlural" : "reviewApps",
      textValues: { count: newApplications },
      href: `/${locale}/employer/applications?status=applied`,
      priority: "high",
      color: "text-amber-600",
    });
  }

  if (scheduledInterviews === 0 && totalApplications > 0) {
    suggestions.push({
      icon: Calendar,
      textKey: "noInterviews",
      href: `/${locale}/employer/applications`,
      priority: "high",
      color: "text-violet-600",
    });
  }

  if (activeJobs === 0) {
    suggestions.push({
      icon: Briefcase,
      textKey: "postFirstJob",
      href: `/${locale}/employer/jobs/new`,
      priority: "high",
      color: "text-primary",
    });
  }

  if (activeJobs > 0 && totalApplications === 0) {
    suggestions.push({
      icon: TrendingUp,
      textKey: "noApplications",
      href: `/${locale}/employer/jobs`,
      priority: "medium",
      color: "text-cyan-600",
    });
  }

  if (totalApplications > 2 && placements === 0) {
    suggestions.push({
      icon: Sparkles,
      textKey: "moveCandidates",
      href: `/${locale}/employer/applications`,
      priority: "medium",
      color: "text-emerald-600",
    });
  }

  if (scheduledInterviews > 0) {
    suggestions.push({
      icon: Calendar,
      textKey: scheduledInterviews !== 1 ? "interviewsComingPlural" : "interviewsComing",
      textValues: { count: scheduledInterviews },
      href: `/${locale}/employer/interviews`,
      priority: "medium",
      color: "text-violet-600",
    });
  }

  if (totalApplications > 0) {
    suggestions.push({
      icon: MessageSquare,
      textKey: "messageCandidates",
      href: `/${locale}/employer/messages`,
      priority: "low",
      color: "text-primary",
    });
  }

  const shownSuggestions = suggestions.slice(0, 3);

  if (shownSuggestions.length === 0) return null;

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("title")}
        </h2>
      </div>

      <div className="px-3 pb-4 sm:px-4 space-y-1">
        {shownSuggestions.map((s, idx) => {
          const Icon = s.icon;
          return (
            <Link
              key={idx}
              href={s.href}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all group",
                "hover:bg-muted/50"
              )}
            >
              <div className={cn("p-2 rounded-lg bg-muted/60 shrink-0", s.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">
                {t(s.textKey, s.textValues)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
