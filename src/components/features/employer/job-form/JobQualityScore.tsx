"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Lightbulb, CheckCircle2, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("employerJobForm.quality");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [expanded, setExpanded] = useState(false);

  const factors = useMemo((): ScoreFactor[] => {
    const title = values.title ?? "";
    const description = values.description ?? "";
    const skills = values.requirements?.skills ?? [];
    const country = values.location?.country ?? "";
    const city = values.location?.city ?? "";
    const salaryMin = values.salary?.min ?? 0;
    const salaryMax = values.salary?.max ?? 0;
    const expMax = values.requirements?.experienceMax ?? 0;

    return [
      {
        label: t("factors.title"),
        points: 15,
        earned: title.length >= 5,
        tip: t("tips.title"),
      },
      {
        label: t("factors.description"),
        points: 25,
        earned: description.length >= 100,
        tip: t("tips.description"),
      },
      {
        label: t("factors.location"),
        points: 10,
        earned: Boolean(country && city),
        tip: t("tips.location"),
      },
      {
        label: t("factors.skills"),
        points: 20,
        earned: skills.length >= 3,
        tip: t("tips.skills", { count: Math.max(0, 3 - skills.length).toLocaleString(numberLocale) }),
      },
      {
        label: t("factors.salary"),
        points: 20,
        earned: salaryMin > 0 && salaryMax > 0,
        tip: t("tips.salary"),
      },
      {
        label: t("factors.experience"),
        points: 10,
        earned: expMax > 0,
        tip: t("tips.experience"),
      },
    ];
  }, [numberLocale, t, values]);

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
            {t("title")}
          </div>
          <p className="text-xs text-muted-foreground">
            {score >= 80
              ? t("strong")
              : score >= 50
                ? t("good")
                : t("low")}
          </p>
        </div>
        <motion.span
          key={score}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn("text-2xl font-bold tabular-nums", scoreColor)}
        >
          {score.toLocaleString(numberLocale)}%
        </motion.span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
          {t("checksComplete", {
            completed: completedCount.toLocaleString(numberLocale),
            total: factors.length.toLocaleString(numberLocale),
          })}
        </Badge>
        {score >= 80 ? (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] text-emerald-700">
            {t("readyToPublish")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
            {t("improveFirst")}
          </Badge>
        )}
      </div>

      <Progress
        value={score}
        className={cn("h-2 bg-muted", progressColor)}
      />

      {pending.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            {t("bestNext")}
            <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden space-y-2"
              >
                {pending.map((factor) => (
                  <div
                    key={factor.label}
                    className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
                  >
                    <span className="shrink-0 font-semibold text-primary">
                      +{factor.points.toLocaleString(numberLocale)}%
                    </span>
                    <span className="text-muted-foreground">{factor.tip}</span>
                  </div>
                ))}
                {incompleteFactors.length > pending.length && (
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t("moreImprovements", { count: (incompleteFactors.length - pending.length).toLocaleString(numberLocale) })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
