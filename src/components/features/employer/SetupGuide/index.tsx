"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { X, Minus, ChevronRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
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

export function SetupGuide() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const t = useTranslations("employerSetupGuide");
  const tSteps = useTranslations("employerSetupGuide.steps");

  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [allDone, setAllDone] = useState(false);
  const [doNotShow, setDoNotShow] = useState(false);
  const isRtl = locale === "ar";

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
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === "true") {
      setLoading(false);
      return;
    }
    // Expanded, this card is ~520px tall — on a phone it covered the dashboard
    // it is supposed to be guiding the reader through, and being fixed, it could
    // not be scrolled past. Phones open it collapsed to its header; one tap
    // expands it.
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setMinimized(true);
    }
    fetchStatus();
  }, [fetchStatus]);

  const handleDismiss = () => {
    if (doNotShow) {
      localStorage.setItem(DISMISSED_KEY, "true");
    }
    setVisible(false);
  };

  if (loading || !visible || allDone) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;
  const currentStep = steps.find((s) => !s.completed);

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 z-50 overflow-hidden rounded-3xl border border-border bg-background/95 shadow-[0_28px_80px_-48px_rgba(2,132,199,0.45)] backdrop-blur sm:bottom-24 sm:w-[22rem]",
        isRtl ? "sm:right-auto sm:left-6" : "sm:left-auto sm:right-6",
        "transition-all duration-300"
      )}
    >
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_42%),linear-gradient(135deg,_rgba(14,165,233,0.96),_rgba(37,99,235,0.94))] px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
            <Sparkles className="h-3 w-3" />
            {t("setupGuide")}
          </div>
          <h3 className="heading-label mt-3 font-bold leading-snug text-white">{t("title")}</h3>
          <p className="mt-1 text-xs leading-snug text-white/75">
            {minimized
              ? t("completedOf", { done: completedCount, total: steps.length })
              : t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
            aria-label={t("a11yClose")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{t("progressLabel")}</span>
              <span className="text-xs font-bold text-primary">
                {t("completedOf", { done: completedCount, total: steps.length })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto px-3 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              steps.map((step, idx) => {
                const isCurrent = step.id === currentStep?.id;
                const definition = setupStepDefinition(step.id);
                return (
                  <Link
                    key={step.id}
                    href={`/${locale}${step.href}`}
                    className={cn(
                      "group mb-2 flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                      step.completed
                        ? "border-border bg-muted/50 opacity-70"
                        : isCurrent
                          ? "border-primary/30 bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {step.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center text-[11px] font-bold",
                            isCurrent
                              ? "border-primary text-primary"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-snug",
                          step.completed
                            ? "line-through text-muted-foreground"
                            : isCurrent
                              ? "font-semibold text-foreground"
                              : "text-foreground/90"
                        )}
                      >
                        {definition ? tSteps(definition.labelKey) : step.id}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {definition ? tSteps(definition.descriptionKey) : ""}
                      </p>
                    </div>

                    {!step.completed && (
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 flex-shrink-0 mt-0.5 transition-colors",
                          isCurrent ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                    )}
                    {step.completed && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-5 py-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={doNotShow}
                onChange={(e) => setDoNotShow(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">{t("doNotShowAgain")}</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
