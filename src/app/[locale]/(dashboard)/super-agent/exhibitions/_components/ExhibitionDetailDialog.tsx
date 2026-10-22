"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, ThumbsDown, ThumbsUp, Clock, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupportItemsTable } from "@/components/features/exhibitions/SupportItemsSummary";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";
import { AttachmentsSection } from "@/components/features/exhibitions/ExhibitionAttachments";
import { CompletionReportView } from "@/components/features/exhibitions/CompletionReportView";
import { BudgetTiles, InspectorFact, InspectorSection, WorkflowSteps, WaitingOn } from "@/components/features/exhibitions/ExhibitionInspectorParts";
import { canReportEvent, isSettled } from "@/lib/exhibitions/transitions";
import { PriorityCriteria, PriorityPicker } from "@/components/features/exhibitions/PriorityFields";
import {
  PRIORITY_COLORS, STATUS_COLORS,
  getCategoryLabels, getObjectiveLabels, getParticipationLabels, getPriorityLabels, getResourceLabels, getStatusLabels,
  reviewActionsFor,
  SA_EDITABLE_STATUSES,
  type ExhibitionRequest, type ReviewAction,
} from "../_lib/exhibitions";

interface ExhibitionDetailDialogProps {
  item: ExhibitionRequest | null;
  onClose: () => void;
  onAction: (item: ExhibitionRequest, action: ReviewAction) => void;
  /** Correct the request's facts. */
  onEdit: (item: ExhibitionRequest) => void;
  /** Something on the request changed here (priority); the list should refresh. */
  onChanged: () => void;
  /** Bump to re-read the request after an edit made elsewhere. */
  version?: number;
}

const ACTION_META: Record<ReviewAction, { labelKey: string; icon: typeof ThumbsUp }> = {
  under_review: { labelKey: "reviewStartReview", icon: Clock },
  approved: { labelKey: "actionApprove", icon: ThumbsUp },
  revision_requested: { labelKey: "reviewRequestRevision", icon: RotateCcw },
  rejected: { labelKey: "actionReject", icon: ThumbsDown },
};

const dayCount = (start?: string, end?: string) => {
  if (!start || !end) return null;
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : null;
};

/**
 * The request for a reviewer, docked beside the queue the way the admin's
 * inspector is, with the same facts, budget tiles and workflow steps (client
 * feedback 2026-10-15: the super agent's view was a centred modal with its
 * own layout, labels and history). The list row does not carry populated
 * history actors, so the request is re-read by id on open.
 */
export function ExhibitionDetailDialog({ item, onClose, onAction, onEdit, onChanged, version = 0 }: ExhibitionDetailDialogProps) {
  const t = useTranslations("exhibitions");
  const ta = useTranslations("adminExhibitions");
  const locale = useLocale();
  const [full, setFull] = useState<ExhibitionRequest | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const itemId = item?._id;

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    setFull(null);
    setLoadingFull(true);
    fetch(`/api/exhibitions/${itemId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ExhibitionRequest | null) => { if (!cancelled && data) setFull(data); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoadingFull(false); });
    return () => { cancelled = true; };
  }, [itemId, version]);

  const statusLabels = getStatusLabels(t);
  const priorityLabels = getPriorityLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const objectiveLabels = getObjectiveLabels(t);
  const resourceLabels = getResourceLabels(t);
  const participationLabels = getParticipationLabels(t);

  const detail = item ? { ...item, ...(full ?? {}) } : null;
  const fmtDate = (value?: string) => formatDate(value, { day: "2-digit", month: "short", year: "numeric" }, locale);
  const actions = detail ? reviewActionsFor(detail.status) : { secondary: [] as ReviewAction[] };
  const editable = detail ? SA_EDITABLE_STATUSES.includes(detail.status) : false;
  const days = dayCount(detail?.eventStartDate, detail?.eventEndDate);
  const dateText = (() => {
    if (!detail?.eventStartDate) return null;
    const start = fmtDate(detail.eventStartDate);
    const end = detail.eventEndDate && detail.eventEndDate.slice(0, 10) !== detail.eventStartDate.slice(0, 10)
      ? fmtDate(detail.eventEndDate)
      : null;
    return end ? `${start} – ${end}` : start;
  })();
  const place = detail ? [detail.venue, detail.eventLocation, detail.country].filter(Boolean).join(" · ") : "";
  const hasEventFiles = (detail?.attachments ?? []).some((file) => file.kind === "event");
  const hasSupport = Boolean(detail && ((detail.supportItems?.length ?? 0) > 0 || detail.additionalRequirements || detail.requiredResources?.length));
  const hasFooter = Boolean(actions.primary || actions.secondary.length > 0 || editable);

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-[640px]">
        {detail && (
          <>
            <DialogHeader className="space-y-0.5 border-b px-5 py-4 pe-14 text-start">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle className="heading-section min-w-0 break-words font-semibold tracking-tight">{detail.eventName}</DialogTitle>
                <Badge className={`${STATUS_COLORS[detail.status] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>{statusLabels[detail.status] ?? detail.status}</Badge>
              </div>
              <DialogDescription>{categoryLabels[detail.eventCategory] ?? detail.eventCategory}</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
              <WaitingOn item={detail} viewer="super_agent" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-muted/15 card-pad text-sm">
                <InspectorFact label={ta("agent")}>
                  <span className="block truncate">{detail.agentId?.name ?? "-"}</span>
                  {detail.agentId?.email && <span className="block truncate text-xs font-normal text-muted-foreground">{detail.agentId.email}</span>}
                </InspectorFact>
                <InspectorFact label={ta("dates")}>
                  {dateText ?? <span className="font-normal text-muted-foreground">{t("tableNoDate")}</span>}
                  {days ? <span className="text-xs font-normal text-muted-foreground"> · {days} {ta("days")}</span> : null}
                </InspectorFact>
                <InspectorFact label={ta("location")}>{place || <span className="font-normal text-muted-foreground">{ta("tbd")}</span>}</InspectorFact>
                <InspectorFact label={ta("expectedLeads")}>{typeof detail.expectedLeads === "number" ? formatCount(detail.expectedLeads) : "-"}</InspectorFact>
                {/* The super agent sets priority while the request is theirs to review. */}
                <InspectorFact label={ta("priority")}>
                  {editable ? (
                    <span className="block space-y-1 font-normal">
                      <PriorityPicker
                        requestId={detail._id}
                        value={detail.priority}
                        onSaved={(priority) => { setFull((prev) => (prev ? { ...prev, priority } : { ...detail, priority })); onChanged(); }}
                      />
                      <PriorityCriteria />
                    </span>
                  ) : (
                    <Badge className={`${PRIORITY_COLORS[detail.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
                      {priorityLabels[detail.priority] ?? detail.priority}
                    </Badge>
                  )}
                </InspectorFact>
                <InspectorFact label={ta("submittedHeader")}>{fmtDate(detail.createdAt)}</InspectorFact>
                {(detail.organizerName || detail.organizerContact) && (
                  <InspectorFact label={t("detailOrganizer")} wide>
                    {detail.organizerName || "-"}
                    {detail.organizerContact ? <span className="block text-xs font-normal text-muted-foreground">{detail.organizerContact}</span> : null}
                  </InspectorFact>
                )}
                {detail.participationTypes?.includes("booth") && <InspectorFact label={ta("booths")}>{ta("requested")}</InspectorFact>}
              </dl>

              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p className="whitespace-pre-line">{detail.description || ta("noDescriptionProvided")}</p>
                {detail.executionPlan && (
                  <div><p className="text-xs font-semibold text-foreground">{t("detailExecutionPlan")}</p><p className="whitespace-pre-line">{detail.executionPlan}</p></div>
                )}
                {detail.expectedOutcome && (
                  <div><p className="text-xs font-semibold text-foreground">{t("detailExpectedOutcome")}</p><p className="whitespace-pre-line">{detail.expectedOutcome}</p></div>
                )}
              </div>

              <InspectorSection title={ta("budget")}>
                <BudgetTiles item={detail} />
              </InspectorSection>

              <InspectorSection title={t("sectionRequestedResources")}>
                {hasSupport ? (
                  <>
                    <SupportItemsTable items={detail.supportItems ?? []} />
                    {detail.additionalRequirements && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-muted-foreground">{t("additionalRequirements")}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{detail.additionalRequirements}</p>
                      </div>
                    )}
                    {detail.requiredResources?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {detail.requiredResources.map((r) => <Badge key={r} variant="outline" className="rounded-md">{resourceLabels[r] ?? r}</Badge>)}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noSupportItems")}</p>
                )}
              </InspectorSection>

              {(detail.participationTypes?.length > 0 || detail.objectives?.length > 0) && (
                <InspectorSection title={t("stepParticipation")}>
                  {detail.participationTypes?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {detail.participationTypes.map((pt) => <Badge key={pt} variant="outline" className="rounded-md">{participationLabels[pt] ?? pt}</Badge>)}
                    </div>
                  )}
                  {detail.participationDetails ? <p className="mt-2 whitespace-pre-line text-sm">{detail.participationDetails}</p> : null}
                  {detail.objectives?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("detailObjectives")}</p>
                      <div className="flex flex-wrap gap-1">
                        {detail.objectives.map((o) => <Badge key={o} variant="outline" className="rounded-md">{objectiveLabels[o] ?? o}</Badge>)}
                      </div>
                    </div>
                  )}
                </InspectorSection>
              )}

              {hasEventFiles && (
                <InspectorSection title={t("attachmentsTitle")}>
                  <AttachmentsSection requestId={detail._id} kind="event" attachments={detail.attachments ?? []} canManage={false} onChange={() => undefined} />
                </InspectorSection>
              )}

              {(detail.status === "completed" || isSettled(detail) || canReportEvent(detail)) && (
                <InspectorSection title={t("eventOutcomeTitle")}>
                  <CompletionReportView
                    requestId={detail._id}
                    report={detail.completionReport}
                    expectedLeads={detail.expectedLeads}
                    attachments={detail.attachments ?? []}
                    canManagePhotos={false}
                    onAttachmentsChange={() => undefined}
                  />
                </InspectorSection>
              )}

              <InspectorSection title={ta("workflow")}>
                {loadingFull && !full ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ) : (
                  <WorkflowSteps item={detail} />
                )}
              </InspectorSection>
            </div>

            {/* Same order as the admin's inspector: the next step first, then the side moves. */}
            {hasFooter && (
              <footer className="flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
                {actions.primary && (() => {
                  const { labelKey, icon: Icon } = ACTION_META[actions.primary];
                  return (
                    <Button size="sm" className="rounded-lg" onClick={() => onAction(detail, actions.primary!)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {t(labelKey)}
                    </Button>
                  );
                })()}
                {actions.secondary.map((action) => {
                  const { labelKey, icon: Icon } = ACTION_META[action];
                  return (
                    <Button
                      key={action}
                      size="sm"
                      variant="outline"
                      className={action === "rejected" ? "rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" : "rounded-lg"}
                      onClick={() => onAction(detail, action)}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {t(labelKey)}
                    </Button>
                  );
                })}
                {editable && (
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => onEdit(detail)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t("editDetailsAction")}
                  </Button>
                )}
              </footer>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
