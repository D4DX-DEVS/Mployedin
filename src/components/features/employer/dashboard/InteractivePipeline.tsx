"use client";

import Link from "next/link";
import {
  FileText,
  ClipboardCheck,
  Calendar,
  Gift,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface PipelineStage {
  label: string;
  value: number;
  subCount: number;
  subLabel: string;
  icon: React.ElementType;
  href: string;
}

interface InteractivePipelineProps {
  totalApplications: number;
  newApplications: number;
  inReview: number;
  interviews: number;
  offers: number;
  offersSent: number;
  locale: string;
}

export function InteractivePipeline({
  totalApplications,
  newApplications,
  inReview,
  interviews,
  offers,
  offersSent,
  locale,
}: InteractivePipelineProps) {
  const stages: PipelineStage[] = [
    {
      label: "Applied",
      value: totalApplications,
      subCount: newApplications,
      subLabel: "New",
      icon: FileText,
      href: `/${locale}/employer/applications?status=applied`,
    },
    {
      label: "Screening",
      value: inReview,
      subCount: inReview,
      subLabel: "In Review",
      icon: ClipboardCheck,
      href: `/${locale}/employer/applications?status=shortlisted`,
    },
    {
      label: "Interviews",
      value: interviews,
      subCount: interviews,
      subLabel: "Scheduled",
      icon: Calendar,
      href: `/${locale}/employer/interviews`,
    },
    {
      label: "Offers",
      value: offers,
      subCount: offersSent,
      subLabel: "Sent",
      icon: Gift,
      href: `/${locale}/employer/offers`,
    },
  ];

  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <h2 className="text-base font-semibold text-foreground">
          Hiring Pipeline
        </h2>
      </div>

      <div className="px-4 pb-5 sm:px-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className="flex items-center">
                <Link
                  href={stage.href}
                  className={cn(
                    "flex-1 bg-white dark:bg-card rounded-xl p-4 border border-border/60",
                    "hover:border-primary/30 hover:shadow-md transition-all group",
                    "shadow-sm"
                  )}
                >
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    {stage.label}
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <AnimatedNumber
                      value={stage.value}
                      className="text-2xl sm:text-3xl font-bold text-foreground"
                    />
                    <span className="text-xs text-muted-foreground font-medium">
                      Candidates
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{stage.subCount}</span>{" "}
                    {stage.subLabel}
                  </p>

                  {/* Bottom blue accent bar */}
                  <div className="mt-3 h-0.5 rounded-full bg-primary/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700 ease-out group-hover:bg-primary"
                      style={{
                        width: stage.value > 0 ? "100%" : "0%",
                      }}
                    />
                  </div>
                </Link>

                {idx < stages.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/25 shrink-0 mx-1 hidden sm:block" />
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
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !ref.current || value === 0) return;
    hasAnimated.current = true;

    const duration = 600;
    const start = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * value);
      if (ref.current) ref.current.textContent = String(current);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
