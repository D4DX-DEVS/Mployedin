"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUALIFICATION_OPTIONS, DEGREE_LEVELS } from "@/lib/onboarding/qualifications";
import { emptyEducation, type BuiltEducation } from "./types";

interface EducationStepProps {
  education: BuiltEducation[];
  onChange: (next: BuiltEducation[]) => void;
}

const MAX_ENTRIES = 8;
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => String(THIS_YEAR + 6 - i));

function YearSelect({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-10"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-64">
        {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Every school and college, each with its years — higher secondary, diploma, degree… */
export function EducationStep({ education, onChange }: EducationStepProps) {
  const t = useTranslations("cvWizard.education");
  const list = education.length ? education : [emptyEducation()];
  const update = (i: number, patch: Partial<BuiltEducation>) => onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-4">
      {list.map((e, i) => {
        const degree = DEGREE_LEVELS.includes(e.level);
        return (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">{t("entryN", { n: i + 1 })}</p>
              {list.length > 1 && (
                <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> {t("remove")}
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`cvw-edu-level-${i}`}>{t("level")}</Label>
                <Select value={e.level} onValueChange={(v) => update(i, { level: v })}>
                  <SelectTrigger id={`cvw-edu-level-${i}`} className="h-10"><SelectValue placeholder={t("levelPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {QUALIFICATION_OPTIONS.map((q) => <SelectItem key={q.value} value={q.value}>{t(`levels.${q.value}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cvw-edu-course-${i}`}>{degree ? t("course") : t("stream")}</Label>
                <Input id={`cvw-edu-course-${i}`} value={e.course} onChange={(ev) => update(i, { course: ev.target.value })}
                  placeholder={degree ? t("coursePlaceholder") : t("streamPlaceholder")} />
              </div>
              {degree && (
                <div className="space-y-1.5">
                  <Label htmlFor={`cvw-edu-field-${i}`}>{t("field")}</Label>
                  <Input id={`cvw-edu-field-${i}`} value={e.field} onChange={(ev) => update(i, { field: ev.target.value })} placeholder={t("fieldPlaceholder")} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`cvw-edu-inst-${i}`}>{degree ? t("institution") : t("school")}</Label>
                <Input id={`cvw-edu-inst-${i}`} value={e.institution} onChange={(ev) => update(i, { institution: ev.target.value })}
                  placeholder={degree ? t("institutionPlaceholder") : t("schoolPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cvw-edu-start-${i}`}>{t("startYear")}</Label>
                <YearSelect id={`cvw-edu-start-${i}`} value={e.startYear} onChange={(v) => update(i, { startYear: v })} placeholder={t("year")} />
              </div>
              {!e.studying && (
                <div className="space-y-1.5">
                  <Label htmlFor={`cvw-edu-end-${i}`}>{t("endYear")}</Label>
                  <YearSelect id={`cvw-edu-end-${i}`} value={e.endYear} onChange={(v) => update(i, { endYear: v })} placeholder={t("year")} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`cvw-edu-grade-${i}`}>{t("grade")}</Label>
                <Input id={`cvw-edu-grade-${i}`} value={e.grade} maxLength={40} onChange={(ev) => update(i, { grade: ev.target.value })} placeholder={t("gradePlaceholder")} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={e.studying} onCheckedChange={(v) => update(i, { studying: v === true, endYear: "" })} />
              {t("studying")}
            </label>
          </div>
        );
      })}
      {list.length < MAX_ENTRIES && (
        <Button type="button" variant="outline" className="min-h-11 w-full gap-2" onClick={() => onChange([...list, emptyEducation()])}>
          <Plus className="h-4 w-4" /> {t("add")}
        </Button>
      )}
    </div>
  );
}
