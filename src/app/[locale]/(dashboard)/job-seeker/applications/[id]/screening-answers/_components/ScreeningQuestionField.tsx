"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";

/** A job's screening question as the Job model stores it (Job.screeningQuestions). */
export interface ScreeningQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export type ScreeningAnswer = string | string[];

/** True when a required question still has no answer. */
export function isUnanswered(answer: ScreeningAnswer | undefined): boolean {
  return Array.isArray(answer) ? answer.length === 0 : !answer?.trim();
}

interface ScreeningQuestionFieldProps {
  question: ScreeningQuestion;
  index: number;
  value: ScreeningAnswer | undefined;
  invalid: boolean;
  onChange: (value: ScreeningAnswer) => void;
}

/**
 * One question on the seeker's screening-answers page. Draws every type the
 * job form can create — the same set the apply flow answers.
 */
export function ScreeningQuestionField({ question, index, value, invalid, onChange }: ScreeningQuestionFieldProps) {
  const t = useTranslations("screeningQuestions");
  const fieldId = `sq-${question.id}`;
  const text = typeof value === "string" ? value : "";
  const picked = Array.isArray(value) ? value : [];
  const options = question.options ?? [];

  return (
    <fieldset className="space-y-3 border-b pb-6 last:border-b-0" aria-invalid={invalid || undefined}>
      <legend className="mb-3 text-sm font-medium text-foreground">
        {index + 1}. {question.label}
        {question.required && <span className="ms-1 text-destructive">*</span>}
      </legend>

      {question.type === "text" && (
        <Input id={fieldId} aria-label={question.label} value={text} placeholder={question.placeholder ?? ""} maxLength={500} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "textarea" && (
        <Textarea id={fieldId} aria-label={question.label} value={text} placeholder={question.placeholder ?? ""} maxLength={2000} rows={4} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "number" && (
        <Input id={fieldId} aria-label={question.label} type="number" inputMode="numeric" min={0} value={text} placeholder={question.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "date" && <DateTimePicker mode="date" value={text} onChange={(next) => onChange(next)} />}

      {question.type === "select" && (
        <Select value={text} onValueChange={(next) => onChange(next)}>
          <SelectTrigger id={fieldId} aria-label={question.label} className="w-full">
            <SelectValue placeholder={question.placeholder || t("chooseOption")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.type === "radio" && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const on = text === opt;
            return (
              <label
                key={opt}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
                  on ? "border-primary bg-primary/10 font-medium text-primary" : "border-input hover:bg-accent"
                }`}
              >
                <input type="radio" name={fieldId} value={opt} checked={on} onChange={() => onChange(opt)} className="sr-only" />
                {on && <Check className="size-4" aria-hidden />}
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "checkbox" && (
        <div className="space-y-2">
          {options.length > 0 ? (
            options.map((opt) => (
              <label key={opt} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(opt)}
                  onChange={(e) => onChange(e.target.checked ? [...picked, opt] : picked.filter((o) => o !== opt))}
                  className="accent-primary"
                />
                {opt}
              </label>
            ))
          ) : (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={text === "yes"} onChange={(e) => onChange(e.target.checked ? "yes" : "")} className="accent-primary" />
              {t("yes")}
            </label>
          )}
        </div>
      )}

      {invalid && <p className="text-sm text-destructive">{t("answerRequired")}</p>}
    </fieldset>
  );
}
