"use client";

import { useTranslations } from "next-intl";
import { GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkflowStageChips } from "@/components/features/workflow/WorkflowStageChips";
import { useWorkflowTemplateOptions } from "@/hooks/useWorkflowTemplates";
import { useSaveWorkflow } from "@/hooks/useWorkflow";
import { DEFAULT_WORKFLOW_STAGE_DEFS } from "@/lib/hiring/workflowStages";

const PLATFORM = "platform";

interface DefaultWorkflowCardProps {
  defaultTemplateId: string | null;
}

/**
 * The company's fallback workflow. Jobs whose details match a template get
 * that one; every other new job gets this. Saves on change.
 */
export function DefaultWorkflowCard({ defaultTemplateId }: DefaultWorkflowCardProps) {
  const t = useTranslations("workflowTemplates");
  const { data, isLoading, isError, refetch } = useWorkflowTemplateOptions();
  const save = useSaveWorkflow();
  const templates = data?.templates ?? [];
  const platformDefault = templates.find((tpl) => tpl.scope === "system" && tpl.isDefault) ?? null;
  const chosen = templates.find((tpl) => tpl._id === defaultTemplateId) ?? null;
  const effective = chosen ?? platformDefault;
  const value = chosen ? chosen._id : PLATFORM;

  const handleChange = async (next: string) => {
    try {
      await save.mutateAsync({ defaultTemplateId: next === PLATFORM ? null : next });
      toast.success(t("defaultSaved"));
    } catch {
      toast.error(t("defaultSaveError"));
    }
  };

  return (
    <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body" aria-labelledby="default-workflow-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("defaultEyebrow")}</p>
        <h2 id="default-workflow-heading" className="heading-subsection mt-2 flex items-center gap-2 font-semibold text-foreground">
          <GitBranch className="h-4 w-4 text-status-applied" aria-hidden="true" /> {t("defaultTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("defaultDescription")}</p>
      </div>

      {isLoading ? (
        <div className="h-10 animate-pulse rounded-xl bg-muted/50" aria-hidden="true" />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          {t("optionsLoadError")}{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => void refetch()}>{t("retry")}</button>
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <label htmlFor="default-workflow-select" className="sr-only">{t("defaultTitle")}</label>
          <Select value={value} onValueChange={(v) => void handleChange(v)} disabled={save.isPending}>
            <SelectTrigger id="default-workflow-select" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PLATFORM}>
                {platformDefault ? t("platformDefaultOption", { name: platformDefault.name }) : t("standardPipeline")}
              </SelectItem>
              {templates.filter((tpl) => tpl._id !== platformDefault?._id || chosen?._id === tpl._id).map((tpl) => (
                <SelectItem key={tpl._id} value={tpl._id}>{tpl.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
      )}

      <WorkflowStageChips stages={effective?.stages ?? DEFAULT_WORKFLOW_STAGE_DEFS} label={t("defaultTitle")} />
      <p className="text-xs text-muted-foreground">{t("matchingBeatsDefault")}</p>
    </section>
  );
}
