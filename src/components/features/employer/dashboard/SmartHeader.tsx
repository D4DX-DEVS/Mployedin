"use client";

import Link from "next/link";
import { Plus, Clock, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartHeaderProps {
  userName: string;
  newApplications: number;
  scheduledInterviews: number;
  activeJobCount: number;
  lastActivityMinutes: number | null;
  locale: string;
}

export function SmartHeader({
  userName,
  newApplications,
  scheduledInterviews,
  activeJobCount,
  lastActivityMinutes,
  locale,
}: SmartHeaderProps) {
  // Build urgency-aware subtitle
  let subtitle: string;
  let urgencyLevel: "urgent" | "info" | "cta" = "cta";

  if (newApplications > 0) {
    subtitle = `${newApplications} candidate${newApplications !== 1 ? "s" : ""} need${newApplications === 1 ? "s" : ""} your review`;
    urgencyLevel = "urgent";
  } else if (scheduledInterviews > 0) {
    subtitle = `${scheduledInterviews} interview${scheduledInterviews !== 1 ? "s" : ""} coming up — stay on track`;
    urgencyLevel = "info";
  } else if (activeJobCount > 0) {
    subtitle = `${activeJobCount} active job${activeJobCount !== 1 ? "s" : ""} — applications will appear here`;
    urgencyLevel = "info";
  } else {
    subtitle = "Post your first job to start receiving applications";
    urgencyLevel = "cta";
  }

  const newJobHref = `/${locale}/employer/jobs/new`;
  const viewJobsHref = `/${locale}/employer/jobs`;

  return (
    <div className="card-base p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Welcome back, {userName}
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            {urgencyLevel === "urgent" && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Flame className="h-3.5 w-3.5 animate-pulse" />
              </span>
            )}
            <p className={cn(
              "text-sm",
              urgencyLevel === "urgent" ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
            )}>
              {subtitle}
            </p>
          </div>

          {/* Last activity context — like Indeed */}
          {lastActivityMinutes !== null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <Clock className="h-3 w-3" />
              <span>
                Last activity: {formatTimeAgo(lastActivityMinutes)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeJobCount > 0 && (
            <Link
              href={viewJobsHref}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg border border-border/60 hover:border-border transition-colors"
            >
              View Jobs
            </Link>
          )}
          <Link
            href={newJobHref}
            className="btn-primary gap-2"
          >
            <Plus className="w-4 h-4" />
            New Job Posting
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
