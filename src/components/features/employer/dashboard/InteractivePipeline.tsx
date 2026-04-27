"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  FileText,
  ClipboardCheck,
  Calendar,
  Gift,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef } from "react";

interface PipelineStage {
  labelKey: string;
  value: number;
  subCount: number;
  subLabelKey: string;
  icon: React.ElementType;
  href: string;
  iconClass: string;
  borderClass: string;
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
  const t = useTranslations("employerDashboard.interactivePipeline");

  const stages: PipelineStage[] = [
    {
      labelKey: "applied",
      value: totalApplications,
      subCount: newApplications,
      subLabelKey: "new",
      icon: FileText,
      href: `/${locale}/employer/applications?status=applied`,
      iconClass: "text-sky-600 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/15",
      borderClass: "border-sky-200 hover:border-sky-300 dark:border-sky-500/30",
    },
    {
      labelKey: "screening",
      value: inReview,
      subCount: inReview,
      subLabelKey: "inReview",
      icon: ClipboardCheck,
      href: `/${locale}/employer/applications?status=shortlisted`,
      iconClass: "text-violet-600 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/15",
      borderClass: "border-violet-200 hover:border-violet-300 dark:border-violet-500/30",
    },
    {
      labelKey: "interviews",
      value: interviews,
      subCount: interviews,
      subLabelKey: "scheduled",
      icon: Calendar,
      href: `/${locale}/employer/interviews`,
      iconClass: "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15",
      borderClass: "border-amber-200 hover:border-amber-300 dark:border-amber-500/30",
    },
    {
      labelKey: "offers",
      value: offers,
      subCount: offersSent,
      subLabelKey: "sent",
      icon: Gift,
      href: `/${locale}/employer/offers`,
      iconClass: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15",
      borderClass: "border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/30",
    },
  ];
  const peakValue = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hiringPipeline")}
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {t("trackMovement")}
            </h2>
          </div>

          <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-right">
            {t("stageLinksDesc")}
          </p>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const barWidth = stage.value === 0 ? 0 : Math.max(18, Math.round((stage.value / peakValue) * 100));

            return (
              <Link
                key={stage.labelKey}
                href={stage.href}
                className={`group rounded-[24px] border bg-background/80 p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:shadow-[0_28px_65px_-42px_rgba(2,132,199,0.24)] sm:p-5 ${stage.borderClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("stage", { number: idx + 1 })}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {t(stage.labelKey)}
                    </p>
                  </div>

                  <div className={`rounded-2xl p-2.5 ${stage.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <AnimatedNumber
                        value={stage.value}
                        className="text-3xl font-semibold tracking-tight text-foreground"
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("candidates")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.subCount} {t(stage.subLabelKey).toLowerCase()}
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-sky-600 dark:group-hover:text-sky-300" />
                </div>

                <div className="mt-4 h-2 rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300 transition-all duration-700 ease-out"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {t("openQueueDesc", { stage: t(stage.labelKey).toLowerCase() })}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Animated count-up number */
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
