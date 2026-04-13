"use client";

import { useFormContext } from "react-hook-form";
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
  { label: "0-2 yrs", min: 0, max: 2 },
  { label: "1-3 yrs", min: 1, max: 3 },
  { label: "3-5 yrs", min: 3, max: 5 },
  { label: "5-8 yrs", min: 5, max: 8 },
  { label: "8+ yrs", min: 8, max: 12 },
] as const;

export function Step3Requirements({ suggestedSkills = [] }: Step3RequirementsProps) {
  const {
    watch,
    setValue,
    register,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const rawSkills = watch("requirements.skills") ?? [];
  const expMin = watch("requirements.experienceMin");
  const expMax = watch("requirements.experienceMax");

  // Bridge between string[] (form) and Skill[] (SkillsChips)
  const skillObjects: Skill[] = rawSkills.map((name) => ({ name }));

  function handleSkillsChange(skills: Skill[]) {
    setValue(
      "requirements.skills",
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
  const skillsStatus = rawSkills.length >= 6 ? "Well defined" : rawSkills.length >= 3 ? "Good start" : "Add core skills";

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
          <h2 className="text-lg font-semibold text-foreground">Requirements</h2>
          <p className="text-sm text-muted-foreground">
            Define the must-have skills and experience so the right people self-select early.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {skillsStatus}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {rawSkills.length} skills added
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {expMin ?? 0}–{expMax ?? 0} yrs
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.9fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Required Skills</p>
              <p className="text-xs text-muted-foreground">
                Add the skills candidates truly need on day one. Use 5 to 8 strong signals where possible.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {rawSkills.length}/30
            </Badge>
          </div>

          <SkillsChips
            label=""
            value={skillObjects}
            onChange={handleSkillsChange}
            maxSkills={30}
            showLevels={false}
            enableAISuggest={false}
            placeholder="Type a skill and press Enter (e.g. React, Python)"
          />

          {quickAddChips.length > 0 && (
            <div className="space-y-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">Suggested from AI</span>
                <span>Click to add</span>
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
            <p className="text-xs text-muted-foreground">Maximum 30 skills reached.</p>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div>
            <Label className="text-sm font-semibold">Experience Range</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Set a realistic range so strong candidates are not filtered out unnecessarily.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-min" className="text-xs text-muted-foreground">
                Minimum (years)
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
                Maximum (years)
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
                key={preset.label}
                type="button"
                onClick={() => applyExperiencePreset(preset.min, preset.max)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground"
              >
                {preset.label}
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
                <span>Candidate fit range</span>
                <span className="font-medium text-foreground">{expMin}–{expMax} yrs</span>
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
