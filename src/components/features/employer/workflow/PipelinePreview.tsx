"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, GitBranch } from "lucide-react";
import {
  OFF_PATH_STATUSES,
  PIPELINE_STAGES,
  STAGE_DOT_CLASS,
  STAGE_LABEL_KEYS,
} from "@/lib/hiring/pipeline";

/**
 * The pipeline every employer job runs on, read-only. Rejected and withdrawn
 * are outcomes a candidate can reach from any stage, so they sit apart.
 */
export function PipelinePreview() {
  const t = useTranslations("hiringRules");
  const tp = useTranslations("hiringPipeline");

  return (
    <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("pipelineEyebrow")}</p>
        <h2 className="heading-subsection mt-2 flex items-center gap-2 font-semibold text-foreground">
          <GitBranch className="h-4 w-4 text-status-applied" aria-hidden="true" /> {t("pipelineTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("pipelineDesc")}</p>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5" aria-label={t("pipelineTitle")}>
        {PIPELINE_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-center gap-1.5">
            <span className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
              <span className={`h-2 w-2 rounded-full ${STAGE_DOT_CLASS[stage]}`} aria-hidden="true" />
              {tp(STAGE_LABEL_KEYS[stage])}
            </span>
            {index < PIPELINE_STAGES.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-[0.12em]">{t("outcomes")}</span>
        {OFF_PATH_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT_CLASS[status]}`} aria-hidden="true" />
            {tp(STAGE_LABEL_KEYS[status])}
          </span>
        ))}
      </p>
    </section>
  );
}
