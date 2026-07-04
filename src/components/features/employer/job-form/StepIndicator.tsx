"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface StepIndicatorStep {
  id: number;
  label: string;
}

interface StepIndicatorProps {
  steps: ReadonlyArray<StepIndicatorStep>;
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick?: (step: number) => void;
  stepLabel?: (step: number) => string;
}

export function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  stepLabel,
}: StepIndicatorProps) {
  const t = useTranslations("common");
  return (
    <nav aria-label={t("a11yFormProgress")}>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isClickable = isCompleted || step.id < currentStep;

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-start transition-all",
                  isClickable && "cursor-pointer hover:border-primary/40 hover:bg-primary/[0.04]",
                  isCurrent && "border-primary bg-primary/[0.07] shadow-sm",
                  isCompleted && !isCurrent && "border-primary/20 bg-primary/[0.05]",
                  !isCurrent && !isCompleted && "border-border bg-background"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    layout
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      isCurrent && !isCompleted && "border-primary bg-primary/10 text-primary",
                      !isCurrent && !isCompleted && "border-border bg-background text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </motion.div>

                  <div className="min-w-0">
                    <motion.p
                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                      animate={{ opacity: 1 }}
                      initial={{ opacity: 0 }}
                      transition={{ delay: 0.05 * index }}
                    >
                      {stepLabel?.(step.id) ?? `Step ${step.id}`}
                    </motion.p>
                    <motion.p
                      className={cn(
                        "truncate text-sm font-semibold",
                        isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"
                      )}
                      animate={{ opacity: 1 }}
                      initial={{ opacity: 0 }}
                      transition={{ delay: 0.08 * index }}
                    >
                      {step.label}
                    </motion.p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
