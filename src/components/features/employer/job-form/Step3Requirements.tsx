"use client";

import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillsChips, type Skill } from "@/components/shared/SkillsChips";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

interface Step3RequirementsProps {
  /** Suggested skills from Step 1 AI fetch */
  suggestedSkills?: string[];
}

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

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">Requirements</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define the skills and experience your ideal candidate should have.
        </p>
      </div>

      {/* Skills */}
      <div className="space-y-3">
        <SkillsChips
          label="Required Skills"
          value={skillObjects}
          onChange={handleSkillsChange}
          maxSkills={30}
          showLevels={false}
          enableAISuggest={false}
          placeholder="Type a skill and press Enter (e.g. React, Python)"
        />

        {/* Quick-add suggested chips */}
        {quickAddChips.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">Suggested from AI</span>
              <span>— click to add</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickAddChips.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => addSuggestedSkill(skill)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary transition-colors"
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

      {/* Experience Range */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Experience Range</Label>
        <div className="grid grid-cols-2 gap-4">
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

        {/* Visual experience bar */}
        {(expMin > 0 || expMax > 0) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg"
          >
            <div className="w-full bg-border rounded-full h-1.5 relative">
              <div
                className="absolute h-full bg-primary rounded-full transition-all"
                style={{
                  left: `${Math.min((expMin / 50) * 100, 100)}%`,
                  right: `${Math.max(100 - (expMax / 50) * 100, 0)}%`,
                }}
              />
            </div>
            <span className="whitespace-nowrap text-xs font-medium">
              {expMin}–{expMax} yrs
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
