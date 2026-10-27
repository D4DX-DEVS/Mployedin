"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { AlertCircle, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { JobAssistantAskButton } from "@/components/features/jobs/ai-assistant/JobAssistantDock";
import type { JobFormValues } from "./jobFormSchema";

const MIN_CHARS = 20;
const MAX_CHARS = 5000;
const DESCRIPTION_SECTION_KEYS = [
  "roleSummary",
  "keyResponsibilities",
  "mustHave",
  "benefits",
] as const;

type DescriptionSectionKey = (typeof DESCRIPTION_SECTION_KEYS)[number];

interface DescriptionSection {
  key: DescriptionSectionKey;
  label: string;
  anchor: string;
  content: string;
}

/** Reusable list-input for structured optional fields (responsibilities, qualifications, benefits) */
function ListField({
  label,
  hint,
  fieldName,
  placeholder,
  maxItems,
  optionalLabel,
}: {
  label: string;
  hint: string;
  fieldName: "responsibilities" | "qualifications" | "benefits" | "learningOutcomes";
  placeholder: string;
  maxItems: number;
  optionalLabel: string;
}) {
  const { watch, setValue } = useFormContext<JobFormValues>();
  const [inputValue, setInputValue] = useState("");
  const items = watch(fieldName) ?? [];

  function addItem() {
    const trimmed = inputValue.trim();
    if (!trimmed || items.includes(trimmed) || items.length >= maxItems) return;
    setValue(fieldName, [...items, trimmed], { shouldValidate: true });
    setInputValue("");
  }

  function removeItem(index: number) {
    setValue(
      fieldName,
      items.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-background/60 card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {label} <span className="text-xs text-muted-foreground font-normal">({optionalLabel})</span>
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {items.length}/{maxItems}
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          className="flex-1 text-sm"
          maxLength={500}
        />
        <Button type="button" size="sm" variant="outline" onClick={addItem} className="px-3 shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 text-sm chip-pad"
            >
              <span className="mt-0.5 text-xs text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 text-foreground/90">{item}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Step2JobDetails() {
  const t = useTranslations("employerJobForm.step2");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const tAssist = useTranslations("jobAssistant.quick.description");
  const description = watch("description");

  const charCount = description?.length ?? 0;
  const descriptionStrength = charCount >= 600
    ? t("strength.strong")
    : charCount >= 250
      ? t("strength.good")
      : t("strength.needsDetail");

  const descriptionSections: DescriptionSection[] = DESCRIPTION_SECTION_KEYS.map((key) => ({
    key,
    label: t(`sections.${key}.label`),
    anchor: t(`sections.${key}.anchor`),
    content: t(`sections.${key}.content`),
  }));

  function insertSectionTemplate(section: DescriptionSection) {
    const currentValue = description?.trim() ?? "";
    if (currentValue.toLowerCase().includes(section.anchor.toLowerCase())) return;

    const nextValue = currentValue
      ? `${currentValue}\n\n${section.content}`
      : section.content;

    setValue("description", nextValue, { shouldValidate: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 sm:space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 lg:flex-row lg:items-center lg:justify-between card-pad">
        <div className="space-y-1">
          <h2 className="heading-section font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {descriptionStrength}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {t("characters", { count: charCount.toLocaleString(numberLocale) })}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {t("aiReady")}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.95fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-background shadow-sm card-pad">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("jobDescription")} <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("descriptionHint")}
              </p>
            </div>
            {/* A shortcut into the job's one AI assistant, not an AI of its own. */}
            <JobAssistantAskButton label={tAssist("label")} instruction={tAssist("instruction")} />
          </div>

          <div className="flex flex-wrap gap-2">
            {descriptionSections.map((section) => (
              <button
                key={section.label}
                type="button"
                onClick={() => insertSectionTemplate(section)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground"
              >
                + {section.label}
              </button>
            ))}
          </div>

          <Textarea
            id="description"
            {...register("description")}
            maxLength={MAX_CHARS}
            placeholder={t("placeholder")}
            rows={10}
            className={cn(
              "min-h-[260px] resize-y text-sm leading-6",
              errors.description && "border-destructive"
            )}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "description-error" : undefined}
          />

          <div className="flex items-center justify-between gap-3">
            {errors.description ? (
              <p id="description-error" className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3 h-3" />
                {errors.description.message}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                {charCount < MIN_CHARS
                  ? t("moreCharactersNeeded", { count: (MIN_CHARS - charCount).toLocaleString(numberLocale) })
                  : t("validHint")}
              </span>
            )}
            <span
              className={cn(
                "text-xs tabular-nums",
                charCount > MAX_CHARS * 0.9 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {charCount.toLocaleString(numberLocale)} / {MAX_CHARS.toLocaleString(numberLocale)}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-background shadow-sm card-pad">
            <p className="text-sm font-semibold text-foreground">{t("strongListingsTitle")}</p>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-muted/30 chip-pad">
                {t("strongListings.summary")}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 chip-pad">
                {t("strongListings.bullets")}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 chip-pad">
                {t("strongListings.impact")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured optional fields */}
      <ListField
        label={t("listFields.responsibilities.label")}
        hint={t("listFields.responsibilities.hint")}
        fieldName="responsibilities"
        placeholder={t("listFields.responsibilities.placeholder")}
        maxItems={20}
        optionalLabel={t("listFields.optional")}
      />
      <ListField
        label={t("listFields.qualifications.label")}
        hint={t("listFields.qualifications.hint")}
        fieldName="qualifications"
        placeholder={t("listFields.qualifications.placeholder")}
        maxItems={20}
        optionalLabel={t("listFields.optional")}
      />
      <ListField
        label={t("listFields.benefits.label")}
        hint={t("listFields.benefits.hint")}
        fieldName="benefits"
        placeholder={t("listFields.benefits.placeholder")}
        maxItems={20}
        optionalLabel={t("listFields.optional")}
      />
      <ListField
        label={t("listFields.learningOutcomes.label")}
        hint={t("listFields.learningOutcomes.hint")}
        fieldName="learningOutcomes"
        placeholder={t("listFields.learningOutcomes.placeholder")}
        maxItems={20}
        optionalLabel={t("listFields.optional")}
      />
    </motion.div>
  );
}
