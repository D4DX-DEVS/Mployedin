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
      badgeBg: "bg-red-100",
      badgeText: "text-red-800",
    },
    medium: {
      labelKey: "medium",
      icon: AlertTriangle,
      badgeBg: "bg-amber-100",
      badgeText: "text-amber-900",
    },
    suggestion: {
      labelKey: "suggestion",
      icon: Lightbulb,
      badgeBg: "bg-sky-100",
      badgeText: "text-sky-900",
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
      href: `/${locale}/employer/applications?scoreMin=80`,
      priority: "medium",
      actionLabelKey: "reviewTopMatches",
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

  // Priority determines order and emphasis, but never hides the only useful
  // next step. A quiet pipeline still deserves clear guidance.
  const shown = actions.slice(0, 3);
  if (shown.length === 0) return null;

  const [primaryAction, ...secondaryActions] = shown;
  const PrimaryIcon = primaryAction.icon;
  const primaryConfig = priorityConfig[primaryAction.priority];
  const PrimaryPriorityIcon = primaryConfig.icon;

  return (
    <section aria-labelledby="employer-next-action" className="workspace-panel-surface overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3 sm:px-5 sm:pb-3 sm:pt-4">
        <div>
          <h2 id="employer-next-action" className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {t("recommendedNext")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{t("focusNextMove")}</p>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
          primaryConfig.badgeBg,
          primaryConfig.badgeText
        )}>
          <PrimaryPriorityIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(primaryConfig.labelKey)}
        </span>
      </div>

      <Link
        href={primaryAction.href}
        className="group mx-3 mb-3 flex min-h-14 items-center gap-3 rounded-xl bg-sky-600 px-3 py-3 text-white shadow-[0_14px_30px_-22px_rgba(2,132,199,0.9)] transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:mx-4 sm:mb-4 sm:px-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <PrimaryIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 sm:text-base">
            {t(primaryAction.textKey, primaryAction.textValues)}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-sky-50 sm:text-sm">
            {t(primaryAction.actionLabelKey)}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
      </Link>

      {secondaryActions.length > 0 && (
        <div className="border-t border-border/60 px-3 py-1 sm:grid sm:grid-cols-2 sm:gap-x-2 sm:px-4">
          <p className="px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground sm:col-span-2">{t("keepMomentum")}</p>
          {secondaryActions.map((action) => {
            const Icon = action.icon;
            const config = priorityConfig[action.priority];
            return (
              <Link
                key={`${action.href}-${action.textKey}`}
                href={action.href}
                className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Icon className={cn("h-4 w-4 shrink-0", config.badgeText)} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground">
                  {t(action.textKey, action.textValues)}
                </span>
                <span className="hidden shrink-0 text-xs font-semibold text-sky-700 sm:inline">
                  {t(action.actionLabelKey)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
