"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readJobRequirements, type JobRequirementsDoc } from "@/lib/matching/jobRequirements";
import { seekerEvidenceFromDoc, type SeekerEvidenceDoc } from "@/lib/matching/seekerEvidence";

/**
 * The apply flow's education question (decided 2026-11-12, D11): asked only
 * when the job sets a minimum education and the seeker's profile shows no
 * qualification the matcher can read. The answer is added to their profile
 * before the application is sent, so the employer's report reads "Has" or
 * "Partly" instead of "Needs checking". Skipping is always allowed.
 */

export interface EducationAnswer {
  level: string;
  field: string;
}

/** Stored in English, the words lib/matching/educationLevel.ts reads. */
const DEGREE_FOR_LEVEL: Record<string, string> = {
  "1": "Higher Secondary (12th)",
  "2": "Diploma",
  "3": "Bachelor's degree",
  "4": "Master's degree",
  "5": "Doctorate",
};

/** What the job asks, when it should be asked about at all; null otherwise. */
export function educationAsk(
  job: JobRequirementsDoc | null | undefined,
  seeker: SeekerEvidenceDoc | null | undefined,
): { level: number; text: string } | null {
  if (!job || !seeker) return null;
  const asked = readJobRequirements(job).education;
  if (asked.level <= 0) return null;
  if (seekerEvidenceFromDoc(seeker).level > 0) return null;
  return { level: asked.level, text: asked.text };
}

/** The profile's education list with the answer added; never drops what was there. */
export function educationWithAnswer(
  existing: ReadonlyArray<Record<string, unknown>>,
  answer: EducationAnswer,
): Array<Record<string, unknown>> {
  const degree = DEGREE_FOR_LEVEL[answer.level];
  if (!degree) return [...existing];
  const field = answer.field.trim();
  return [...existing, { degree, ...(field ? { field } : {}) }];
}

interface Props {
  ask: { level: number; text: string };
  value: EducationAnswer;
  onChange: (next: EducationAnswer) => void;
}

export function ApplyEducationStep({ ask, value, onChange }: Props) {
  const t = useTranslations("jobFeed.applyFlow.education");
  const tLevels = useTranslations("jobRequirementExtras.education.levels");
  const ids = useId();
  const asked = ask.text || tLevels(String(ask.level) as "1" | "2" | "3" | "4" | "5");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("asks", { asked })}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${ids}-level`} className="text-sm font-medium">
          {t("levelLabel")}
        </Label>
        <Select value={value.level || undefined} onValueChange={(level) => onChange({ ...value, level })}>
          <SelectTrigger id={`${ids}-level`} className="min-h-11 sm:min-h-10">
            <SelectValue placeholder={t("levelPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {(["1", "2", "3", "4", "5"] as const).map((level) => (
              <SelectItem key={level} value={level}>
                {tLevels(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.level && value.level !== "1" && (
        <div className="space-y-2">
          <Label htmlFor={`${ids}-field`} className="text-sm font-medium">
            {t("fieldLabel")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input
            id={`${ids}-field`}
            maxLength={200}
            value={value.field}
            placeholder={t("fieldPlaceholder")}
            onChange={(e) => onChange({ ...value, field: e.target.value })}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("skipHint")}</p>
    </div>
  );
}
