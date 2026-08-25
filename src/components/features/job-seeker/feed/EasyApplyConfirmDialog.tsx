"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EasyApplyConfirmDialogProps {
  jobTitle: string;
  /** Skills required by the job. */
  skills: string[];
  /** Skills the seeker already has (lowercased comparison). */
  matchedSkills?: string[];
  matchScore?: number;
  open: boolean;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the seeker confirms they want to apply. */
  onConfirm: () => void;
}

export function EasyApplyConfirmDialog({
  jobTitle,
  skills,
  matchedSkills = [],
  matchScore,
  open,
  submitting = false,
  onOpenChange,
  onConfirm,
}: EasyApplyConfirmDialogProps) {
  const t = useTranslations("jobFeed.easyApplyConfirm");

  const matchedSet = new Set(matchedSkills.map((s) => s.toLowerCase()));
  const missingSkills = skills.filter((s) => !matchedSet.has(s.toLowerCase()));
  const haveSkills = skills.filter((s) => matchedSet.has(s.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription className="line-clamp-1">{jobTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {typeof matchScore === "number" && (
            <p className="text-sm text-muted-foreground">
              {t("matchSummary", { score: matchScore })}
            </p>
          )}

          {skills.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("skillsNeeded")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {haveSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800"
                  >
                    <Check className="h-2.5 w-2.5" />
                    {skill}
                  </span>
                ))}
                {missingSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
                  >
                    {skill}
                  </span>
                ))}
              </div>
              {missingSkills.length > 0 && (
                <p className="text-xs text-muted-foreground/80">
                  {t("missingHint", { count: missingSkills.length })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noSkills")}</p>
          )}

          <p className="text-xs text-muted-foreground/80">{t("profileNote")}</p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {submitting ? t("applying") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
