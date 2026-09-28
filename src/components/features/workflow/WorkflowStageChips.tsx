"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { STAGE_DOT_CLASS, STAGE_LABEL_KEYS } from "@/lib/hiring/pipeline";
import { isStockStage, type WorkflowStageDef } from "@/lib/hiring/workflowStages";
import type { MatchDimension, WorkflowResolutionReason } from "@/lib/hiring/workflowTemplateMatch";
import { cn } from "@/lib/utils";

type StageLike = Pick<WorkflowStageDef, "id" | "label" | "phase">;

/**
 * A stage's display name. Stock stages ("Shortlisted" on the shortlisted
 * status) translate; names a template gave its stages are shown as written.
 */
export function useStageLabel(): (stage: StageLike) => string {
  const tp = useTranslations("hiringPipeline");
  return useCallback((stage: StageLike) => (isStockStage(stage) ? tp(STAGE_LABEL_KEYS[stage.phase]) : stage.label), [tp]);
}

const DIMENSION_KEYS: Record<MatchDimension, string> = {
  category: "dimensionCategory",
  employmentType: "dimensionEmploymentType",
  workMode: "dimensionWorkMode",
  title: "dimensionTitle",
  experience: "dimensionExperience",
};

/** Why a job got its workflow, in words. */
export function useWorkflowReasonText(): (reason: WorkflowResolutionReason | null | undefined) => string {
  const t = useTranslations("workflowTemplates");
  return useCallback(
    (reason: WorkflowResolutionReason | null | undefined) => {
      if (!reason) return t("reasonStandard");
      if (reason.kind === "matched") {
        const parts = reason.dimensions.map((d) => t(DIMENSION_KEYS[d]));
        return parts.length ? t("reasonMatched", { parts: parts.join(", ") }) : t("reasonMatchedPlain");
      }
      if (reason.kind === "employer_default") return t("reasonEmployerDefault");
      if (reason.kind === "platform_default") return t("reasonPlatformDefault");
      return t("reasonStandard");
    },
    [t],
  );
}

interface WorkflowStageChipsProps {
  stages: readonly StageLike[];
  /** Accessible name for the list. */
  label?: string;
  className?: string;
}

/** The stages in order, each dotted with the colour of the status it runs under. */
export function WorkflowStageChips({ stages, label, className }: WorkflowStageChipsProps) {
  const stageLabel = useStageLabel();
  return (
    <ol className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label={label}>
      {stages.map((stage, index) => (
        <li key={stage.id} className="flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_DOT_CLASS[stage.phase])} aria-hidden="true" />
            {stageLabel(stage)}
          </span>
          {index < stages.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
