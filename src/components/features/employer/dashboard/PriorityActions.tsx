"use client";

import Link from "next/link";
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
  text: string;
  href: string;
  priority: Priority;
  actionLabel: string;
}

const priorityConfig: Record<Priority, { label: string; icon: React.ElementType; badgeBg: string; badgeText: string }> = {
  urgent: {
    label: "URGENT",
    icon: Flame,
    badgeBg: "bg-red-100 dark:bg-red-950/30",
    badgeText: "text-red-600 dark:text-red-400",
  },
  medium: {
    label: "MEDIUM",
    icon: AlertTriangle,
    badgeBg: "bg-amber-50 dark:bg-amber-950/30",
    badgeText: "text-amber-600 dark:text-amber-400",
  },
  suggestion: {
    label: "SUGGESTION",
    icon: Lightbulb,
    badgeBg: "bg-sky-100 dark:bg-sky-900/60",
    badgeText: "text-sky-900 dark:text-sky-100",
  },
};

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
  const actions: Action[] = [];

  if (newApplications > 0) {
    actions.push({
      icon: FileText,
      text: `Review ${newApplications} new application${newApplications !== 1 ? "s" : ""}`,
      href: `/${locale}/employer/applications?status=applied`,
      priority: "urgent",
      actionLabel: "Review Candidates",
    });
  }

  if (scheduledInterviews === 0 && totalApplications > 0) {
    actions.push({
      icon: Calendar,
      text: `Schedule ${totalApplications > 5 ? totalApplications : ""} interview${totalApplications !== 1 ? "s" : ""} — review and set up times`,
      href: `/${locale}/employer/applications`,
      priority: "suggestion",
      actionLabel: "Schedule Interviews",
    });
  }

  if (activeJobs === 0) {
    actions.push({
      icon: Briefcase,
      text: "Post your first job to start receiving applications",
      href: `/${locale}/employer/jobs/new`,
      priority: "urgent",
      actionLabel: "Post a Job",
    });
  }

  if (activeJobs > 0 && totalApplications === 0) {
    actions.push({
      icon: TrendingUp,
      text: "Improve response time to increase interview rate",
      href: `/${locale}/employer/jobs`,
      priority: "medium",
      actionLabel: "View Insights",
    });
  }

  if (totalApplications > 2 && placements === 0) {
    actions.push({
      icon: Sparkles,
      text: "Move top-matched candidates forward in the pipeline",
      href: `/${locale}/employer/applications`,
      priority: "medium",
      actionLabel: "View Pipeline",
    });
  }

  if (scheduledInterviews > 0) {
    actions.push({
      icon: Calendar,
      text: `${scheduledInterviews} interview${scheduledInterviews !== 1 ? "s" : ""} coming up — prepare questions`,
      href: `/${locale}/employer/interviews`,
      priority: "medium",
      actionLabel: "View Interviews",
    });
  }

  if (totalApplications > 0) {
    actions.push({
      icon: MessageSquare,
      text: "Message candidates directly to speed up hiring",
      href: `/${locale}/employer/messages`,
      priority: "suggestion",
      actionLabel: "Message Now",
    });
  }

  const shown = actions.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <section className="workspace-panel-surface h-full overflow-hidden rounded-[28px]">
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          <Flame className="h-3.5 w-3.5" />
          Priority actions
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Focus the next recruiter move where it matters most.
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Recruiter actions stay tied to live activity, so the dashboard stays useful instead of decorative.
        </p>
      </div>

      <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
        {shown.map((action, idx) => {
          const Icon = action.icon;
          const config = priorityConfig[action.priority];
          const PriorityIcon = config.icon;
          const isUrgent = action.priority === "urgent";

          return (
            <div
              key={`${action.href}-${action.text}`}
              className={cn(
                "flex flex-col gap-3.5 rounded-[22px] border p-3.5 transition-all xl:flex-row xl:items-center xl:gap-3 xl:p-4",
                isUrgent && idx === 0
                  ? "border-red-200 dark:border-red-500/30 bg-[linear-gradient(135deg,_rgba(254,242,242,0.96),_rgba(255,255,255,0.98))] dark:bg-[linear-gradient(135deg,_rgba(127,29,29,0.18),_rgba(30,30,30,0.95))]"
                  : "border-border bg-background/80 hover:-translate-y-0.5 hover:border-sky-500/25"
              )}
            >
              <div className="flex flex-1 items-start gap-3">
                <div className={cn(
                  "mt-0.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] shrink-0",
                  config.badgeBg,
                  config.badgeText
                )}>
                  <PriorityIcon className="h-3 w-3" />
                  {config.label}
                </div>

                <div className={cn(
                  "rounded-2xl p-2.5 shrink-0",
                  isUrgent ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                )}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {idx === 0 ? "Recommended next" : "Keep momentum"}
                  </p>
                  <span className="mt-1.5 block text-sm leading-5 text-foreground/85">
                    {action.text}
                  </span>
                </div>
              </div>

              <Link
                href={action.href}
                className={cn(
                  "inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap self-start xl:self-center xl:shrink-0",
                  isUrgent
                    ? "bg-sky-600 text-white hover:bg-sky-700"
                    : "border border-border bg-background/80 text-foreground/85 hover:border-sky-500/25 hover:text-sky-700 dark:hover:text-sky-300"
                )}
              >
                {action.actionLabel}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
