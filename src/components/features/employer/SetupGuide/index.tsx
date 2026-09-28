"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { X, ChevronRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { setupStepDefinition, type SetupStepId } from "./setupSteps";

interface StepStatus {
  id: SetupStepId;
  href: string;
  completed: boolean;
}

interface SetupStatusResponse {
  steps: StepStatus[];
  allDone: boolean;
}

const DISMISSED_KEY = "mployedin:setup-guide:dismissed";

/**
 * Slim onboarding banner under the dashboard header. One row: progress, the
 * step chips, and the next step as the call to action. Renders nothing once
 * every step is done or after the employer dismisses it for good.
 *
 * Steps come from `/api/employers/setup-status` (ids + hrefs only); labels
 * resolve here from `employerSetupGuide.steps.*` so the checklist is localised.
 */
export function SetupGuide() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const t = useTranslations("employerSetupGuide");
  const tSteps = useTranslations("employerSetupGuide.steps");

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [allDone, setAllDone] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/employers/setup-status");
      if (!res.ok) return;
      const data: SetupStatusResponse = await res.json();
      setSteps(data.steps);
      setAllDone(data.allDone);
      if (!data.allDone) setVisible(true);
    } catch {
      // silently fail — setup guide is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY);
    } catch {
      // storage unavailable — show the guide as usual
    }
    if (dismissed === "true") {
      setLoading(false);
      return;
    }
    fetchStatus();
  }, [fetchStatus]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // storage unavailable — dismiss for this view only
    }
    setVisible(false);
  };

  if (loading || !visible || allDone) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;
  const currentStep = steps.find((s) => !s.completed);
  const currentDefinition = currentStep ? setupStepDefinition(currentStep.id) : undefined;

  return (
    <section
      aria-label={t("setupGuide")}
      data-setup-banner
      className="workspace-panel-surface flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold text-foreground">{t("title")}</p>
            <p className="text-xs font-medium tabular-nums text-primary">{t("completedOf", { done: completedCount, total: steps.length })}</p>
          </div>
          <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)} aria-label={t("progressLabel")}>
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5 md:justify-end" aria-label={t("progressLabel")}>
        {steps.map((step) => {
          const definition = setupStepDefinition(step.id);
          const label = definition ? tSteps(definition.labelKey) : step.id;
          const isCurrent = step.id === currentStep?.id;
          return (
            <li key={step.id}>
              <Link
                href={`/${locale}${step.href}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset transition-colors",
                  step.completed
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                    : isCurrent
                      ? "bg-card text-primary ring-primary/40 hover:bg-primary/10"
                      : "bg-card text-muted-foreground ring-border hover:text-foreground",
                )}
              >
                {step.completed ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
                <span className="max-w-[10rem] truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="flex shrink-0 items-center gap-1">
        {currentStep && (
          <Link
            href={`/${locale}${currentStep.href}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {currentDefinition ? tSteps(currentDefinition.labelKey) : currentStep.id}
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("a11yClose")}
          title={t("doNotShowAgain")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
