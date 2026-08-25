"use client";

import { useCallback } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ClipboardList,
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { checkWording, SCREENING_QUESTION_RULES } from "@/lib/compliance/inclusiveWording";
import type { JobFormValues } from "./jobFormSchema";

const QUESTION_TYPES = [
  "text",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "number",
  "date",
] as const;

const NEEDS_OPTIONS = new Set(["select", "checkbox", "radio"]);

function generateId() {
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function Step5ScreeningQuestions() {
  const t = useTranslations("employerJobForm.step5");
  const tCompliance = useTranslations("employerCompliance.wording");
  const tChar = useTranslations("employerCompliance.characteristics");
  const tSuggest = useTranslations("employerCompliance.suggestions");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const maxQuestionsLabel = (20).toLocaleString(numberLocale);
  const {
    register,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "screeningQuestions",
  });

  const questions = watch("screeningQuestions") ?? [];

  const addQuestion = useCallback(() => {
    append({
      id: generateId(),
      label: "",
      type: "text",
      required: false,
      options: [],
      placeholder: "",
      order: fields.length,
    });
  }, [append, fields.length]);

  const moveUp = useCallback(
    (index: number) => {
      if (index > 0) move(index, index - 1);
    },
    [move]
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index < fields.length - 1) move(index, index + 1);
    },
    [move, fields.length]
  );

  const addOption = useCallback(
    (questionIndex: number) => {
      const current = questions[questionIndex]?.options ?? [];
      if (current.length >= 20) return;
      setValue(
        `screeningQuestions.${questionIndex}.options`,
        [...current, ""],
        { shouldValidate: true }
      );
    },
    [questions, setValue]
  );

  const removeOption = useCallback(
    (questionIndex: number, optionIndex: number) => {
      const current = questions[questionIndex]?.options ?? [];
      setValue(
        `screeningQuestions.${questionIndex}.options`,
        current.filter((_, i) => i !== optionIndex),
        { shouldValidate: true }
      );
    },
    [questions, setValue]
  );

  const questionErrors =
    (errors.screeningQuestions as Record<string, { label?: { message?: string } }> | undefined) ?? {};

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 sm:space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-1 text-xs"
          >
            <ClipboardList className="me-1 h-3 w-3" />
            {t("questionCount", {
              count: questions.length.toLocaleString(numberLocale),
              max: maxQuestionsLabel,
            })}
          </Badge>
        </div>
      </div>

      {/* Question List */}
      <div className="space-y-3 sm:space-y-4">
        {fields.map((field, index) => {
          const qType = questions[index]?.type ?? "text";
          const needsOptions = NEEDS_OPTIONS.has(qType);
          const fieldError = questionErrors[index];
          const protectedFlags = checkWording(
            questions[index]?.label ?? "",
            SCREENING_QUESTION_RULES
          );

          return (
            <div
              key={field.id}
              className={cn(
                "rounded-2xl border bg-background p-4 shadow-sm transition-colors",
                fieldError?.label
                  ? "border-destructive/40"
                  : "border-border/70"
              )}
            >
              {/* Question Header */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("questionLabel", { number: (index + 1).toLocaleString(numberLocale) })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    aria-label={t("moveUp")}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveDown(index)}
                    disabled={index === fields.length - 1}
                    aria-label={t("moveDown")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                    aria-label={t("removeQuestion")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Question Label */}
              <div className="space-y-2">
                <Label htmlFor={`sq-label-${field.id}`} className="text-sm font-medium">
                  {t("questionText")}
                </Label>
                <Input
                  id={`sq-label-${field.id}`}
                  {...register(`screeningQuestions.${index}.label`)}
                  placeholder={t("questionPlaceholder")}
                  className="rounded-xl"
                  aria-invalid={fieldError?.label?.message ? true : undefined}
                  aria-describedby={
                    [
                      fieldError?.label?.message ? `sq-error-${field.id}` : null,
                      protectedFlags.length > 0 ? `sq-warning-${field.id}` : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
                {fieldError?.label?.message && (
                  <p id={`sq-error-${field.id}`} className="text-xs text-destructive">
                    {t("questionRequired")}
                  </p>
                )}
                {/* Advisory only — asking for a protected characteristic is
                    sometimes justified, so this warns and never blocks. */}
                {protectedFlags.length > 0 && (
                  <div
                    id={`sq-warning-${field.id}`}
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
                  >
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {tCompliance("screeningWarning")}{" "}
                        <span className="font-normal">
                          ({protectedFlags.map((f) => tChar(f.characteristic)).join(", ")})
                        </span>
                      </p>
                      <p className="mt-0.5">{tSuggest(protectedFlags[0].suggestionKey)}</p>
                      <p className="mt-0.5">{tCompliance("screeningWarningAction")}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Type + Required row */}
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("answerType")}</Label>
                  <Select
                    value={questions[index]?.type ?? "text"}
                    onValueChange={(newType) => {
                      setValue(
                        `screeningQuestions.${index}.type` as const,
                        newType as JobFormValues["screeningQuestions"][number]["type"],
                        { shouldValidate: true }
                      );
                      // Clear options if type doesn't need them
                      if (!NEEDS_OPTIONS.has(newType)) {
                        setValue(
                          `screeningQuestions.${index}.options`,
                          [],
                          { shouldValidate: true }
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-auto rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((questionType) => (
                        <SelectItem key={questionType} value={questionType}>
                          {t(`types.${questionType}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("placeholder")}</Label>
                  <Input
                    {...register(`screeningQuestions.${index}.placeholder`)}
                    placeholder={t("placeholderText")}
                    className="w-48 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2 pb-1">
                  <Switch
                    checked={questions[index]?.required ?? false}
                    onCheckedChange={(val) =>
                      setValue(
                        `screeningQuestions.${index}.required`,
                        val,
                        { shouldValidate: true }
                      )
                    }
                  />
                  <Label className="text-sm text-muted-foreground">
                    {t("required")}
                  </Label>
                </div>
              </div>

              {/* Options (for select/checkbox/radio) */}
              {needsOptions && (
                <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/10 p-3">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t("options")}
                  </Label>
                  {(questions[index]?.options ?? []).map(
                    (_, optIdx) => (
                      <div
                        key={optIdx}
                        className="flex items-center gap-2"
                      >
                        <Input
                          {...register(
                            `screeningQuestions.${index}.options.${optIdx}`
                          )}
                          placeholder={t("optionPlaceholder", { number: optIdx + 1 })}
                          className="rounded-xl"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeOption(index, optIdx)}
                          aria-label={t("removeOption")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 gap-1 rounded-xl text-xs"
                    onClick={() => addOption(index)}
                    disabled={
                      (questions[index]?.options?.length ?? 0) >= 20
                    }
                  >
                    <Plus className="h-3 w-3" /> {t("addOption")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Question Button */}
      {questions.length < 20 && (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 rounded-2xl border-dashed py-6 text-muted-foreground hover:text-foreground"
          onClick={addQuestion}
        >
          <Plus className="h-4 w-4" />
          {t("addQuestion")}
        </Button>
      )}

      {questions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      )}
    </motion.div>
  );
}
