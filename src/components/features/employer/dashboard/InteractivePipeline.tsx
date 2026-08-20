"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import {
  BriefcaseBusiness,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Gift,
} from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";

interface PipelineStage {
  labelKey: string;
  value: number;
  subCount: number;
  subLabelKey: string;
  icon: React.ElementType;
  href: string;
  /** Label + icon accent colour. */
  accent: string;
}

interface InteractivePipelineProps {
  totalApplications: number;
  newApplications: number;
  inReview: number;
  interviews: number;
  offers: number;
  offersSent: number;
  placements: number;
  avgMatchScore: number;
  locale: string;
}

/** Compact connected hiring funnel; each stage links into its live queue. */
export function InteractivePipeline({
  totalApplications,
  newApplications,
  inReview,
  interviews,
  offers,
  offersSent,
  placements,
  locale,
}: InteractivePipelineProps) {
  const t = useTranslations("employerDashboard.interactivePipeline");

  const stages: PipelineStage[] = [
    {
      labelKey: "applied",
      value: totalApplications,
      subCount: newApplications,
      subLabelKey: "new",
      icon: FileText,
      href: `/${locale}/employer/applications?status=applied`,
      accent: "text-sky-600 dark:text-sky-300",
    },
    {
      labelKey: "screening",
      value: inReview,
      subCount: inReview,
      subLabelKey: "inReview",
      icon: ClipboardCheck,
      href: `/${locale}/employer/applications?status=shortlisted`,
      accent: "text-violet-600 dark:text-violet-300",
    },
    {
      labelKey: "interviews",
      value: interviews,
      subCount: interviews,
      subLabelKey: "scheduled",
      icon: Calendar,
      href: `/${locale}/employer/interviews`,
      accent: "text-amber-600 dark:text-amber-300",
    },
    {
      labelKey: "offers",
      value: offers,
      subCount: offersSent,
      subLabelKey: "sent",
      icon: Gift,
      href: `/${locale}/employer/offers`,
      accent: "text-emerald-600 dark:text-emerald-300",
    },
    {
      labelKey: "hired",
      value: placements,
      subCount: placements,
      subLabelKey: "placed",
      icon: BriefcaseBusiness,
      href: `/${locale}/employer/placements`,
      accent: "text-teal-600 dark:text-teal-300",
    },
  ];

  return (
    <DashboardSection
      headingId="employer-hiring-pipeline"
      title={t("hiringPipeline")}
      description={t("trackMovement")}
      action={
        <Link
          href={`/${locale}/employer/applications`}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10 sm:text-sm"
        >
          {t("viewAllApplications")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      }
      bodyClassName="relative"
    >
      <nav
        aria-label={t("hiringPipeline")}
        className="grid grid-cols-6 gap-px bg-border/60 md:grid-cols-5"
      >
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const detail = stage.subCount === stage.value
            ? t(stage.subLabelKey)
            : `${stage.subCount} ${t(stage.subLabelKey).toLowerCase()}`;
          return (
            <Link
              key={stage.labelKey}
              href={stage.href}
              aria-label={t("stageAriaLabel", { stage: t(stage.labelKey), value: stage.value, detail })}
              className={`${index < 3 ? "col-span-2" : "col-span-3"} group relative flex min-h-[76px] min-w-0 flex-col justify-center bg-background px-2.5 py-3 transition-colors hover:bg-secondary/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 md:col-span-1 md:min-h-[92px] md:px-4`}
            >
              <span className={`absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-current opacity-70 md:inset-x-3 ${stage.accent}`} aria-hidden="true" />
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${stage.accent}`} />
                <span className={`truncate text-[11px] font-semibold sm:text-xs md:text-sm ${stage.accent}`}>{t(stage.labelKey)}</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2 md:mt-2">
                <AnimatedNumber value={stage.value} className="text-lg font-semibold tabular-nums tracking-tight text-foreground md:text-xl" />
                <span className="hidden truncate text-xs font-medium text-muted-foreground md:inline">
                  {detail}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </DashboardSection>
  );
}

/** Animated count-up number. */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !ref.current || value === 0) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      ref.current.textContent = String(value);
      hasAnimated.current = true;
      return;
    }

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
