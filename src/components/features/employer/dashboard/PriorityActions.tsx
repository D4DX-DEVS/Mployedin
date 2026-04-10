"use client";

import Link from "next/link";
import {
  FileText,
  Calendar,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Briefcase,
  MessageSquare,
  Flame,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Priority = "urgent" | "medium" | "suggestion";

interface Action {
  icon: React.ElementType;
  text: string;
  href: string;
  priority: Priority;
  color: string;
}

const priorityConfig: Record<Priority, { label: string; icon: React.ElementType; badgeBg: string; badgeText: string }> = {
  urgent: {
    label: "URGENT",
    icon: Flame,
    badgeBg: "bg-red-50 dark:bg-red-950/30",
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
    badgeBg: "bg-primary/5",
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

  // URGENT: Unreviewed applications
  if (newApplications > 0) {
    actions.push({
      icon: FileText,
      text: `Review ${newApplications} new application${newApplications !== 1 ? "s" : ""} waiting for your response`,
      href: `/${locale}/employer/applications?status=applied`,
      priority: "urgent",
      color: "text-amber-600",
    });
  }

  // URGENT: No interviews scheduled but have candidates in review
  if (scheduledInterviews === 0 && totalApplications > 0) {
    actions.push({
      icon: Calendar,
      text: "No interviews scheduled — shortlist candidates and set up sessions",
      href: `/${locale}/employer/applications`,
      priority: "urgent",
      color: "text-violet-600",
    });
  }

  // URGENT: No active jobs
  if (activeJobs === 0) {
    actions.push({
      icon: Briefcase,
      text: "Post your first job to start receiving applications",
      href: `/${locale}/employer/jobs/new`,
      priority: "urgent",
      color: "text-primary",
    });
  }

  // MEDIUM: Has jobs but no applications
  if (activeJobs > 0 && totalApplications === 0) {
    actions.push({
      icon: TrendingUp,
      text: "Your jobs have no applications yet — improve descriptions for better visibility",
      href: `/${locale}/employer/jobs`,
      priority: "medium",
      color: "text-cyan-600",
    });
  }

  // MEDIUM: Applications but no hires
  if (totalApplications > 2 && placements === 0) {
    actions.push({
      icon: Sparkles,
      text: "You have candidates in the pipeline — move top matches forward",
      href: `/${locale}/employer/applications`,
      priority: "medium",
      color: "text-emerald-600",
    });
  }

  // MEDIUM: Upcoming interviews
  if (scheduledInterviews > 0) {
    actions.push({
      icon: Calendar,
      text: `${scheduledInterviews} interview${scheduledInterviews !== 1 ? "s" : ""} coming up — prepare questions with AI`,
      href: `/${locale}/employer/interviews`,
      priority: "medium",
      color: "text-violet-600",
    });
  }

  // SUGGESTION: Message candidates
  if (totalApplications > 0) {
    actions.push({
      icon: MessageSquare,
      text: "Message candidates directly to speed up hiring",
      href: `/${locale}/employer/messages`,
      priority: "suggestion",
      color: "text-primary",
    });
  }

  const shown = actions.slice(0, 4);
  if (shown.length === 0) return null;

  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6 flex items-center gap-2">
        <Flame className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Priority Actions
        </h2>
      </div>

      <div className="px-3 pb-4 sm:px-4 space-y-1">
        {shown.map((action, idx) => {
          const Icon = action.icon;
          const config = priorityConfig[action.priority];
          const PriorityIcon = config.icon;

          return (
            <Link
              key={idx}
              href={action.href}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all group",
                "hover:bg-muted/50",
                idx === 0 && action.priority === "urgent" && "bg-red-50/50 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20"
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
              <div className={cn("p-2 rounded-lg bg-muted/60 shrink-0", action.color)}>
                <Icon className="h-4 w-4" />
              </div>

              {/* Text */}
              <span className="text-sm font-medium text-foreground flex-1 min-w-0">
                {action.text}
              </span>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
