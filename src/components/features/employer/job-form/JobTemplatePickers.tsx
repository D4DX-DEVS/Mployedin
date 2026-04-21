"use client";

import { useState } from "react";
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
  const { data: workflowTemplates, isLoading: wLoading } = useEmployerWorkflowTemplates();
  const { data: matchingTemplates, isLoading: mLoading } = useEmployerMatchingWeightTemplates();

  const [wOpen, setWOpen] = useState(false);
  const [mOpen, setMOpen] = useState(false);

  const selectedWorkflow = workflowTemplates?.find((t) => t._id === selectedWorkflowTemplateId);
  const selectedMatching = matchingTemplates?.find((t) => t._id === selectedMatchingWeightTemplateId);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Workflow Template Picker */}
      <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-sky-600" />
          Workflow Template
        </label>
        <p className="text-xs text-muted-foreground">
          Apply a hiring pipeline preset to this job
        </p>
        <button
          type="button"
          onClick={() => setWOpen(!wOpen)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
        >
          <span className={selectedWorkflow ? "text-foreground" : "text-muted-foreground"}>
            {selectedWorkflow ? selectedWorkflow.name : "Default (employer workflow)"}
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
                  <span className="text-muted-foreground">Default (employer workflow)</span>
                  {!selectedWorkflowTemplateId && <Check className="h-4 w-4 text-sky-600" />}
                </button>
                {workflowTemplates?.map((t) => (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() => { onWorkflowTemplateSelect(t); setWOpen(false); }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      <Badge variant={t.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                        {t.scope === "system" ? "System" : "Custom"}
                      </Badge>
                    </div>
                    {selectedWorkflowTemplateId === t._id && <Check className="h-4 w-4 text-sky-600" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {selectedWorkflow && (
          <div className="mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {selectedWorkflow.stages.filter((s) => s.enabled).length} stages · AI screen: {selectedWorkflow.settings.aiAutoScreen ? "on" : "off"} · Reject below: {selectedWorkflow.settings.autoRejectBelow}%
          </div>
        )}
      </div>

      {/* Matching Weight Template Picker */}
      <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4 text-sky-600" />
          Matching Weight Template
        </label>
        <p className="text-xs text-muted-foreground">
          Apply a candidate scoring preset to this job
        </p>
        <button
          type="button"
          onClick={() => setMOpen(!mOpen)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
        >
          <span className={selectedMatching ? "text-foreground" : "text-muted-foreground"}>
            {selectedMatching ? selectedMatching.name : "Default (employer weights)"}
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
                  <span className="text-muted-foreground">Default (employer weights)</span>
                  {!selectedMatchingWeightTemplateId && <Check className="h-4 w-4 text-sky-600" />}
                </button>
                {matchingTemplates?.map((t) => {
                  const keys = Object.keys(t.weights) as Array<keyof typeof t.weights>;
                  const topKey = keys.reduce((h, k) => (t.weights[k] > t.weights[h] ? k : h), keys[0]);
                  return (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => { onMatchingWeightTemplateSelect(t); setMOpen(false); }}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        <Badge variant={t.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                          {t.scope === "system" ? "System" : "Custom"}
                        </Badge>
                      </div>
                      {selectedMatchingWeightTemplateId === t._id && <Check className="h-4 w-4 text-sky-600" />}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {selectedMatching && (
          <div className="mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            Skills: {selectedMatching.weights.skills}% · Exp: {selectedMatching.weights.experience}% · Edu: {selectedMatching.weights.education}%
          </div>
        )}
      </div>
    </div>
  );
}
