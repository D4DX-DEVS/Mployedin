"use client";

import { CheckCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";
import { AttachmentsSection } from "./ExhibitionAttachments";
import type { ExhibitionAttachmentView } from "./attachmentsClient";

export interface CompletionReport {
  actualLeads?: number;
  summary?: string;
  completedAt?: string;
  completedBy?: { name?: string } | string | null;
}

/**
 * What the event delivered: leads collected against the expectation, the
 * agent's summary, and the event photos. Photos are the agent's to add, while
 * the event runs or once it is completed; everyone else sees them.
 */
export function CompletionReportView({
  requestId,
  report,
  expectedLeads,
  attachments,
  canManagePhotos,
  onAttachmentsChange,
}: {
  requestId: string;
  report?: CompletionReport | null;
  expectedLeads?: number;
  attachments: ExhibitionAttachmentView[];
  canManagePhotos: boolean;
  onAttachmentsChange: (all: ExhibitionAttachmentView[]) => void;
}) {
  const t = useTranslations("exhibitions");
  const locale = useLocale();
  const by = report && typeof report.completedBy === "object" ? report.completedBy?.name : undefined;
  const hasPhotos = attachments.some((file) => file.kind === "completion");

  return (
    <div className="space-y-3">
      {report ? (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border/60 p-3">
              <dt className="text-xs text-muted-foreground">{t("leadsCollected")}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-foreground">
                {typeof report.actualLeads === "number" ? formatCount(report.actualLeads) : <span className="text-sm font-normal text-muted-foreground">{t("notSpecified")}</span>}
              </dd>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <dt className="text-xs text-muted-foreground">{t("detailExpectedLeads")}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-foreground">
                {typeof expectedLeads === "number" ? formatCount(expectedLeads) : <span className="text-sm font-normal text-muted-foreground">{t("notSpecified")}</span>}
              </dd>
            </div>
          </dl>
          {report.summary && <p className="whitespace-pre-line text-sm text-foreground">{report.summary}</p>}
          {(report.completedAt || by) && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
              {t("completedByOn", { name: by ?? "—", date: formatDate(report.completedAt, { day: "2-digit", month: "short", year: "numeric" }, locale) })}
            </p>
          )}
        </>
      ) : null}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("completionPhotosTitle")}</p>
        {canManagePhotos || hasPhotos ? (
          <AttachmentsSection requestId={requestId} kind="completion" attachments={attachments} canManage={canManagePhotos} onChange={onAttachmentsChange} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("photosByAgentHint")}</p>
        )}
      </div>
    </div>
  );
}
