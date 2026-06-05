"use client";

import { useFormContext } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkillsChips, type Skill } from "@/components/shared/SkillsChips";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

interface Step3RequirementsProps {
  /** Suggested skills from Step 1 AI fetch */
  suggestedSkills?: string[];
}

const EXPERIENCE_PRESETS = [
  { min: 0, max: 2 },
  { min: 1, max: 3 },
  { min: 3, max: 5 },
  { min: 5, max: 8 },
  { min: 8, max: 12 },
] as const;

export function Step3Requirements({ suggestedSkills = [] }: Step3RequirementsProps) {
  const t = useTranslations("employerJobForm.step3");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const {
    watch,
    setValue,
    register,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const rawSkills = watch("requirements.skills") ?? [];
  const rawPreferredSkills = watch("requirements.preferredSkills") ?? [];
  const expMin = watch("requirements.experienceMin");
  const expMax = watch("requirements.experienceMax");
  const maxSkillsLabel = (30).toLocaleString(numberLocale);

  // Bridge between string[] (form) and Skill[] (SkillsChips)
  const skillObjects: Skill[] = rawSkills.map((name) => ({ name }));
  const preferredSkillObjects: Skill[] = rawPreferredSkills.map((name) => ({ name }));

  function handleSkillsChange(skills: Skill[]) {
    setValue(
      "requirements.skills",
      skills.map((s) => s.name),
      { shouldValidate: true }
    );
  }

  function handlePreferredSkillsChange(skills: Skill[]) {
    setValue(
      "requirements.preferredSkills",
      skills.map((s) => s.name),
      { shouldValidate: true }
    );
  }

  function addSuggestedSkill(skill: string) {
    if (rawSkills.includes(skill)) return;
    setValue("requirements.skills", [...rawSkills, skill], { shouldValidate: true });
  }

  // Quick-add chips: suggested skills not yet added
  const quickAddChips = suggestedSkills
    .filter((s) => !rawSkills.map((r) => r.toLowerCase()).includes(s.toLowerCase()))
    .slice(0, 8);
  const skillsStatus = rawSkills.length >= 6 ? t("status.wellDefined") : rawSkills.length >= 3 ? t("status.goodStart") : t("status.addCore");

  function applyExperiencePreset(min: number, max: number) {
    setValue("requirements.experienceMin", min, { shouldValidate: true });
    setValue("requirements.experienceMax", max, { shouldValidate: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {skillsStatus}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {t("skillsAdded", { count: rawSkills.length.toLocaleString(numberLocale) })}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {t("experienceBadge", {
              min: (expMin ?? 0).toLocaleString(numberLocale),
              max: (expMax ?? 0).toLocaleString(numberLocale),
            })}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.9fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("requiredSkills")}</p>
              <p className="text-xs text-muted-foreground">
                {t("requiredSkillsHint")}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {rawSkills.length.toLocaleString(numberLocale)}/{maxSkillsLabel}
            </Badge>
          </div>

          <SkillsChips
            label=""
            value={skillObjects}
            onChange={handleSkillsChange}
            maxSkills={30}
            showLevels={false}
            enableAISuggest={false}
            placeholder={t("requiredSkillsPlaceholder")}
          />

          {quickAddChips.length > 0 && (
            <div className="space-y-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">{t("suggestedFromAi")}</span>
                <span>{t("clickToAdd")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickAddChips.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => addSuggestedSkill(skill)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs text-primary transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    + {skill}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rawSkills.length >= 30 && (
            <p className="text-xs text-muted-foreground">{t("maxSkillsReached")}</p>
          )}
        </div>

        {/* Preferred / Nice-to-have Skills */}
        <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-background/60 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("preferredSkills")} <span className="text-xs text-muted-foreground font-normal">({t("optional")})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t("preferredSkillsHint")}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {rawPreferredSkills.length.toLocaleString(numberLocale)}/{maxSkillsLabel}
            </Badge>
          </div>

          <SkillsChips
            label=""
            value={preferredSkillObjects}
            onChange={handlePreferredSkillsChange}
            maxSkills={30}
            showLevels={false}
            enableAISuggest={false}
            placeholder={t("preferredSkillsPlaceholder")}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div>
            <Label className="text-sm font-semibold">{t("experienceRange")}</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("experienceHint")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-min" className="text-xs text-muted-foreground">
                {t("minimumYears")}
              </Label>
              <Input
                id="exp-min"
                type="number"
                min={0}
                max={50}
                {...register("requirements.experienceMin", { valueAsNumber: true })}
                className={cn(errors.requirements?.experienceMin && "border-destructive")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-max" className="text-xs text-muted-foreground">
                {t("maximumYears")}
              </Label>
              <Input
                id="exp-max"
                type="number"
                min={0}
                max={50}
                {...register("requirements.experienceMax", { valueAsNumber: true })}
                className={cn(errors.requirements?.experienceMax && "border-destructive")}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXPERIENCE_PRESETS.map((preset) => (
              <button
                key={`${preset.min}-${preset.max}`}
                type="button"
                onClick={() => applyExperiencePreset(preset.min, preset.max)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground"
              >
                  {t("experienceBadge", {
                    min: preset.min.toLocaleString(numberLocale),
                    max: preset.max.toLocaleString(numberLocale),
                  })}
              </button>
            ))}
          </div>

          {(expMin > 0 || expMax > 0) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-border/70 bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("candidateFitRange")}</span>
                <span className="font-medium text-foreground">
                  {t("experienceBadge", {
                    min: expMin.toLocaleString(numberLocale),
                    max: expMax.toLocaleString(numberLocale),
                  })}
                </span>
              </div>
              <div className="relative mt-3 h-1.5 rounded-full bg-border">
                <div
                  className="absolute h-full rounded-full bg-primary transition-all"
                  style={{
                    left: `${Math.min((expMin / 50) * 100, 100)}%`,
                    right: `${Math.max(100 - (expMax / 50) * 100, 0)}%`,
                  }}
                />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
