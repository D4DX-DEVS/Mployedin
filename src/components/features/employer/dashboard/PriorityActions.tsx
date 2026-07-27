"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  FileText,
  Calendar,
  TrendingUp,
  Sparkles,
  Briefcase,
  MessageSquare,
  Flame,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Priority = "urgent" | "medium" | "suggestion";

interface Action {
  icon: React.ElementType;
  textKey: string;
  textValues?: Record<string, string | number | Date>;
  href: string;
  priority: Priority;
  actionLabelKey: string;
}

interface PriorityActionsProps {
  activeJobs: number;
  newApplications: number;
  scheduledInterviews: number;
  totalApplications: number;
  placements: number;
  locale: string;
}

export function PriorityActions({
  activeJobs,
  newApplications,
  scheduledInterviews,
  totalApplications,
  placements,
  locale,
}: PriorityActionsProps) {
  const t = useTranslations("employerDashboard.priorityActions");

  const priorityConfig: Record<Priority, { labelKey: string; icon: React.ElementType; badgeBg: string; badgeText: string }> = {
    urgent: {
      labelKey: "urgent",
      icon: Flame,
      badgeBg: "bg-red-100 dark:bg-red-950/30",
      badgeText: "text-red-600 dark:text-red-400",
    },
    medium: {
      labelKey: "medium",
      icon: AlertTriangle,
      badgeBg: "bg-amber-50 dark:bg-amber-950/30",
      badgeText: "text-amber-600 dark:text-amber-400",
    },
    suggestion: {
      labelKey: "suggestion",
      icon: Lightbulb,
      badgeBg: "bg-sky-100 dark:bg-sky-900/60",
      badgeText: "text-sky-900 dark:text-sky-100",
    },
  };

  const actions: Action[] = [];

  if (newApplications > 0) {
    actions.push({
      icon: FileText,
      textKey: newApplications !== 1 ? "reviewNewAppsPlural" : "reviewNewApps",
      textValues: { count: newApplications },
      href: `/${locale}/employer/applications?status=applied`,
      priority: "urgent",
      actionLabelKey: "reviewCandidates",
    });
  }

  if (scheduledInterviews === 0 && totalApplications > 0) {
    actions.push({
      icon: Calendar,
      textKey: totalApplications !== 1 ? "scheduleCountInterviews" : "scheduleInterviewsAction",
      textValues: { count: totalApplications },
      href: `/${locale}/employer/applications`,
      priority: "suggestion",
      actionLabelKey: "scheduleInterviews",
    });
  }

  if (activeJobs === 0) {
    actions.push({
      icon: Briefcase,
      textKey: "postFirstJob",
      href: `/${locale}/employer/jobs/new`,
      priority: "urgent",
      actionLabelKey: "postAJob",
    });
  }

  if (activeJobs > 0 && totalApplications === 0) {
    actions.push({
      icon: TrendingUp,
      textKey: "improveResponseTime",
      href: `/${locale}/employer/jobs`,
      priority: "medium",
      actionLabelKey: "viewInsights",
    });
  }

  if (totalApplications > 2 && placements === 0) {
    actions.push({
      icon: Sparkles,
      textKey: "moveTopMatched",
      href: `/${locale}/employer/applications`,
      priority: "medium",
      actionLabelKey: "viewPipeline",
    });
  }

  if (scheduledInterviews > 0) {
    actions.push({
      icon: Calendar,
      textKey: scheduledInterviews !== 1 ? "interviewsComingPlural" : "interviewsComing",
      textValues: { count: scheduledInterviews },
      href: `/${locale}/employer/interviews`,
      priority: "medium",
      actionLabelKey: "viewInterviews",
    });
  }

  if (totalApplications > 0) {
    actions.push({
      icon: MessageSquare,
      textKey: "messageCandidates",
      href: `/${locale}/employer/messages`,
      priority: "suggestion",
      actionLabelKey: "messageNow",
    });
  }

  // Only show urgent + medium priorities; exclude low-value "suggestions"
  const actionable = actions.filter((a) => a.priority !== "suggestion");
  const shown = actionable.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2 sm:px-6 sm:py-3.5">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 sm:px-3 sm:py-1 sm:text-[11px] sm:tracking-[0.18em]">
          <Flame className="h-3.5 w-3.5" />
          {t("priorityActionsLabel")}
        </div>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {t("actionsTiedToActivity")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-2.5 py-2.5 sm:gap-2.5 sm:px-5 sm:py-5 md:grid-cols-3">
        {shown.map((action, idx) => {
          const Icon = action.icon;
          const config = priorityConfig[action.priority];
          const PriorityIcon = config.icon;
          const isUrgent = action.priority === "urgent";

          // Compact, fully-clickable row: badge → task → CTA line. Content flows
          // top-to-bottom so it never crams a horizontal button into the narrow
          // 1/3-width dashboard column (the old xl:flex-row layout wrapped badly).
          return (
            <Link
              key={`${action.href}-${action.textKey}`}
              href={action.href}
              className={cn(
                "group flex min-w-0 items-start gap-2 rounded-xl border p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:gap-3 sm:p-3.5",
                isUrgent && idx === 0
                  ? "border-red-200 dark:border-red-500/30 bg-[linear-gradient(135deg,_rgba(254,242,242,0.96),_rgba(255,255,255,0.98))] dark:bg-[linear-gradient(135deg,_rgba(127,29,29,0.18),_rgba(30,30,30,0.95))]"
                  : "border-border bg-background/80 hover:border-sky-500/25"
              )}
            >
              <div
                className={cn(
                  // Sits inline with the priority badge on the first line.
                  "shrink-0 rounded-lg p-1.5 sm:rounded-2xl sm:p-2.5",
                  isUrgent
                    ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                )}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] sm:px-2.5 sm:text-[10px] sm:tracking-[0.18em]",
                    config.badgeBg,
                    config.badgeText
                  )}
                >
                  <PriorityIcon className="h-3 w-3" />
                  {t(config.labelKey)}
                </span>
                <p className="mt-1 text-xs font-medium leading-snug text-foreground/90 sm:mt-2 sm:text-sm">
                  {t(action.textKey, action.textValues)}
                </p>
                <span
                  className={cn(
                    "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold sm:mt-2 sm:text-xs",
                    isUrgent
                      ? "text-sky-700 dark:text-sky-300"
                      : "text-foreground/70 group-hover:text-sky-700 dark:group-hover:text-sky-300"
                  )}
                >
                  {t(action.actionLabelKey)}
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
