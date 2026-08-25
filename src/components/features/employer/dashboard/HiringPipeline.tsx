"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  FileText,
  Calendar,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStage {
  labelKey: string;
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
  const t = useTranslations("employerDashboard.hiringPipeline");

  const stages: PipelineStage[] = [
    {
      labelKey: "activeJobs",
      value: activeJobs,
      icon: Briefcase,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: `/${locale}/employer/jobs`,
    },
    {
      labelKey: "newApplications",
      value: newApplications,
      icon: FileText,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      href: `/${locale}/employer/applications?status=applied`,
    },
    {
      labelKey: "inReview",
      value: inReview,
      icon: FileText,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
      href: `/${locale}/employer/applications?status=shortlisted`,
    },
    {
      labelKey: "interviews",
      value: interviews,
      icon: Calendar,
      color: "text-violet-600",
      bgColor: "bg-violet-50",
      href: `/${locale}/employer/interviews`,
    },
    {
      labelKey: "hired",
      value: hired,
      icon: UserCheck,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      href: `/${locale}/employer/placements`,
    },
  ];

  const total = Math.max(activeJobs, 1);

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("title")}
        </h2>
      </div>

      {/* Pipeline flow */}
      <div className="px-3 pb-5 sm:px-4">
        <div className="flex items-stretch gap-0">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.labelKey} className="flex items-center flex-1 min-w-0">
                <Link
                  href={stage.href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all group hover:bg-muted/50 flex-1 min-w-0",
                  )}
                >
                  <div className={cn("p-2 rounded-lg", stage.bgColor, stage.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-lg font-bold text-foreground">{stage.value}</span>
                  <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight truncate w-full">
                    {t(stage.labelKey)}
                  </span>
                </Link>
                {idx < stages.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mx-0.5" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
