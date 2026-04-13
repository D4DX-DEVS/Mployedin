"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Lightbulb, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

interface ScoreFactor {
  label: string;
  points: number;
  earned: boolean;
  tip: string;
}

interface JobQualityScoreProps {
  values: Partial<JobFormValues>;
}

export function JobQualityScore({ values }: JobQualityScoreProps) {
  const factors = useMemo((): ScoreFactor[] => {
    const title = values.title ?? "";
    const description = values.description ?? "";
    const skills = values.requirements?.skills ?? [];
    const country = values.location?.country ?? "";
    const city = values.location?.city ?? "";
    const salaryMin = values.salary?.min ?? 0;
    const salaryMax = values.salary?.max ?? 0;
    const expMin = values.requirements?.experienceMin ?? 0;
    const expMax = values.requirements?.experienceMax ?? 0;

    return [
      {
        label: "Job Title",
        points: 15,
        earned: title.length >= 5,
        tip: "Add a clear, specific job title (+15%)",
      },
      {
        label: "Description",
        points: 25,
        earned: description.length >= 100,
        tip: `Description is short — aim for 100+ characters (+25%)`,
      },
      {
        label: "Location",
        points: 10,
        earned: Boolean(country && city),
        tip: "Add country + city to attract local candidates (+10%)",
      },
      {
        label: "Skills",
        points: 20,
        earned: skills.length >= 3,
        tip: `Add ${Math.max(0, 3 - skills.length)} more skill${3 - skills.length === 1 ? "" : "s"} (+20%)`,
      },
      {
        label: "Salary Range",
        points: 20,
        earned: salaryMin > 0 && salaryMax > 0,
        tip: "Add salary range — 3× more applicants (+20%)",
      },
      {
        label: "Experience Range",
        points: 10,
        earned: expMax > 0,
        tip: "Specify experience range (+10%)",
      },
    ];
  }, [values]);

  const score = factors.reduce((sum, f) => sum + (f.earned ? f.points : 0), 0);
  const incompleteFactors = factors.filter((f) => !f.earned);
  const completedCount = factors.length - incompleteFactors.length;
  const pending = incompleteFactors.slice(0, 2);

  const scoreColor =
    score >= 80
      ? "text-green-600"
      : score >= 50
        ? "text-yellow-600"
        : "text-orange-500";

  const progressColor =
    score >= 80
      ? "[&>div]:bg-green-500"
      : score >= 50
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-orange-500";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-gradient-to-br from-background via-background to-primary/[0.04] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="w-4 h-4 text-primary" />
            Listing Health
          </div>
          <p className="text-xs text-muted-foreground">
            {score >= 80
              ? "Strong listing - ready to stand out"
              : score >= 50
                ? "Good base - a few edits will lift visibility"
                : "Low detail so far - finish the essentials first"}
          </p>
        </div>
        <motion.span
          key={score}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn("text-2xl font-bold tabular-nums", scoreColor)}
        >
          {score}%
        </motion.span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
          {completedCount}/{factors.length} checks complete
        </Badge>
        {score >= 80 ? (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] text-emerald-700">
            Ready to publish
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
            Improve the essentials first
          </Badge>
        )}
      </div>

      <Progress
        value={score}
        className={cn("h-2 bg-muted", progressColor)}
      />

      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Lightbulb className="w-3.5 h-3.5" />
            Best next improvements
          </div>
          {pending.map((factor) => (
            <motion.div
              key={factor.label}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
            >
              <span className="shrink-0 font-semibold text-primary">
                +{factor.points}%
              </span>
              <span className="text-muted-foreground">{factor.tip}</span>
            </motion.div>
          ))}
          {incompleteFactors.length > pending.length && (
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {incompleteFactors.length - pending.length} more improvement
              {incompleteFactors.length - pending.length === 1 ? " remains" : "s remain"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
