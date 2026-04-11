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
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
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
    <div className="card-base p-0 overflow-hidden h-full">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center gap-2">
        <Flame className="h-4 w-4 text-amber-500" />
        <h2 className="text-base font-semibold text-foreground">
          Priority Actions
        </h2>
      </div>

      <div className="px-4 pb-4 sm:px-5 space-y-1">
        {shown.map((action, idx) => {
          const Icon = action.icon;
          const config = priorityConfig[action.priority];
          const PriorityIcon = config.icon;
          const isUrgent = action.priority === "urgent";

          return (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-3 px-3 py-3.5 rounded-xl transition-all",
                isUrgent && idx === 0
                  ? "bg-red-50/60 dark:bg-red-950/10"
                  : "hover:bg-muted/40"
              )}
            >
              {/* Priority badge */}
              <div className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0",
                config.badgeBg, config.badgeText
              )}>
                <PriorityIcon className="h-2.5 w-2.5" />
                {config.label}
              </div>

              {/* Icon */}
              <div className="p-1.5 rounded-lg bg-muted/60 shrink-0 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </div>

              {/* Text */}
              <span className="text-sm text-foreground/80 flex-1 min-w-0 leading-snug">
                {action.text}
              </span>

              {/* Action button */}
              <Link
                href={action.href}
                className={cn(
                  "shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  isUrgent
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-border text-foreground/70 hover:border-primary/40 hover:text-primary"
                )}
              >
                {action.actionLabel}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
