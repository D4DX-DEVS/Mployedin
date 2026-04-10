"use client";

import Link from "next/link";
import {
  Briefcase,
  FileText,
  Calendar,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStage {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href: string;
}

interface HiringPipelineProps {
  activeJobs: number;
  newApplications: number;
  inReview: number;
  interviews: number;
  hired: number;
  locale: string;
}

export function HiringPipeline({
  activeJobs,
  newApplications,
  inReview,
  interviews,
  hired,
  locale,
}: HiringPipelineProps) {
  const stages: PipelineStage[] = [
    {
      label: "Active Jobs",
      value: activeJobs,
      icon: Briefcase,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: `/${locale}/employer/jobs`,
    },
    {
      label: "New Applications",
      value: newApplications,
      icon: FileText,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
      href: `/${locale}/employer/applications?status=applied`,
    },
    {
      label: "In Review",
      value: inReview,
      icon: FileText,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
      href: `/${locale}/employer/applications?status=shortlisted`,
    },
    {
      label: "Interviews",
      value: interviews,
      icon: Calendar,
      color: "text-violet-600",
      bgColor: "bg-violet-50 dark:bg-violet-950/30",
      href: `/${locale}/employer/interviews`,
    },
    {
      label: "Hired",
      value: hired,
      icon: UserCheck,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      href: `/${locale}/employer/placements`,
    },
  ];

  const total = Math.max(activeJobs, 1);

  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Hiring Pipeline
        </h2>
      </div>

      {/* Pipeline flow */}
      <div className="px-3 pb-5 sm:px-4">
        <div className="flex items-stretch gap-0">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className="flex items-center flex-1 min-w-0">
                <Link
                  href={stage.href}
                  className={cn(
                    "flex-1 rounded-xl p-3 sm:p-4 transition-all group hover:shadow-md",
                    stage.bgColor,
                    "hover:scale-[1.02]"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("p-1.5 rounded-lg bg-white/70 dark:bg-white/10", stage.color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground truncate">
                      {stage.label}
                    </span>
                  </div>
                  <p className={cn("text-2xl sm:text-3xl font-bold", stage.color)}>
                    {stage.value}
                  </p>
                  {/* Mini bar showing proportion */}
                  <div className="mt-2 h-1 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", {
                        "bg-primary": idx === 0,
                        "bg-amber-500": idx === 1,
                        "bg-cyan-500": idx === 2,
                        "bg-violet-500": idx === 3,
                        "bg-emerald-500": idx === 4,
                      })}
                      style={{
                        width: `${Math.max((stage.value / total) * 100, stage.value > 0 ? 8 : 0)}%`,
                      }}
                    />
                  </div>
                </Link>
                {idx < stages.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mx-0.5 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
