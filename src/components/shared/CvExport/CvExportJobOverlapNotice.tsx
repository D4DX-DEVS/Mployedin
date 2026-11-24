"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { useApplicationStatusLabel } from "@/components/shared/ApplicationStatusPill";
import type { CvExportJobOverlap } from "./useCvExport";

export type CvExportOverlapChoice = "skip" | "all";

interface CvExportJobOverlapNoticeProps {
  overlap: readonly CvExportJobOverlap[];
  /** Candidates that would be exported if the overlap is skipped. */
  newCount: number;
  choice: CvExportOverlapChoice;
  onChoiceChange: (choice: CvExportOverlapChoice) => void;
}

/**
 * Before a job export: which selected candidates the client already has (their
 * CV was exported for this job, or they applied to it), and whether to leave
 * them out. Leaving them out is the default.
 */
export function CvExportJobOverlapNotice({ overlap, newCount, choice, onChoiceChange }: CvExportJobOverlapNoticeProps) {
  const t = useTranslations("cvExport");
  const locale = useLocale();
  const statusLabel = useApplicationStatusLabel();
  const labelId = useId();
  const exportedCount = overlap.filter((o) => o.exported).length;
  const appliedOnlyCount = overlap.length - exportedCount;

  const options: ReadonlyArray<{ value: CvExportOverlapChoice; label: string; hint: string }> = [
    { value: "skip", label: t("overlapSkip", { count: newCount }), hint: t("overlapSkipHint", { count: overlap.length }) },
    { value: "all", label: t("overlapAll"), hint: t("overlapAllHint") },
  ];

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p id={labelId} className="font-medium">
              {exportedCount > 0 && appliedOnlyCount > 0
                ? t("overlapTitleBoth", { exported: exportedCount, applied: appliedOnlyCount })
                : exportedCount > 0
                  ? t("overlapTitleExported", { count: exportedCount })
                  : t("overlapTitleApplied", { count: appliedOnlyCount })}
            </p>
            <ul className="space-y-1 text-xs">
              {overlap.map((o) => (
                <li key={o.seekerId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <bdi className="font-medium">{o.name}</bdi>
                  <span className="text-amber-900/80">
                    {[
                      o.exported
                        ? o.exported.lastBy
                          ? t("overlapExportedBy", { date: formatListDate(o.exported.lastAt, locale), name: o.exported.lastBy, count: o.exported.count })
                          : t("overlapExported", { date: formatListDate(o.exported.lastAt, locale), count: o.exported.count })
                        : null,
                      o.application ? t("overlapApplied", { status: statusLabel(o.application.status) }) : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-2">
        {options.map((option) => {
          const selected = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChoiceChange(option.value)}
              className={cn(
                "flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-border")}
              >
                {selected && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
