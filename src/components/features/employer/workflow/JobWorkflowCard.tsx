"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { GitBranch, Pencil, Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowStageChips, useWorkflowReasonText } from "@/components/features/workflow/WorkflowStageChips";
import type { JobWorkflowResponse } from "@/hooks/useJobWorkflow";
import { ChangeWorkflowDialog } from "./ChangeWorkflowDialog";
import { CustomizeStagesDialog } from "./CustomizeStagesDialog";

const SOURCE_KEYS = { auto: "sourceAuto", manual: "sourceManual", custom: "sourceCustom" } as const;

interface JobWorkflowCardProps {
  jobId: string;
  employerId?: string | null;
  workflow: JobWorkflowResponse;
  /** The plan allows changing a job's workflow (the `workflowCustomization` entitlement). */
  canChange: boolean;
}

/**
 * Which workflow this job runs and why. The stages are the job's own copy:
 * editing the template later does not touch it.
 */
export function JobWorkflowCard({ jobId, employerId, workflow, canChange }: JobWorkflowCardProps) {
  const t = useTranslations("workflowTemplates");
  const format = useFormatter();
  const reasonText = useWorkflowReasonText();
  const [dialog, setDialog] = useState<"change" | "customize" | null>(null);
  const ref = workflow.template;

  const name = ref?.name || t("standardPipeline");
  const why = !ref
    ? t("legacyJobReason")
    : ref.source === "manual"
      ? t("reasonManual")
      : ref.source === "custom"
        ? (ref.name ? t("reasonCustomBasedOn", { name: ref.name }) : t("reasonCustom"))
        : reasonText(ref.reason);

  return (
    <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body" aria-labelledby={`job-workflow-${jobId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("jobWorkflowEyebrow")}</p>
          <h2 id={`job-workflow-${jobId}`} className="heading-subsection mt-2 flex flex-wrap items-center gap-2 font-semibold text-foreground">
            <GitBranch className="h-4 w-4 text-status-applied" aria-hidden="true" />
            {name}
            {ref && <Badge variant="secondary" className="text-[11px]">{t(SOURCE_KEYS[ref.source])}</Badge>}
            {ref?.templateId && <Badge variant="outline" className="text-[11px]">{t("versionBadge", { version: ref.version })}</Badge>}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{why}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1.5 rounded-xl" onClick={() => setDialog("change")} disabled={!canChange}>
            <Repeat2 className="h-4 w-4" aria-hidden="true" /> {t("changeWorkflow")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-10 gap-1.5 rounded-xl" onClick={() => setDialog("customize")} disabled={!canChange}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> {t("customizeStages")}
          </Button>
        </div>
      </div>

      <WorkflowStageChips stages={workflow.stages} label={t("stagesOf", { name })} />

      <p className="text-xs text-muted-foreground">
        {ref?.appliedAt
          ? t("snapshotNote", { date: format.dateTime(new Date(ref.appliedAt), { dateStyle: "medium" }) })
          : t("snapshotNoteLegacy")}
        {!canChange && <> {t("upgradeToChange")}</>}
      </p>

      <ChangeWorkflowDialog open={dialog === "change"} jobId={jobId} employerId={employerId} current={ref} onClose={() => setDialog(null)} />
      <CustomizeStagesDialog open={dialog === "customize"} jobId={jobId} stages={workflow.stages} onClose={() => setDialog(null)} />
    </section>
  );
}
