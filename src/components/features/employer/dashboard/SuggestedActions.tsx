"use client";

import Link from "next/link";
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
  text: string;
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
  const suggestions: Suggestion[] = [];

  // Priority 1: Unreviewed applications
  if (newApplications > 0) {
    suggestions.push({
      icon: FileText,
      text: `Review ${newApplications} new application${newApplications !== 1 ? "s" : ""} waiting for your response`,
      href: `/${locale}/employer/applications?status=applied`,
      priority: "high",
      color: "text-amber-600",
    });
  }

  // Priority 2: No interviews scheduled but have applications
  if (scheduledInterviews === 0 && totalApplications > 0) {
    suggestions.push({
      icon: Calendar,
      text: "No interviews scheduled — shortlist candidates and set up sessions",
      href: `/${locale}/employer/applications`,
      priority: "high",
      color: "text-violet-600",
    });
  }

  // Priority 3: No active jobs
  if (activeJobs === 0) {
    suggestions.push({
      icon: Briefcase,
      text: "Post your first job to start receiving applications",
      href: `/${locale}/employer/jobs/new`,
      priority: "high",
      color: "text-primary",
    });
  }

  // Priority 4: Has jobs but low applications
  if (activeJobs > 0 && totalApplications === 0) {
    suggestions.push({
      icon: TrendingUp,
      text: "Your jobs have no applications yet — improve descriptions for better visibility",
      href: `/${locale}/employer/jobs`,
      priority: "medium",
      color: "text-cyan-600",
    });
  }

  // Priority 5: Has applications but no hires yet
  if (totalApplications > 2 && placements === 0) {
    suggestions.push({
      icon: Sparkles,
      text: "You have candidates in the pipeline — move top matches forward",
      href: `/${locale}/employer/applications`,
      priority: "medium",
      color: "text-emerald-600",
    });
  }

  // Priority 6: Interviews exist
  if (scheduledInterviews > 0) {
    suggestions.push({
      icon: Calendar,
      text: `${scheduledInterviews} interview${scheduledInterviews !== 1 ? "s" : ""} coming up — prepare questions with AI`,
      href: `/${locale}/employer/interviews`,
      priority: "medium",
      color: "text-violet-600",
    });
  }

  // Priority 7: Check messages
  if (totalApplications > 0) {
    suggestions.push({
      icon: MessageSquare,
      text: "Message candidates directly to speed up hiring",
      href: `/${locale}/employer/messages`,
      priority: "low",
      color: "text-primary",
    });
  }

  // Show top 3 most relevant suggestions
  const shownSuggestions = suggestions.slice(0, 3);

  if (shownSuggestions.length === 0) return null;

  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Suggested Actions
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
                {s.text}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
