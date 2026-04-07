"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { X, Minus, ChevronRight, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepStatus {
  id: string;
  label: string;
  description: string;
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

  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [allDone, setAllDone] = useState(false);
  const [doNotShow, setDoNotShow] = useState(false);

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
        "fixed bottom-24 right-6 z-50 w-80 rounded-2xl shadow-2xl border border-border bg-background overflow-hidden",
        "transition-all duration-300"
      )}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-primary px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-snug">Job Creation Setup Guide</h3>
          <p className="text-white/70 text-xs mt-0.5 leading-snug">
            Complete these steps to get started
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Progress bar */}
          <div className="px-4 py-3 border-b border-border/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Your progress</span>
              <span className="text-xs font-bold text-primary">
                {completedCount} / {steps.length} completed
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Steps list */}
          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              steps.map((step, idx) => {
                const isCurrent = step.id === currentStep?.id;
                return (
                  <Link
                    key={step.id}
                    href={`/${locale}${step.href}`}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors group",
                      step.completed
                        ? "opacity-60"
                        : isCurrent
                          ? "bg-primary/5 border-l-2 border-primary"
                          : "hover:bg-muted/40"
                    )}
                  >
                    {/* Icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      {step.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold",
                            isCurrent
                              ? "border-primary text-primary"
                              : "border-muted-foreground/40 text-muted-foreground/60"
                          )}
                        >
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-snug",
                          step.completed
                            ? "line-through text-muted-foreground"
                            : isCurrent
                              ? "text-foreground font-semibold"
                              : "text-foreground"
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {step.description}
                      </p>
                    </div>

                    {/* Arrow for current */}
                    {!step.completed && (
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 flex-shrink-0 mt-0.5 transition-colors",
                          isCurrent ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                        )}
                      />
                    )}
                    {step.completed && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={doNotShow}
                onChange={(e) => setDoNotShow(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span className="text-xs text-muted-foreground">Do not show again</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
