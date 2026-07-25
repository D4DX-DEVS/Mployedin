"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef } from "react";
import {
  BriefcaseBusiness,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Gift,
  Sparkles,
} from "lucide-react";

interface PipelineStage {
  labelKey: string;
  value: number;
  subCount: number;
  subLabelKey: string;
  icon: React.ElementType;
  href: string;
  /** Label + icon accent colour. */
  accent: string;
  /** Card surface (tinted bg + border). */
  surface: string;
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
  avgMatchScore,
  locale,
}: InteractivePipelineProps) {
  const t = useTranslations("employerDashboard.interactivePipeline");
  const tInsights = useTranslations("employerDashboard.quickInsights");

  const stages: PipelineStage[] = [
    {
      labelKey: "applied",
      value: totalApplications,
      subCount: newApplications,
      subLabelKey: "new",
      icon: FileText,
      href: `/${locale}/employer/applications?status=applied`,
      accent: "text-sky-600 dark:text-sky-300",
      surface: "bg-sky-50/70 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/25",
    },
    {
      labelKey: "screening",
      value: inReview,
      subCount: inReview,
      subLabelKey: "inReview",
      icon: ClipboardCheck,
      href: `/${locale}/employer/applications?status=shortlisted`,
      accent: "text-violet-600 dark:text-violet-300",
      surface: "bg-violet-50/70 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/25",
    },
    {
      labelKey: "interviews",
      value: interviews,
      subCount: interviews,
      subLabelKey: "scheduled",
      icon: Calendar,
      href: `/${locale}/employer/interviews`,
      accent: "text-amber-600 dark:text-amber-300",
      surface: "bg-amber-50/70 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
    },
    {
      labelKey: "offers",
      value: offers,
      subCount: offersSent,
      subLabelKey: "sent",
      icon: Gift,
      href: `/${locale}/employer/offers`,
      accent: "text-emerald-600 dark:text-emerald-300",
      surface: "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25",
    },
    {
      labelKey: "hired",
      value: placements,
      subCount: placements,
      subLabelKey: "placed",
      icon: BriefcaseBusiness,
      href: `/${locale}/employer/placements`,
      accent: "text-teal-600 dark:text-teal-300",
      surface: "bg-teal-50/70 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/25",
    },
  ];

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {t("hiringPipeline")}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("trackMovement")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/5 px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
            {Math.round(avgMatchScore)}%
            <span className="ms-1 font-normal text-muted-foreground">{tInsights("avgFitScore")}</span>
          </span>
          <Link
            href={`/${locale}/employer/applications`}
            aria-label={t("stageLinksDesc")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-500/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="flex items-stretch overflow-x-auto p-2">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <Fragment key={stage.labelKey}>
              <Link
                href={stage.href}
                className={`group flex min-w-[132px] flex-1 flex-col rounded-xl border p-3 transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${stage.surface}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${stage.accent}`} />
                  <span className={`text-sm font-semibold ${stage.accent}`}>{t(stage.labelKey)}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <AnimatedNumber value={stage.value} className="text-xl font-semibold tabular-nums tracking-tight text-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {stage.subCount} {t(stage.subLabelKey).toLowerCase()}
                  </span>
                </div>
              </Link>
              {idx < stages.length - 1 && (
                <ChevronRight className="mx-0.5 my-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
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
