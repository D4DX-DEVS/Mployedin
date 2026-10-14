"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCheck, Edit, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ApprovalTimeline, type TimelineEntry } from "@/components/features/exhibitions/ApprovalTimeline";
import { SupportItemsTable, type SupportItemView } from "@/components/features/exhibitions/SupportItemsSummary";
import { formatCurrency } from "@/lib/currency";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";
import { AttachmentsSection } from "@/components/features/exhibitions/ExhibitionAttachments";
import { CompletionReportView, type CompletionReport } from "@/components/features/exhibitions/CompletionReportView";
import type { ExhibitionAttachmentView } from "@/components/features/exhibitions/attachmentsClient";

export interface AgentExhibitionDetail {
  _id: string;
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  venue?: string;
  country?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  organizerName?: string;
  organizerContact?: string;
  participationTypes: string[];
  objectives: string[];
  estimatedBudget: number;
  budgetCurrency: string;
  approvedBudget?: number;
  description?: string;
  expectedLeads?: number;
  requiredResources: string[];
  supportItems?: SupportItemView[];
  additionalRequirements?: string;
  priority: string;
  status: string;
  reviewNote?: string;
  statusHistory?: TimelineEntry[];
  attachments?: ExhibitionAttachmentView[];
  completionReport?: CompletionReport | null;
  createdAt: string;
}

interface AgentExhibitionDetailDialogProps {
  item: AgentExhibitionDetail | null;
  onClose: () => void;
  onEdit: (item: AgentExhibitionDetail) => void;
  /** Open the "event completed" report for a running event. */
  onComplete: (item: AgentExhibitionDetail) => void;
  statusLabel: (status: string) => string;
  statusClassName: (status: string) => string;
  priorityClassName: (priority: string) => string;
  /** Option label lookups the page already owns (category, participation...). */
  categoryLabel: (value: string) => string;
  participationLabel: (value: string) => string;
  objectiveLabel: (value: string) => string;
  resourceLabel: (value: string) => string;
}

const PRIORITY_KEYS: Record<string, string> = {
  low: "priorityLow", medium: "priorityMedium", high: "priorityHigh", critical: "priorityCritical",
};

const EDITABLE = ["draft", "submitted", "revision_requested"];
/** From the moment the event runs, its outcome and photos belong on the request. */
const OUTCOME_STATUSES = ["active", "completed"];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** "TBD" is the stored default for "no location yet", not a place. */
function placeOf(item: Pick<AgentExhibitionDetail, "eventLocation" | "country">): string {
  const place = item.eventLocation && item.eventLocation.trim().toUpperCase() !== "TBD" ? item.eventLocation.trim() : "";
  return [place, item.country?.trim()].filter(Boolean).join(", ");
}

/**
 * The agent's own request: what was asked for, where it stands, what the
 * reviewer said and who moved it. Empty fields read "Not specified" rather
 * than "-" or "$ 0", and a request sent back for changes leads with that.
 */
export function AgentExhibitionDetailDialog({
  item,
  onClose,
  onEdit,
  onComplete,
  statusLabel,
  statusClassName,
  priorityClassName,
  categoryLabel,
  participationLabel,
  objectiveLabel,
  resourceLabel,
}: AgentExhibitionDetailDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [full, setFull] = useState<AgentExhibitionDetail | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const itemId = item?._id;

  // The list does not carry who made each history change; the single read does.
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    setFull(null);
    setLoadingFull(true);
    fetch(`/api/exhibitions/${itemId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgentExhibitionDetail | null) => { if (!cancelled && data) setFull(data); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoadingFull(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  const detail = item ? { ...item, ...(full ?? {}) } : null;
  const notSpecified = <span className="text-muted-foreground">{t("notSpecified")}</span>;
  const fmt = (value?: string) => formatListDate(value, locale);

  let dateText: string | null = null;
  let days: number | null = null;
  if (detail?.eventStartDate) {
    const sameDay = !detail.eventEndDate || detail.eventEndDate.slice(0, 10) === detail.eventStartDate.slice(0, 10);
    dateText = sameDay ? fmt(detail.eventStartDate) : `${fmt(detail.eventStartDate)} – ${fmt(detail.eventEndDate)}`;
    const start = new Date(detail.eventStartDate).getTime();
    const end = new Date(detail.eventEndDate ?? detail.eventStartDate).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  }
  const place = detail ? placeOf(detail) : "";
  const editable = detail ? EDITABLE.includes(detail.status) : false;
  const showOutcome = detail ? OUTCOME_STATUSES.includes(detail.status) : false;
  const attachments = detail?.attachments ?? [];
  const setAttachments = (all: ExhibitionAttachmentView[]) =>
    setFull((prev) => (prev ? { ...prev, attachments: all } : detail ? { ...detail, attachments: all } : prev));

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
        {detail && (
          <>
            <DialogHeader className="shrink-0 border-b px-6 pb-4 pe-14 pt-6">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                <span className="min-w-0 break-words">{detail.eventName}</span>
                <Badge className={statusClassName(detail.status)}>{statusLabel(detail.status)}</Badge>
                <Badge className={priorityClassName(detail.priority)}>
                  {PRIORITY_KEYS[detail.priority] ? t(PRIORITY_KEYS[detail.priority]) : detail.priority}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {[categoryLabel(detail.eventCategory), place].filter(Boolean).join(" · ")}
                <span className="block text-xs">{t("createdOn", { date: fmt(detail.createdAt) })}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {detail.reviewNote && (detail.status === "revision_requested" || detail.status === "rejected") && (
                <div
                  role="status"
                  className={detail.status === "rejected"
                    ? "rounded-lg border border-red-200 bg-red-50 chip-pad"
                    : "rounded-lg border border-orange-200 bg-orange-50 chip-pad"}
                >
                  <p className={`mb-1 flex items-center gap-1.5 text-sm font-medium ${detail.status === "rejected" ? "text-red-800" : "text-orange-800"}`}>
                    {detail.status === "rejected"
                      ? <XCircle className="h-4 w-4" aria-hidden="true" />
                      : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                    {detail.status === "rejected" ? t("rejectedBecause") : t("changesRequested")}
                  </p>
                  <p className={`whitespace-pre-line text-sm ${detail.status === "rejected" ? "text-red-700" : "text-orange-700"}`}>{detail.reviewNote}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Section title={t("sectionEventInformation")}>
                  <dl className="divide-y divide-border/40">
                    <Fact label={t("tableHeaderExhibitionDate")}>
                      {dateText ?? <span className="text-muted-foreground">{t("tableNoDate")}</span>}
                      {dateText && days && days > 1 ? <span className="block text-xs text-muted-foreground">{t("tableDayCount", { count: days })}</span> : null}
                    </Fact>
                    <Fact label={t("tableHeaderLocation")}>{place || notSpecified}</Fact>
                    <Fact label={t("detailVenue")}>{detail.venue || notSpecified}</Fact>
                    <Fact label={t("detailOrganizer")}>
                      {detail.organizerName || notSpecified}
                      {detail.organizerContact ? <span className="block text-xs text-muted-foreground">{detail.organizerContact}</span> : null}
                    </Fact>
                  </dl>
                </Section>
                <Section title={t("sectionBudgetPlan")}>
                  <dl className="divide-y divide-border/40">
                    <Fact label={t("estimatedBudget")}>
                      {detail.estimatedBudget > 0 ? formatCurrency(detail.estimatedBudget, detail.budgetCurrency) : notSpecified}
                    </Fact>
                    <Fact label={t("detailApprovedBudget")}>
                      {detail.approvedBudget != null
                        ? <span className="font-semibold text-emerald-700">{formatCurrency(detail.approvedBudget, detail.budgetCurrency)}</span>
                        : <span className="text-muted-foreground">{t("notDecidedYet")}</span>}
                    </Fact>
                    <Fact label={t("detailExpectedLeads")}>{detail.expectedLeads ? formatCount(detail.expectedLeads) : notSpecified}</Fact>
                    <Fact label={t("detailParticipation")}>
                      {detail.participationTypes.length > 0
                        ? detail.participationTypes.map(participationLabel).join(", ")
                        : notSpecified}
                    </Fact>
                  </dl>
                </Section>
              </div>

              <Section title={t("sectionRequestedResources")}>
                <SupportItemsTable items={detail.supportItems ?? []} />
                {detail.additionalRequirements && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-muted-foreground">{t("additionalRequirements")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{detail.additionalRequirements}</p>
                  </div>
                )}
                {detail.requiredResources.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("detailRequirementTags")}</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.requiredResources.map((r) => <Badge key={r} variant="outline">{resourceLabel(r)}</Badge>)}
                    </div>
                  </div>
                )}
              </Section>

              <Section title={t("attachmentsTitle")}>
                <AttachmentsSection requestId={detail._id} kind="event" attachments={attachments} canManage={editable} onChange={setAttachments} />
              </Section>

              {showOutcome && (
                <Section title={t("eventOutcomeTitle")}>
                  <CompletionReportView
                    requestId={detail._id}
                    report={detail.completionReport}
                    expectedLeads={detail.expectedLeads}
                    attachments={attachments}
                    canManagePhotos
                    onAttachmentsChange={setAttachments}
                  />
                </Section>
              )}

              {(detail.description || detail.objectives.length > 0) && (
                <Section title={t("detailDescription")}>
                  {detail.description && <p className="whitespace-pre-line text-sm leading-6">{detail.description}</p>}
                  {detail.objectives.length > 0 && (
                    <div className={detail.description ? "mt-3" : ""}>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("detailObjectives")}</p>
                      <div className="flex flex-wrap gap-1">
                        {detail.objectives.map((o) => <Badge key={o} variant="outline">{objectiveLabel(o)}</Badge>)}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              <Section title={t("detailApprovalHistory")}>
                {loadingFull && !full ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <ApprovalTimeline entries={detail.statusHistory ?? []} />
                )}
              </Section>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-2">
              <Button variant="ghost" onClick={onClose}>{tc("close")}</Button>
              {detail.status === "active" && (
                <Button onClick={() => onComplete(detail)}>
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  {t("markEventCompleted")}
                </Button>
              )}
              {editable && (
                <Button
                  variant={detail.status === "revision_requested" ? "default" : "outline"}
                  onClick={() => onEdit(detail)}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  {detail.status === "revision_requested" ? t("editAndResubmit") : t("editRequest")}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
