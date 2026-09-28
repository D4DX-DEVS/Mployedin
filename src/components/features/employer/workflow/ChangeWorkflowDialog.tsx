"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkflowStageChips } from "@/components/features/workflow/WorkflowStageChips";
import { useWorkflowTemplateOptions } from "@/hooks/useWorkflowTemplates";
import { useSaveJobWorkflow, type JobWorkflowTemplateInfo } from "@/hooks/useJobWorkflow";
import { cn } from "@/lib/utils";

const AUTO = "auto";

interface ChangeWorkflowDialogProps {
  open: boolean;
  jobId: string;
  employerId?: string | null;
  current: JobWorkflowTemplateInfo | null;
  onClose: () => void;
}

/** Put a job on another template, or back on automatic matching. */
export function ChangeWorkflowDialog({ open, jobId, employerId, current, onClose }: ChangeWorkflowDialogProps) {
  const t = useTranslations("workflowTemplates");
  const { data, isLoading, isError, refetch } = useWorkflowTemplateOptions({ employerId, enabled: open });
  const save = useSaveJobWorkflow(jobId);
  const initial = current?.source === "manual" && current.templateId ? current.templateId : current?.source === "auto" ? AUTO : "";
  const [choice, setChoice] = useState(initial);

  useEffect(() => { if (open) setChoice(initial); }, [open, initial]);

  const handleSave = async () => {
    try {
      await save.mutateAsync({ templateId: choice === AUTO ? null : choice });
      toast.success(t("workflowChanged"));
      onClose();
    } catch {
      toast.error(t("workflowChangeError"));
    }
  };

  const options = [
    { value: AUTO, name: t("automaticOption"), description: t("automaticOptionDesc"), stages: null as null | NonNullable<typeof data>["templates"][number]["stages"] },
    ...(data?.templates ?? []).map((tpl) => ({ value: tpl._id, name: tpl.name, description: tpl.description, stages: tpl.stages })),
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !save.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("changeWorkflowTitle")}</DialogTitle>
          <DialogDescription>{t("changeWorkflowDescription")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />)}
          </div>
        ) : isError ? (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">{t("optionsLoadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("retry")}</Button>
          </div>
        ) : (
          <div role="radiogroup" aria-label={t("changeWorkflowTitle")} className="max-h-[50dvh] space-y-2 overflow-y-auto pe-1">
            {options.map((option) => {
              const selected = choice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChoice(option.value)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {option.value === AUTO && <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
                    {option.name}
                  </span>
                  {option.description && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}
                  {option.stages && <WorkflowStageChips stages={option.stages} className="mt-2" />}
                </button>
              );
            })}
          </div>
        )}

        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-900">{t("changeKeepsCandidates")}</p>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>{t("cancel")}</Button>
          <Button type="button" onClick={handleSave} disabled={!choice || save.isPending || isLoading} className="gap-2">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("useWorkflow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
