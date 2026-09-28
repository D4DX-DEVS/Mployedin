"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, GitBranch, Loader2, Sparkles } from "lucide-react";
import { WorkflowStageChips, useWorkflowReasonText } from "@/components/features/workflow/WorkflowStageChips";
import { useWorkflowTemplateOptions } from "@/hooks/useWorkflowTemplates";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

/**
 * The job's hiring workflow in the job form. By default it follows the job's
 * details — the matching template updates as the title, category and type are
 * filled in — and a person can pick another one instead.
 */
export function JobWorkflowPicker() {
  const t = useTranslations("workflowTemplates");
  const reasonText = useWorkflowReasonText();
  const { watch, setValue } = useFormContext<JobFormValues>();
  const [open, setOpen] = useState(false);

  const picked = watch("workflowTemplateId");
  const match = useDebounce(
    {
      title: watch("title") ?? "",
      category: watch("category") ?? "",
      employmentType: watch("employmentType") ?? "",
      workMode: watch("workMode") ?? "",
      experienceMin: watch("requirements.experienceMin") ?? 0,
    },
    500,
  );
  const employerId = (watch("employerId") as string | undefined) ?? null;
  const { data, isLoading, isError } = useWorkflowTemplateOptions({ employerId, match });

  const templates = data?.templates ?? [];
  const pickedTemplate = typeof picked === "string" ? templates.find((tpl) => tpl._id === picked) ?? null : null;
  const resolved = data?.resolved;
  const name = pickedTemplate?.name ?? (resolved?.name || t("standardPipeline"));
  const stages = pickedTemplate?.stages ?? resolved?.stages ?? [];

  const choose = (id: string | null) => {
    setValue("workflowTemplateId", id, { shouldDirty: true, shouldValidate: false });
    setOpen(false);
  };

  return (
    <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 card-pad">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GitBranch className="h-4 w-4 text-sky-600" aria-hidden="true" />
        {t("jobFormLabel")}
      </p>
      <p className="text-xs text-muted-foreground">{t("jobFormHint")}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background text-sm transition-colors hover:bg-muted/40 chip-pad"
      >
        <span className="flex min-w-0 items-center gap-2">
          {!pickedTemplate && <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
          <span className="truncate text-foreground">{name}</span>
          {isLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div role="listbox" aria-label={t("jobFormLabel")} className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            role="option"
            aria-selected={!pickedTemplate}
            onClick={() => choose(null)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted/40"
          >
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{t("automaticOption")}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {resolved ? t("automaticWouldPick", { name: resolved.name || t("standardPipeline") }) : t("automaticOptionDesc")}
              </span>
            </span>
            {!pickedTemplate && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
          </button>
          {templates.map((tpl) => (
            <button
              key={tpl._id}
              type="button"
              role="option"
              aria-selected={pickedTemplate?._id === tpl._id}
              onClick={() => choose(tpl._id)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0 truncate text-foreground">{tpl.name}</span>
              {pickedTemplate?._id === tpl._id && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}

      {isError ? (
        <p className="text-xs text-muted-foreground">{t("optionsLoadError")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{pickedTemplate ? t("reasonManual") : reasonText(resolved?.reason)}</p>
          {stages.length > 0 && <WorkflowStageChips stages={stages} label={t("stagesOf", { name })} className="mt-1" />}
        </>
      )}
    </div>
  );
}
