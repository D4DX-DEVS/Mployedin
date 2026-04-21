"use client";

import { useCallback } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { motion } from "framer-motion";
import {
  ClipboardList,
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

const QUESTION_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Multiple Choice" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
] as const;

const NEEDS_OPTIONS = new Set(["select", "checkbox", "radio"]);

function generateId() {
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function Step5ScreeningQuestions() {
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
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Screening Questions
          </h2>
          <p className="text-sm text-muted-foreground">
            Add custom questions that applicants must answer when applying.
            This helps you filter candidates early.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-1 text-xs"
          >
            <ClipboardList className="mr-1 h-3 w-3" />
            {questions.length}/20 questions
          </Badge>
        </div>
      </div>

      {/* Question List */}
      <div className="space-y-4">
        {fields.map((field, index) => {
          const qType = questions[index]?.type ?? "text";
          const needsOptions = NEEDS_OPTIONS.has(qType);
          const fieldError = questionErrors[index];

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
                    Q{index + 1}
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
                    aria-label="Move up"
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
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                    aria-label="Remove question"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Question Label */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Question Text
                </Label>
                <Input
                  {...register(`screeningQuestions.${index}.label`)}
                  placeholder="e.g. Do you have a valid driving license?"
                  className="rounded-xl"
                />
                {fieldError?.label?.message && (
                  <p className="text-xs text-destructive">
                    {fieldError.label.message}
                  </p>
                )}
              </div>

              {/* Type + Required row */}
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Answer Type</Label>
                  <select
                    {...register(`screeningQuestions.${index}.type`)}
                    className="h-9 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    onChange={(e) => {
                      const newType = e.target.value;
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
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Placeholder</Label>
                  <Input
                    {...register(`screeningQuestions.${index}.placeholder`)}
                    placeholder="Optional placeholder text"
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
                    Required
                  </Label>
                </div>
              </div>

              {/* Options (for select/checkbox/radio) */}
              {needsOptions && (
                <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/10 p-3">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Options
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
                          placeholder={`Option ${optIdx + 1}`}
                          className="rounded-xl"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeOption(index, optIdx)}
                          aria-label="Remove option"
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
                    <Plus className="h-3 w-3" /> Add Option
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
          Add Screening Question
        </Button>
      )}

      {questions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No screening questions yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add questions to help filter applicants. This step is optional — you
            can skip it if not needed.
          </p>
        </div>
      )}
    </motion.div>
  );
}
