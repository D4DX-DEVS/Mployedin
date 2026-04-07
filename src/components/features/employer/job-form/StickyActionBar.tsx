"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, BookmarkPlus, Send, ChevronLeft, ChevronRight } from "lucide-react";
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
  return (
    <div className="sticky bottom-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">

        {/* Left — Prev + Save Draft */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={currentStep === 1}
            className="gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
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
            <span className="hidden sm:inline">{savingDraft ? "Saving…" : "Save Draft"}</span>
          </Button>

          {/* Saved indicator */}
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
                Saved
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right — Step info + Next/Post */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Step {currentStep} of {totalSteps}
          </span>

          {!isLastStep ? (
            <Button
              type="button"
              onClick={onNext}
              size="sm"
              className="gap-1.5"
            >
              Next
              <ChevronRight className="w-4 h-4" />
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
              {submitting ? "Posting…" : "Post Job"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
