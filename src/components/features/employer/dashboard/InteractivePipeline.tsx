"use client";

import Link from "next/link";
import {
  Briefcase,
  FileText,
  ClipboardCheck,
  Calendar,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface PipelineStage {
  label: string;
  value: number;
  icon: React.ElementType;
  textColor: string;
  iconBg: string;
  cardBg: string;
  borderAccent: string;
  barColor: string;
  href: string;
}

interface InteractivePipelineProps {
  activeJobs: number;
  newApplications: number;
  inReview: number;
  interviews: number;
  hired: number;
  locale: string;
}

export function InteractivePipeline({
  activeJobs,
  newApplications,
  inReview,
  interviews,
  hired,
  locale,
}: InteractivePipelineProps) {
  const stages: PipelineStage[] = [
    {
      label: "Active Jobs",
      value: activeJobs,
      icon: Briefcase,
      textColor: "text-blue-700 dark:text-blue-300",
      iconBg: "bg-blue-600 text-white",
      cardBg: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60",
      borderAccent: "border-l-blue-500",
      barColor: "bg-blue-500",
      href: `/${locale}/employer/jobs`,
    },
    {
      label: "New Applications",
      value: newApplications,
      icon: FileText,
      textColor: "text-orange-700 dark:text-orange-300",
      iconBg: "bg-orange-500 text-white",
      cardBg: "bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-950/60",
      borderAccent: "border-l-orange-500",
      barColor: "bg-orange-500",
      href: `/${locale}/employer/applications?status=applied`,
    },
    {
      label: "In Review",
      value: inReview,
      icon: ClipboardCheck,
      textColor: "text-teal-700 dark:text-teal-300",
      iconBg: "bg-teal-500 text-white",
      cardBg: "bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-950/60",
      borderAccent: "border-l-teal-500",
      barColor: "bg-teal-500",
      href: `/${locale}/employer/applications?status=shortlisted`,
    },
    {
      label: "Interviews",
      value: interviews,
      icon: Calendar,
      textColor: "text-purple-700 dark:text-purple-300",
      iconBg: "bg-purple-500 text-white",
      cardBg: "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-950/60",
      borderAccent: "border-l-purple-500",
      barColor: "bg-purple-500",
      href: `/${locale}/employer/interviews`,
    },
    {
      label: "Hired",
      value: hired,
      icon: UserCheck,
      textColor: "text-green-700 dark:text-green-300",
      iconBg: "bg-green-500 text-white",
      cardBg: "bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-950/60",
      borderAccent: "border-l-green-500",
      barColor: "bg-green-500",
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

      <div className="px-3 pb-5 sm:px-4">
        <div className="flex items-stretch gap-2 sm:gap-3">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className="flex items-center flex-1 min-w-0">
                <Link
                  href={stage.href}
                  className={cn(
                    "flex-1 rounded-xl p-3 sm:p-4 transition-all group relative border-l-4",
                    stage.cardBg,
                    stage.borderAccent,
                    "hover:shadow-lg hover:scale-[1.03]",
                    "shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("p-1.5 rounded-lg", stage.iconBg)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold text-foreground/70 truncate">
                      {stage.label}
                    </span>
                  </div>

                  {/* Animated counter */}
                  <AnimatedNumber value={stage.value} className={cn("text-2xl sm:text-3xl font-bold", stage.textColor)} />

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-1000 ease-out", stage.barColor)}
                      style={{
                        width: `${Math.max((stage.value / total) * 100, stage.value > 0 ? 12 : 0)}%`,
                      }}
                    />
                  </div>

                  {/* Hover hint */}
                  <div className="absolute inset-x-0 bottom-1 h-0 group-hover:h-5 overflow-hidden transition-all duration-200">
                    <span className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground font-medium">
                      View <ChevronRight className="h-2.5 w-2.5" />
                    </span>
                  </div>
                </Link>
                {idx < stages.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 mx-0.5 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Animated count-up number */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !ref.current || value === 0) return;
    hasAnimated.current = true;

    const duration = 600;
    const start = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * value);
      if (ref.current) ref.current.textContent = String(current);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <p ref={ref} className={className}>
      {value}
    </p>
  );
}
