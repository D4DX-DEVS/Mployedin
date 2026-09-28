"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkflowStageEditor, stageProblems, toStageDrafts, type StageDraft } from "@/components/features/workflow/WorkflowStageEditor";
import { DEFAULT_WORKFLOW_STAGE_DEFS } from "@/lib/hiring/workflowStages";
import type { WorkflowTemplateMatchRules } from "@/lib/hiring/workflowTemplateMatch";
import {
  useCreateAdminWorkflowTemplate,
  useUpdateAdminWorkflowTemplate,
  type WorkflowTemplateItem,
} from "@/hooks/useWorkflowTemplates";
import { MatchRulesEditor } from "./MatchRulesEditor";

interface FormState {
  name: string;
  description: string;
  stages: StageDraft[];
  match: WorkflowTemplateMatchRules;
  priority: number;
  isDefault: boolean;
}

function formFrom(template: WorkflowTemplateItem | null): FormState {
  return template
    ? {
        name: template.name,
        description: template.description,
        stages: toStageDrafts(template.stages),
        match: { ...template.match },
        priority: template.priority,
        isDefault: template.isDefault,
      }
    : {
        name: "",
        description: "",
        stages: toStageDrafts(DEFAULT_WORKFLOW_STAGE_DEFS),
        match: {},
        priority: 0,
        isDefault: false,
      };
}

interface TemplateEditorDialogProps {
  open: boolean;
  /** Null = create. */
  template: WorkflowTemplateItem | null;
  categoryOptions: readonly string[];
  onClose: () => void;
}

export function TemplateEditorDialog({ open, template, categoryOptions, onClose }: TemplateEditorDialogProps) {
  const t = useTranslations("workflowTemplates");
  const tr = useTranslations("adminWorkflowTemplates");
  const createMut = useCreateAdminWorkflowTemplate();
  const updateMut = useUpdateAdminWorkflowTemplate();
  const [form, setForm] = useState<FormState>(() => formFrom(template));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(formFrom(template));
      setError(null);
    }
  }, [open, template]);

  const saving = createMut.isPending || updateMut.isPending;
  const problems = stageProblems(form.stages);
  const canSave = form.name.trim().length > 0 && problems.length === 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      stages: form.stages.map((s) => ({ id: s.id, label: s.label.trim(), phase: s.phase })),
      match: form.match,
      priority: form.priority,
      isDefault: form.isDefault,
      isActive: template?.isActive ?? true,
    };
    try {
      if (template) await updateMut.mutateAsync({ id: template._id, ...payload });
      else await createMut.mutateAsync(payload);
      toast.success(template ? t("templateUpdated", { name: payload.name }) : t("templateCreated", { name: payload.name }));
      onClose();
    } catch {
      setError(t("saveTemplateError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? tr("editTemplateHeading") : tr("createNewTemplateHeading")}</DialogTitle>
          <DialogDescription>{t("editorDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wf-template-name" className="text-sm font-medium text-foreground">{tr("nameLabel")}</label>
              <Input id="wf-template-name" value={form.name} maxLength={100} placeholder={tr("namePlaceholder")} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={saving} aria-invalid={!form.name.trim() || undefined} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wf-template-description" className="text-sm font-medium text-foreground">{tr("descriptionLabel")}</label>
              <Input id="wf-template-description" value={form.description} maxLength={500} placeholder={tr("descriptionPlaceholder")} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={saving} />
            </div>
          </div>

          <section className="space-y-2" aria-labelledby="wf-template-stages-heading">
            <div>
              <h3 id="wf-template-stages-heading" className="text-sm font-semibold text-foreground">{tr("pipelineStagesLabel")}</h3>
              <p className="text-xs text-muted-foreground">{t("stagesHelp")}</p>
            </div>
            <WorkflowStageEditor stages={form.stages} onChange={(stages) => setForm((f) => ({ ...f, stages }))} idPrefix="wf-template" disabled={saving} />
          </section>

          <section className="space-y-2" aria-labelledby="wf-template-match-heading">
            <div>
              <h3 id="wf-template-match-heading" className="text-sm font-semibold text-foreground">{t("matchHeading")}</h3>
              <p className="text-xs text-muted-foreground">{t("matchDescription")}</p>
            </div>
            <MatchRulesEditor value={form.match} onChange={(match) => setForm((f) => ({ ...f, match }))} categoryOptions={categoryOptions} idPrefix="wf-template-match" disabled={saving} />
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wf-template-priority" className="text-sm font-medium text-foreground">{t("priorityLabel")}</label>
              <Input
                id="wf-template-priority"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) }))}
                disabled={saving}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">{t("priorityHint")}</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <Switch id="wf-template-default" checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} disabled={saving || template?.isActive === false} />
              <div>
                <label htmlFor="wf-template-default" className="text-sm font-medium text-foreground">{tr("markAsDefaultCheckbox")}</label>
                <p className="text-xs text-muted-foreground">{t("defaultHint")}</p>
              </div>
            </div>
          </div>

          {template && (template.usageCount ?? 0) > 0 && (
            <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-800">
              {t("editKeepsJobs", { count: template.usageCount ?? 0 })}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{tr("cancelButton")}</Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {template ? tr("updateTemplateButton") : tr("createTemplateButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
