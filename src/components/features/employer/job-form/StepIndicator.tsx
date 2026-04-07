"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JOB_FORM_STEPS } from "./jobFormSchema";

interface StepIndicatorProps {
  steps: typeof JOB_FORM_STEPS;
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Form progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isClickable = isCompleted || step.id < currentStep;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step button */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={cn(
                  "flex flex-col items-center gap-1.5 group",
                  isClickable && "cursor-pointer"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <motion.div
                  layout
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                    isCompleted &&
                      "bg-primary border-primary text-primary-foreground",
                    isCurrent &&
                      !isCompleted &&
                      "border-primary text-primary bg-primary/10",
                    !isCurrent &&
                      !isCompleted &&
                      "border-border text-muted-foreground bg-background"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </motion.div>
                <motion.span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap hidden sm:block",
                    isCurrent && "text-primary",
                    isCompleted && "text-primary",
                    !isCurrent && !isCompleted && "text-muted-foreground"
                  )}
                  animate={{ opacity: 1 }}
                  initial={{ opacity: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  {step.label}
                </motion.span>
              </button>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="flex-1 mx-2 mb-5 sm:mb-3.5">
                  <div className="h-0.5 bg-border relative overflow-hidden rounded-full">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-primary"
                      initial={{ width: "0%" }}
                      animate={{
                        width: completedSteps.has(step.id) ? "100%" : "0%",
                      }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
