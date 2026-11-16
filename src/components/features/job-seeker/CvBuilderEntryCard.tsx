"use client";

import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Autocomplete } from "@/components/ui/tag-autocomplete";
import { MonthYearPicker } from "@/app/[locale]/(dashboard)/job-seeker/cv/month-picker";
import type { BuiltJob } from "./cv-wizard/types";

interface CvBuilderEntryCardProps {
  entry: BuiltJob;
  index: number;
  /** Projects / internships instead of jobs. */
  fresher: boolean;
  canRemove: boolean;
  /** AI is writing this card's description. */
  writing: boolean;
  /** Another card is being written. */
  aiBusy: boolean;
  onChange: (patch: Partial<BuiltJob>) => void;
  onRemove: () => void;
  onWrite: () => void;
}

/** One job (or project, for a fresher) in the guided CV builder. */
export function CvBuilderEntryCard({ entry: e, index: i, fresher, canRemove, writing, aiBusy, onChange, onRemove, onWrite }: CvBuilderEntryCardProps) {
  const t = useTranslations("cvWizard");
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          {fresher ? t("work.projectN", { n: i + 1 }) : t("work.jobN", { n: i + 1 })}
        </p>
        {canRemove && (
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" /> {t("work.remove")}
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cvw-title-${i}`}>{fresher ? t("work.projectTitle") : t("work.jobTitle")}</Label>
          {fresher ? (
            <Input id={`cvw-title-${i}`} value={e.title} onChange={(ev) => onChange({ title: ev.target.value })} placeholder={t("work.projectTitlePlaceholder")} />
          ) : (
            <Autocomplete id={`cvw-title-${i}`} type="roles" value={e.title} onChange={(v) => onChange({ title: v })} placeholder={t("work.jobTitlePlaceholder")} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cvw-org-${i}`}>{fresher ? t("work.place") : t("work.company")}</Label>
          <Input
            id={`cvw-org-${i}`}
            value={e.organisation}
            onChange={(ev) => onChange({ organisation: ev.target.value })}
            placeholder={fresher ? t("work.placePlaceholder") : t("work.companyPlaceholder")}
          />
        </div>
        <MonthYearPicker label={t("work.from")} value={e.start} onChange={(v) => onChange({ start: v })} maxYear={thisYear} />
        {!e.current && <MonthYearPicker label={t("work.to")} value={e.end} onChange={(v) => onChange({ end: v })} maxYear={thisYear} />}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <Checkbox checked={e.current} onCheckedChange={(v) => onChange({ current: v === true, end: "" })} />
        {fresher ? t("work.ongoing") : t("work.currentJob")}
      </label>

      {/* The AI part: a few rough words in, CV lines out. */}
      <div className="space-y-2 rounded-lg bg-blue-50/70 p-3">
        <Label htmlFor={`cvw-desc-${i}`}>{t("work.whatDidYouDo")}</Label>
        <Textarea
          id={`cvw-desc-${i}`}
          rows={4}
          maxLength={1500}
          value={e.description}
          onChange={(ev) => onChange({ description: ev.target.value })}
          placeholder={fresher ? t("work.projectDescPlaceholder") : t("work.jobDescPlaceholder")}
          className="bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!e.title.trim() || aiBusy} onClick={onWrite} className="min-h-10 gap-1.5">
            {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {writing ? t("work.writing") : e.description.trim() ? t("work.improve") : t("work.writeForMe")}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-gray-600">{e.title.trim() ? t("work.descHint") : t("work.titleFirst")}</p>
        </div>
      </div>
    </div>
  );
}
