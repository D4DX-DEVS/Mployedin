"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIPELINE_STAGES, STAGE_DOT_CLASS, STAGE_LABEL_KEYS, type PipelineStage } from "@/lib/hiring/pipeline";
import {
  MAX_WORKFLOW_STAGES,
  STAGE_LABEL_MAX,
  validateWorkflowStageDefs,
  type StageListProblem,
  type WorkflowStageDef,
} from "@/lib/hiring/workflowStages";
import { cn } from "@/lib/utils";
import { useStageLabel } from "./WorkflowStageChips";

export type StageDraft = Pick<WorkflowStageDef, "id" | "label" | "phase">;

const PROBLEM_KEYS: Record<StageListProblem, string> = {
  too_few: "problemTooFew",
  too_many: "problemTooMany",
  first_not_applied: "problemFirstNotApplied",
  no_hired: "problemNoHired",
  phase_backwards: "problemBackwards",
  duplicate_id: "problemDuplicate",
  bad_id: "problemDuplicate",
  empty_label: "problemEmptyLabel",
};

/** A fresh id that never changes with the name, so candidates in the stage stay put. */
function newStageId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Drafts edit the STORED names: a stock stage keeps "Shortlisted" as written,
 * so it goes on translating by status for everyone who reads it later.
 */
export function toStageDrafts(stages: readonly StageDraft[]): StageDraft[] {
  return stages.map((s) => ({ id: s.id, phase: s.phase, label: s.label }));
}

export function stageProblems(stages: readonly StageDraft[]): StageListProblem[] {
  return validateWorkflowStageDefs(stages);
}

interface WorkflowStageEditorProps {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  idPrefix: string;
  disabled?: boolean;
}

/**
 * Edit a workflow's stages: a name per stage and the application status it
 * runs under. Order follows the pipeline — the editor flags a stage filed
 * before the one above it instead of silently reordering.
 */
export function WorkflowStageEditor({ stages, onChange, idPrefix, disabled }: WorkflowStageEditorProps) {
  const t = useTranslations("workflowTemplates");
  const tp = useTranslations("hiringPipeline");
  const stageLabel = useStageLabel();
  const problems = stageProblems(stages);

  const update = (index: number, patch: Partial<StageDraft>) =>
    onChange(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const remove = (index: number) => onChange(stages.filter((_, i) => i !== index));
  const add = () => {
    const last = stages[stages.length - 1];
    // A new stage lands before Hired, under the status of the stage above it.
    const hiredAt = stages.findIndex((s) => s.phase === "hired");
    const insertAt = hiredAt > -1 ? hiredAt : stages.length;
    const phase: PipelineStage = stages[insertAt - 1]?.phase ?? last?.phase ?? "applied";
    const next = [...stages];
    next.splice(insertAt, 0, { id: newStageId(), label: "", phase });
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {stages.map((stage, index) => {
          const labelId = `${idPrefix}-stage-${index}-name`;
          const phaseId = `${idPrefix}-stage-${index}-status`;
          const backwards = index > 0 && PIPELINE_STAGES.indexOf(stage.phase) < PIPELINE_STAGES.indexOf(stages[index - 1].phase);
          return (
            <li
              key={stage.id}
              className={cn(
                "grid gap-2 rounded-xl border bg-background/80 p-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_11rem_auto] sm:items-center",
                backwards ? "border-destructive/60" : "border-border",
              )}
            >
              <span className="hidden text-center text-xs font-semibold text-muted-foreground sm:block" aria-hidden="true">
                {index + 1}
              </span>
              <div className="min-w-0">
                <label htmlFor={labelId} className="sr-only">{t("stageNameLabel", { index: index + 1 })}</label>
                <Input
                  id={labelId}
                  value={stage.label}
                  maxLength={STAGE_LABEL_MAX}
                  placeholder={t("stageNamePlaceholder")}
                  onChange={(e) => update(index, { label: e.target.value })}
                  disabled={disabled}
                  aria-invalid={!stage.label.trim() || undefined}
                />
              </div>
              <div>
                <label htmlFor={phaseId} className="sr-only">{t("stageStatusLabel", { stage: stage.label || stageLabel(stage) })}</label>
                <Select value={stage.phase} onValueChange={(v) => update(index, { phase: v as PipelineStage })} disabled={disabled}>
                  <SelectTrigger id={phaseId} className="w-full" aria-label={t("stageStatusLabel", { stage: stage.label || stageLabel(stage) })}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((phase) => (
                      <SelectItem key={phase} value={phase}>
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", STAGE_DOT_CLASS[phase])} aria-hidden="true" />
                          {tp(STAGE_LABEL_KEYS[phase])}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label={t("moveStageUp", { stage: stage.label || index + 1 })}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => move(index, 1)} disabled={disabled || index === stages.length - 1} aria-label={t("moveStageDown", { stage: stage.label || index + 1 })}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(index)} disabled={disabled || stages.length <= 2} aria-label={t("removeStage", { stage: stage.label || index + 1 })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={add} disabled={disabled || stages.length >= MAX_WORKFLOW_STAGES}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("addStage")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("stageStatusHint")}</p>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {[...new Set(problems.map((p) => PROBLEM_KEYS[p]))].map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
