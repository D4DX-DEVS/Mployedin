"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, BookmarkPlus, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  savingDraft: boolean;
  submitting: boolean;
  savedIndicator: boolean;
  isLastStep: boolean;
  canSubmit: boolean;
}

export function StickyActionBar({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSaveDraft,
  onSubmit,
  savingDraft,
  submitting,
  savedIndicator,
  isLastStep,
  canSubmit,
}: StickyActionBarProps) {
  const t = useTranslations("employerJobForm.actions");
  const locale = useLocale();
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="z-40 shrink-0 border-t border-border/80 bg-background/95 backdrop-blur-md" role="toolbar" aria-label={t("toolbarLabel")}>
      <div className="mx-auto max-w-5xl px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-3 sm:hidden">
          <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("stepOf", { current: currentStep, total: totalSteps })}
          </div>

          <AnimatePresence>
            {savedIndicator && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600"
              >
                <Check className="w-3.5 h-3.5" />
                {t("saved")}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 max-sm:hidden">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onPrev}
              disabled={currentStep === 1}
              className="gap-1.5"
            >
              <BackIcon className="w-4 h-4" />
              <span>{t("back")}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              disabled={savingDraft}
              className="gap-1.5"
            >
              {savingDraft ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BookmarkPlus className="w-3.5 h-3.5" />
              )}
              <span>{savingDraft ? t("savingDraft") : t("saveDraft")}</span>
            </Button>

            <AnimatePresence>
              {savedIndicator && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-1 text-xs text-green-600 font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  {t("saved")}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("stepOf", { current: currentStep, total: totalSteps })}
            </span>

            {!isLastStep ? (
              <Button
                type="button"
                onClick={onNext}
                size="sm"
                className="gap-1.5"
              >
                {t("next")}
                <NextIcon className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onSubmit}
                size="sm"
                disabled={submitting || !canSubmit}
                className={cn(
                  "gap-1.5 bg-primary hover:bg-primary/90",
                  !canSubmit && "opacity-60 cursor-not-allowed"
                )}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? t("posting") : t("postJob")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[auto_auto_1fr] gap-2 sm:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={currentStep === 1}
            className="h-10 w-10 px-0"
            aria-label={t("previousStep")}
          >
            <BackIcon className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSaveDraft}
            disabled={savingDraft}
            className="h-10 w-10 px-0"
            aria-label={savingDraft ? t("savingDraft") : t("saveDraft")}
          >
            {savingDraft ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
          </Button>

          {!isLastStep ? (
            <Button
              type="button"
              onClick={onNext}
              size="sm"
              className="h-10 w-full gap-1.5"
            >
              {t("next")}
              <NextIcon className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onSubmit}
              size="sm"
              disabled={submitting || !canSubmit}
              className={cn(
                "h-10 w-full gap-1.5 bg-primary hover:bg-primary/90",
                !canSubmit && "opacity-60 cursor-not-allowed"
              )}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? t("posting") : t("postJob")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
