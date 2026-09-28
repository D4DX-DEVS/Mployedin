"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JOB_CATEGORIES } from "@/components/features/employer/job-form/jobFormSchema";
import type { WorkflowTemplateMatchRules } from "@/lib/hiring/workflowTemplateMatch";
import { cn } from "@/lib/utils";

const EMPLOYMENT_TYPE_KEYS = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  contract: "employmentContract",
  internship: "employmentInternship",
  freelance: "employmentFreelance",
  walk_in: "employmentWalkIn",
} as const;

const WORK_MODE_KEYS = {
  onsite: "workModeOnsite",
  hybrid: "workModeHybrid",
  remote: "workModeRemote",
} as const;

interface MatchRulesEditorProps {
  value: WorkflowTemplateMatchRules;
  onChange: (next: WorkflowTemplateMatchRules) => void;
  /** Categories jobs actually use, merged with the job form's list. */
  categoryOptions: readonly string[];
  idPrefix: string;
  disabled?: boolean;
}

function toggle(list: readonly string[] | null | undefined, value: string): string[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

function ToggleChip({ pressed, onClick, children, disabled }: { pressed: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60",
        pressed ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Which jobs the template is picked for automatically. Every filled rule must hold. */
export function MatchRulesEditor({ value, onChange, categoryOptions, idPrefix, disabled }: MatchRulesEditorProps) {
  const t = useTranslations("workflowTemplates");
  const [keyword, setKeyword] = useState("");
  const categories = [...new Set([...JOB_CATEGORIES, ...categoryOptions, ...(value.categories ?? [])])].sort((a, b) => a.localeCompare(b));

  const addKeyword = () => {
    const k = keyword.trim();
    if (!k) return;
    const existing = value.titleKeywords ?? [];
    if (!existing.some((e) => e.toLowerCase() === k.toLowerCase())) onChange({ ...value, titleKeywords: [...existing, k] });
    setKeyword("");
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">{t("matchCategories")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <ToggleChip key={c} pressed={Boolean(value.categories?.includes(c))} onClick={() => onChange({ ...value, categories: toggle(value.categories, c) })} disabled={disabled}>
              {c}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t("matchEmploymentTypes")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EMPLOYMENT_TYPE_KEYS) as (keyof typeof EMPLOYMENT_TYPE_KEYS)[]).map((type) => (
              <ToggleChip key={type} pressed={Boolean(value.employmentTypes?.includes(type))} onClick={() => onChange({ ...value, employmentTypes: toggle(value.employmentTypes, type) })} disabled={disabled}>
                {t(EMPLOYMENT_TYPE_KEYS[type])}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t("matchWorkModes")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(WORK_MODE_KEYS) as (keyof typeof WORK_MODE_KEYS)[]).map((mode) => (
              <ToggleChip key={mode} pressed={Boolean(value.workModes?.includes(mode))} onClick={() => onChange({ ...value, workModes: toggle(value.workModes, mode) })} disabled={disabled}>
                {t(WORK_MODE_KEYS[mode])}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-keyword`} className="text-sm font-medium text-foreground">{t("matchTitleKeywords")}</label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-keyword`}
              value={keyword}
              maxLength={60}
              placeholder={t("matchTitleKeywordsPlaceholder")}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              disabled={disabled}
            />
            <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 gap-1" onClick={addKeyword} disabled={disabled || !keyword.trim()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("add")}
            </Button>
          </div>
          {(value.titleKeywords?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.titleKeywords?.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1">
                  {k}
                  <button
                    type="button"
                    className="rounded text-muted-foreground hover:text-foreground"
                    onClick={() => onChange({ ...value, titleKeywords: (value.titleKeywords ?? []).filter((x) => x !== k) })}
                    aria-label={t("removeKeyword", { keyword: k })}
                    disabled={disabled}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-experience`} className="text-sm font-medium text-foreground">{t("matchMinExperience")}</label>
          <Input
            id={`${idPrefix}-experience`}
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            value={value.minExperienceYears ?? ""}
            placeholder={t("matchMinExperiencePlaceholder")}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Math.max(0, Math.min(40, Math.round(Number(e.target.value))));
              onChange({ ...value, minExperienceYears: Number.isFinite(n) ? n : null });
            }}
            disabled={disabled}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("matchHint")}</p>
    </div>
  );
}
