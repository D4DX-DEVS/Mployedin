"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkflowStageEditor, stageProblems, toStageDrafts, type StageDraft } from "@/components/features/workflow/WorkflowStageEditor";
import { useSaveJobWorkflow } from "@/hooks/useJobWorkflow";
import type { WorkflowStageDef } from "@/lib/hiring/workflowStages";

interface CustomizeStagesDialogProps {
  open: boolean;
  jobId: string;
  stages: readonly WorkflowStageDef[];
  onClose: () => void;
}

/** Edit this job's stages only. Stage ids stay, so candidates stay in their stage. */
export function CustomizeStagesDialog({ open, jobId, stages, onClose }: CustomizeStagesDialogProps) {
  const t = useTranslations("workflowTemplates");
  const save = useSaveJobWorkflow(jobId);
  const [draft, setDraft] = useState<StageDraft[]>(() => toStageDrafts(stages));

  useEffect(() => { if (open) setDraft(toStageDrafts(stages)); }, [open, stages]);

  const problems = stageProblems(draft);
  const handleSave = async () => {
    if (problems.length > 0) return;
    try {
      await save.mutateAsync({ customStages: draft.map((s) => ({ id: s.id, label: s.label.trim(), phase: s.phase })) });
      toast.success(t("stagesSaved"));
      onClose();
    } catch {
      toast.error(t("stagesSaveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !save.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("customizeTitle")}</DialogTitle>
          <DialogDescription>{t("customizeDescription")}</DialogDescription>
        </DialogHeader>
        <WorkflowStageEditor stages={draft} onChange={setDraft} idPrefix={`job-${jobId}-stages`} disabled={save.isPending} />
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-900">{t("changeKeepsCandidates")}</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>{t("cancel")}</Button>
          <Button type="button" onClick={handleSave} disabled={problems.length > 0 || save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {t("saveStages")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
