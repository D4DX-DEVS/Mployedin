"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { BulkJobCard, isReadyToSave, type BulkJobStatus } from "./BulkJobCard";

export { isReadyToSave, type BulkJobStatus } from "./BulkJobCard";

interface BulkJobReviewProps {
  jobs: Partial<JobFormValues>[];
  selected: Set<number>;
  statuses: Record<number, BulkJobStatus>;
  saving: boolean;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onChange: (index: number, next: Partial<JobFormValues>) => void;
  onRemove: (index: number) => void;
  onSaveSelected: () => void;
  onOpenInForm?: (index: number) => void;
}

/**
 * Several jobs from one poster or one chat, reviewed before anything is saved
 * (client 2026-10-27: saving straight to drafts is good, "but review and
 * edit/enhance (ai) is essential there"). Each job can be fixed in place,
 * filled in by the AI assistant, or opened in the full form; the checked ones
 * are then saved as drafts, never published from here.
 *
 * Give it a new `key` when the parent replaces the whole list.
 */
export function BulkJobReview({
  jobs, selected, statuses, saving, onToggle, onToggleAll, onChange, onRemove, onSaveSelected, onOpenInForm,
}: BulkJobReviewProps) {
  const t = useTranslations("jobBulkReview");
  // Stable card keys, so removing a job does not hand its open editor or AI
  // note to the job below it.
  const nextKey = useRef(0);
  const [keys, setKeys] = useState(() => jobs.map(() => nextKey.current++));
  const cardKeys = jobs.map((_, i) => keys[i] ?? `extra-${i}`);
  // One AI answer at a time; while it is pending no card can be removed or
  // saved, so it lands on the job it was asked for.
  const [aiBusyKey, setAiBusyKey] = useState<string | number | null>(null);
  const locked = saving || aiBusyKey !== null;

  const remove = (index: number) => {
    setKeys((k) => k.filter((_, i) => i !== index));
    onRemove(index);
  };

  const pending = jobs.map((_, i) => i).filter((i) => statuses[i] !== "saved");
  const anySaved = pending.length < jobs.length;
  const ready = pending.filter((i) => isReadyToSave(jobs[i]));
  const toSave = ready.filter((i) => selected.has(i)).length;
  const allSelected = ready.length > 0 && ready.every((i) => selected.has(i));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* "Nothing is saved yet" stops being true after the first save. */}
        <p className="text-xs text-muted-foreground">{anySaved ? null : t("intro")}</p>
        {ready.length > 1 && (
          <Button type="button" variant="ghost" size="sm" className="min-h-9 text-xs" onClick={onToggleAll} disabled={saving}>
            {allSelected ? t("deselectAll") : t("selectAll")}
          </Button>
        )}
      </div>

      <ul className="space-y-3">
        {jobs.map((job, index) => {
          const key = cardKeys[index];
          return (
            <BulkJobCard
              key={key}
              job={job}
              selected={selected.has(index)}
              status={statuses[index] ?? "idle"}
              locked={locked}
              onAiBusyChange={(busy) => setAiBusyKey(busy ? key : null)}
              onToggle={() => onToggle(index)}
              onChange={(next) => onChange(index, next)}
              onRemove={() => remove(index)}
              onOpenInForm={onOpenInForm ? () => onOpenInForm(index) : undefined}
            />
          );
        })}
      </ul>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          <Button type="button" onClick={onSaveSelected} disabled={locked || toSave === 0} className="min-h-11 w-full gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {saving ? t("savingDrafts") : t("saveSelected", { count: toSave })}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">{t("draftNote")}</p>
        </div>
      )}
    </div>
  );
}
