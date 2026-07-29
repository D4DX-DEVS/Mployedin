"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Scale, ChevronDown, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  useEmployerWorkflowTemplates,
  type WorkflowTemplateItem,
} from "@/hooks/useWorkflowTemplates";
import {
  useEmployerMatchingWeightTemplates,
  type MatchingWeightTemplateItem,
} from "@/hooks/useMatchingWeightTemplates";

interface JobTemplatePickersProps {
  selectedWorkflowTemplateId: string | null;
  selectedMatchingWeightTemplateId: string | null;
  onWorkflowTemplateSelect: (template: WorkflowTemplateItem | null) => void;
  onMatchingWeightTemplateSelect: (template: MatchingWeightTemplateItem | null) => void;
}

export function JobTemplatePickers({
  selectedWorkflowTemplateId,
  selectedMatchingWeightTemplateId,
  onWorkflowTemplateSelect,
  onMatchingWeightTemplateSelect,
}: JobTemplatePickersProps) {
  const t = useTranslations("employerJobForm.templates");
  const { data: workflowTemplates, isLoading: wLoading } = useEmployerWorkflowTemplates();
  const { data: matchingTemplates, isLoading: mLoading } = useEmployerMatchingWeightTemplates();

  const [wOpen, setWOpen] = useState(false);
  const [mOpen, setMOpen] = useState(false);

  const selectedWorkflow = workflowTemplates?.find((template) => template._id === selectedWorkflowTemplateId);
  const selectedMatching = matchingTemplates?.find((template) => template._id === selectedMatchingWeightTemplateId);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Workflow Template Picker */}
      <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-sky-600" />
          {t("workflowTemplate")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t("workflowHint")}
        </p>
        <button
          type="button"
          onClick={() => setWOpen(!wOpen)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
        >
          <span className={selectedWorkflow ? "text-foreground" : "text-muted-foreground"}>
            {selectedWorkflow ? selectedWorkflow.name : t("defaultWorkflow")}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${wOpen ? "rotate-180" : ""}`} />
        </button>

        {wOpen && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
            {wLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onWorkflowTemplateSelect(null); setWOpen(false); }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="text-muted-foreground">{t("defaultWorkflow")}</span>
                  {!selectedWorkflowTemplateId && <Check className="h-4 w-4 text-sky-600" />}
                </button>
                {workflowTemplates?.map((template) => (
                  <button
                    key={template._id}
                    type="button"
                    onClick={() => { onWorkflowTemplateSelect(template); setWOpen(false); }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <span>{template.name}</span>
                      <Badge variant={template.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                        {template.scope === "system" ? t("system") : t("custom")}
                      </Badge>
                    </div>
                    {selectedWorkflowTemplateId === template._id && <Check className="h-4 w-4 text-sky-600" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {selectedWorkflow && (
          <div className="mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {t("workflowSummary", {
              count: selectedWorkflow.stages.filter((s) => s.enabled).length,
              status: selectedWorkflow.settings.aiAutoScreen ? t("on") : t("off"),
              score: selectedWorkflow.settings.autoRejectBelow,
            })}
          </div>
        )}
      </div>

      {/* Matching Weight Template Picker */}
      <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4 text-sky-600" />
          {t("matchingWeightTemplate")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t("matchingHint")}
        </p>
        <button
          type="button"
          onClick={() => setMOpen(!mOpen)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
        >
          <span className={selectedMatching ? "text-foreground" : "text-muted-foreground"}>
            {selectedMatching ? selectedMatching.name : t("defaultWeights")}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${mOpen ? "rotate-180" : ""}`} />
        </button>

        {mOpen && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
            {mLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onMatchingWeightTemplateSelect(null); setMOpen(false); }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="text-muted-foreground">{t("defaultWeights")}</span>
                  {!selectedMatchingWeightTemplateId && <Check className="h-4 w-4 text-sky-600" />}
                </button>
                {matchingTemplates?.map((template) => (
                    <button
                      key={template._id}
                      type="button"
                      onClick={() => { onMatchingWeightTemplateSelect(template); setMOpen(false); }}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <span>{template.name}</span>
                        <Badge variant={template.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                          {template.scope === "system" ? t("system") : t("custom")}
                        </Badge>
                      </div>
                      {selectedMatchingWeightTemplateId === template._id && <Check className="h-4 w-4 text-sky-600" />}
                    </button>
                  ))}
              </>
            )}
          </div>
        )}

        {selectedMatching && (
          <div className="mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {t("weightSummary", {
              skills: selectedMatching.weights.skills,
              experience: selectedMatching.weights.experience,
              education: selectedMatching.weights.education,
            })}
          </div>
        )}
      </div>
    </div>
  );
}
