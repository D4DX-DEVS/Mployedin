"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FormStep {
  /** Short name shown in the progress indicator, e.g. "Account". */
  label: string;
  content: ReactNode;
  /** Runs before the dialog leaves this step forward (Next or the final submit).
   *  Return the sentence to show in the banner to keep the user here. */
  validate?: () => string | null;
}

interface StepFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  steps: FormStep[];
  /** Banner copy owned by the caller, typically a server rejection. */
  error?: string;
  /** Step that `error` belongs to (a taken email lives on the first step);
   *  the dialog moves there when the error arrives. */
  errorStep?: number;
  /** Called when the user moves between steps, so a stale caller error does
   *  not follow them onto a step it says nothing about. */
  onErrorDismiss?: () => void;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onSubmit: () => void;
}

/* The Add Employer dialog (CrudModal) is the reference: one column at 32rem,
   the header and the Cancel/Create row pinned, only the fields scroll. A form
   that would not fit that frame is split into steps instead of growing a
   scrollbar, so every step is short enough to see whole. */
export function StepFormDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  error,
  errorStep,
  onErrorDismiss,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
}: StepFormDialogProps) {
  const tc = useTranslations("common");
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const movedByUser = useRef(false);

  const lastIndex = steps.length - 1;
  const current = Math.min(step, lastIndex);
  const isLast = current === lastIndex;

  // A reopened dialog starts over; resetting on close keeps the old step from
  // flashing for one frame when it opens again.
  useEffect(() => {
    if (!open) {
      setStep(0);
      setStepError("");
    }
  }, [open]);

  // Keyed on the values, so a repeat of the identical error only jumps again
  // if `error` passed through another value in between — every caller clears
  // it before each request, and onErrorDismiss clears it on navigation.
  useEffect(() => {
    if (error && errorStep !== undefined) {
      // The submit button that had focus unmounts on the jump; land on the
      // field the error is about instead of dropping focus to the dialog.
      movedByUser.current = true;
      setStep(errorStep);
    }
  }, [error, errorStep]);

  // Keyboard and screen-reader users land on the new step's first field
  // rather than on a Next button that has just turned into Back.
  useEffect(() => {
    if (!movedByUser.current) return;
    movedByUser.current = false;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const first = bodyRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    first?.focus({ preventScroll: true });
  }, [current]);

  const goTo = (next: number) => {
    movedByUser.current = true;
    setStepError("");
    onErrorDismiss?.();
    setStep(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!isLast) {
      const message = steps[current].validate?.() ?? null;
      if (message) {
        setStepError(message);
        return;
      }
      goTo(current + 1);
      return;
    }
    // Every step is re-checked: a value can only be edited on its own step,
    // but the submit must never trust that the earlier Next still holds.
    for (let index = 0; index <= lastIndex; index++) {
      const message = steps[index].validate?.() ?? null;
      if (message) {
        if (index !== current) {
          movedByUser.current = true;
          setStep(index);
        }
        setStepError(message);
        return;
      }
    }
    setStepError("");
    onSubmit();
  };

  const banner = stepError || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[calc(100dvh-4rem)] p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-14 pt-6 pb-0 sm:ps-6 sm:pe-14">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>

        {steps.length > 1 && (
          <div className="shrink-0 px-6 pt-3">
            <p className="sr-only" aria-live="polite">
              {tc("stepProgress", { current: current + 1, total: steps.length })}: {steps[current].label}
            </p>
            <ol className="flex gap-2" aria-hidden="true">
              {steps.map((item, index) => (
                <li key={item.label} className="min-w-0 flex-1" data-step-state={index < current ? "done" : index === current ? "current" : "todo"}>
                  <span className={cn("block h-1 rounded-full", index <= current ? "bg-primary" : "bg-muted")} />
                  <span
                    className={cn(
                      "mt-1.5 block truncate text-xs",
                      index === current ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {/* Number in its own box: "1. label" flips its period to
                        the wrong side under RTL bidi. */}
                    <span className="me-1 tabular-nums">{index + 1}</span>
                    {item.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {banner && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{banner}</span>
              </div>
            )}
            {steps[current].content}
          </div>

          <DialogFooter className="shrink-0 border-t border-border/50 px-6 py-4">
            {current === 0 ? (
              <Button key="cancel" type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                {tc("cancel")}
              </Button>
            ) : (
              <Button key="back" type="button" variant="outline" onClick={() => goTo(current - 1)} disabled={submitting}>
                {tc("back")}
              </Button>
            )}
            {/* Distinct keys: React must not recycle the Next button's DOM node
                as the submit button mid-click, or one click would advance and
                submit at once. */}
            {isLast ? (
              <Button key="submit" type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? submittingLabel : submitLabel}
              </Button>
            ) : (
              <Button key="next" type="submit">
                {tc("next")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
