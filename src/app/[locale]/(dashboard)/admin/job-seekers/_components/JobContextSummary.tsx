"use client";

import { useTranslations } from "next-intl";
import { Briefcase, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { SeekerJobContext } from "@/lib/cv/cvExportHistory";

interface JobContextSummaryProps {
  context: SeekerJobContext | null;
  onClear: () => void;
  hideExported: boolean;
  onHideExportedChange: (value: boolean) => void;
  hideApplied: boolean;
  onHideAppliedChange: (value: boolean) => void;
}

/**
 * One line under the filters once a job is picked in the filter bar: which job,
 * how many applied / had their CV exported, and the two "leave out" switches.
 * It lives inside the filter card, so a picked job adds no box of its own.
 */
export function JobContextSummary({
  context,
  onClear,
  hideExported,
  onHideExportedChange,
  hideApplied,
  onHideAppliedChange,
}: JobContextSummaryProps) {
  const tr = useTranslations("adminJobSeekers");
  const job = context?.job;
  return (
    <div
      role="group"
      aria-label={tr("jobBarLabel")}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-primary/5 px-3 py-2 text-sm"
    >
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        <Briefcase className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <bdi className="truncate">{job ? [job.title, job.company].filter(Boolean).join(" · ") : tr("jobBarLoading")}</bdi>
      </span>
      {context && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {tr("jobBarApplied", { count: context.appliedCount })} · {tr("jobBarExported", { count: context.exportedCount })}
        </span>
      )}
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-foreground">
        <Checkbox checked={hideExported} onCheckedChange={(checked) => onHideExportedChange(checked === true)} />
        {tr("jobBarHideExported")}
      </label>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-foreground">
        <Checkbox checked={hideApplied} onCheckedChange={(checked) => onHideAppliedChange(checked === true)} />
        {tr("jobBarHideApplied")}
      </label>
      <button
        type="button"
        onClick={onClear}
        aria-label={tr("jobBarClear")}
        className="ms-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="size-3.5" aria-hidden="true" />
        {tr("jobBarClear")}
      </button>
    </div>
  );
}
