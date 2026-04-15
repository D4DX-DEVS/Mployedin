"use client";

import Link from "next/link";
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
  label: string;
  value: number;
  subCount: number;
  subLabel: string;
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
  const stages: PipelineStage[] = [
    {
      label: "Applied",
      value: totalApplications,
      subCount: newApplications,
      subLabel: "New",
      icon: FileText,
      href: `/${locale}/employer/applications?status=applied`,
      iconClass: "text-sky-600 bg-sky-50",
      borderClass: "border-sky-200 hover:border-sky-300",
    },
    {
      label: "Screening",
      value: inReview,
      subCount: inReview,
      subLabel: "In Review",
      icon: ClipboardCheck,
      href: `/${locale}/employer/applications?status=shortlisted`,
      iconClass: "text-violet-600 bg-violet-50",
      borderClass: "border-violet-200 hover:border-violet-300",
    },
    {
      label: "Interviews",
      value: interviews,
      subCount: interviews,
      subLabel: "Scheduled",
      icon: Calendar,
      href: `/${locale}/employer/interviews`,
      iconClass: "text-amber-600 bg-amber-50",
      borderClass: "border-amber-200 hover:border-amber-300",
    },
    {
      label: "Offers",
      value: offers,
      subCount: offersSent,
      subLabel: "Sent",
      icon: Gift,
      href: `/${locale}/employer/offers`,
      iconClass: "text-emerald-600 bg-emerald-50",
      borderClass: "border-emerald-200 hover:border-emerald-300",
    },
  ];
  const peakValue = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Hiring pipeline
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Track candidate movement across the funnel.
            </h2>
          </div>

          <p className="max-w-xl text-sm leading-6 text-slate-600 md:text-right">
            Each stage links into the live employer workflow for quick review and follow-up.
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
                key={stage.label}
                href={stage.href}
                className={`group rounded-[24px] border bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:shadow-[0_28px_65px_-42px_rgba(2,132,199,0.24)] sm:p-5 ${stage.borderClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Stage {idx + 1}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {stage.label}
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
                        className="text-3xl font-semibold tracking-tight text-slate-950"
                      />
                      <span className="text-xs font-medium text-slate-500">
                        candidates
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {stage.subCount} {stage.subLabel.toLowerCase()}
                    </p>
                  </div>

                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-sky-600" />
                </div>

                <div className="mt-4 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300 transition-all duration-700 ease-out"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Open the {stage.label.toLowerCase()} queue to review candidates and keep momentum moving.
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
