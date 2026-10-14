"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, ThumbsDown, ThumbsUp, Clock, Pencil, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ApprovalTimeline } from "@/components/features/exhibitions/ApprovalTimeline";
import { SupportItemsTable } from "@/components/features/exhibitions/SupportItemsSummary";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";
import { AttachmentsSection } from "@/components/features/exhibitions/ExhibitionAttachments";
import { CompletionReportView } from "@/components/features/exhibitions/CompletionReportView";
import { PriorityCriteria, PriorityPicker } from "@/components/features/exhibitions/PriorityFields";
import {
  PRIORITY_COLORS, STATUS_COLORS,
  getCategoryLabels, getObjectiveLabels, getParticipationLabels, getPriorityLabels, getResourceLabels, getStatusLabels,
  hasBudget, locationText, reviewActionsFor,
  SA_EDITABLE_STATUSES, canSuperAgentMoveBack,
  type ExhibitionRequest, type ReviewAction,
} from "../_lib/exhibitions";

interface ExhibitionDetailDialogProps {
  item: ExhibitionRequest | null;
  onClose: () => void;
  onAction: (item: ExhibitionRequest, action: ReviewAction) => void;
  /** Correct the request's facts. */
  onEdit: (item: ExhibitionRequest) => void;
  /** Step the request back a stage. */
  onMoveBack: (item: ExhibitionRequest) => void;
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

/** One labelled fact; an empty value reads "Not specified", never "—" or 0. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
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

/**
 * The full request for a reviewer: event facts, budget, requested resources
 * (requested vs allocated vs delivered), the approval history with who did
 * what, and the review actions this status allows. The list row does not carry
 * populated history actors, so the request is re-read by id on open.
 */
export function ExhibitionDetailDialog({ item, onClose, onAction, onEdit, onMoveBack, onChanged, version = 0 }: ExhibitionDetailDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
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
  const notSpecified = <span className="text-muted-foreground">{t("notSpecified")}</span>;
  const fmtDate = (value?: string) => formatDate(value, { day: "2-digit", month: "short", year: "numeric" }, locale);
  const money = (value: number) => `${detail?.budgetCurrency ?? ""} ${formatCount(value)}`.trim();

  const dateText = (() => {
    if (!detail?.eventStartDate) return null;
    const start = fmtDate(detail.eventStartDate);
    const end = detail.eventEndDate && detail.eventEndDate.slice(0, 10) !== detail.eventStartDate.slice(0, 10)
      ? fmtDate(detail.eventEndDate)
      : null;
    return end ? `${start} – ${end}` : start;
  })();
  const actions = detail ? reviewActionsFor(detail.status) : { secondary: [] as ReviewAction[] };
  const breakdown = detail?.budgetBreakdown
    ? Object.entries(detail.budgetBreakdown).filter(([, value]) => typeof value === "number" && value > 0)
    : [];

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {detail && (
          <>
            <DialogHeader className="pe-10">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words">{detail.eventName}</span>
                <Badge className={STATUS_COLORS[detail.status]}>{statusLabels[detail.status] ?? detail.status}</Badge>
                {!SA_EDITABLE_STATUSES.includes(detail.status) && (
                  <Badge className={PRIORITY_COLORS[detail.priority] ?? PRIORITY_COLORS.medium}>{priorityLabels[detail.priority] ?? detail.priority}</Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {[categoryLabels[detail.eventCategory] ?? detail.eventCategory, locationText(detail)].filter(Boolean).join(" · ")}
                <span className="block text-xs">
                  {t("submittedByOn", { name: detail.agentId?.name ?? "—", date: fmtDate(detail.createdAt) })}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* The super agent sets priority while the request is theirs to review. */}
              {SA_EDITABLE_STATUSES.includes(detail.status) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 px-4 py-2.5">
                  <span className="text-sm font-medium text-foreground">{t("priority")}</span>
                  <PriorityPicker
                    requestId={detail._id}
                    value={detail.priority}
                    onSaved={(priority) => { setFull((prev) => (prev ? { ...prev, priority } : { ...detail, priority })); onChanged(); }}
                  />
                  <PriorityCriteria />
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <Section title={t("sectionEventInformation")}>
                  <dl className="divide-y divide-border/40">
                    <Fact label={t("tableHeaderExhibitionDate")}>
                      {dateText ?? <span className="text-muted-foreground">{t("tableNoDate")}</span>}
                    </Fact>
                    <Fact label={t("tableHeaderLocation")}>{locationText(detail) || notSpecified}</Fact>
                    <Fact label={t("detailVenue")}>{detail.venue || notSpecified}</Fact>
                    <Fact label={t("detailOrganizer")}>
                      {detail.organizerName || notSpecified}
                      {detail.organizerContact ? <span className="block text-xs text-muted-foreground">{detail.organizerContact}</span> : null}
                    </Fact>
                    <Fact label={t("tableHeaderCategory")}>{categoryLabels[detail.eventCategory] ?? detail.eventCategory}</Fact>
                    <Fact label={t("detailExpectedLeads")}>{detail.expectedLeads ? formatCount(detail.expectedLeads) : notSpecified}</Fact>
                  </dl>
                </Section>
                <Section title={t("sectionReviewBudget")}>
                  <dl className="divide-y divide-border/40">
                    <Fact label={t("detailAgent")}>
                      {detail.agentId?.name ?? notSpecified}
                      {detail.agentId?.email ? <span className="block truncate text-xs text-muted-foreground">{detail.agentId.email}</span> : null}
                    </Fact>
                    <Fact label={t("detailBudgetRequested")}>{hasBudget(detail.estimatedBudget) ? money(detail.estimatedBudget) : notSpecified}</Fact>
                    <Fact label={t("detailBudgetRecommended")}>
                      {typeof detail.recommendedBudget === "number" ? money(detail.recommendedBudget) : <span className="text-muted-foreground">{t("notDecidedYet")}</span>}
                    </Fact>
                    <Fact label={t("detailBudgetApproved")}>
                      {typeof detail.approvedBudget === "number" ? money(detail.approvedBudget) : <span className="text-muted-foreground">{t("notDecidedYet")}</span>}
                    </Fact>
                    <Fact label={t("detailReviewedBy")}>
                      {detail.reviewedBy?.name
                        ? `${detail.reviewedBy.name}${detail.reviewedAt ? ` · ${fmtDate(detail.reviewedAt)}` : ""}`
                        : <span className="text-muted-foreground">{t("notReviewedYet")}</span>}
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
                {detail.requiredResources?.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("detailRequirementTags")}</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.requiredResources.map((r) => <Badge key={r} variant="outline">{resourceLabels[r] ?? r}</Badge>)}
                    </div>
                  </div>
                )}
              </Section>

              {(detail.participationTypes?.length > 0 || detail.objectives?.length > 0) && (
                <Section title={t("stepParticipation")}>
                  {detail.participationTypes?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {detail.participationTypes.map((pt) => <Badge key={pt} variant="outline">{participationLabels[pt] ?? pt}</Badge>)}
                    </div>
                  )}
                  {detail.participationDetails ? <p className="mt-2 whitespace-pre-line text-sm">{detail.participationDetails}</p> : null}
                  {detail.objectives?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("detailObjectives")}</p>
                      <div className="flex flex-wrap gap-1">
                        {detail.objectives.map((o) => <Badge key={o} variant="outline">{objectiveLabels[o] ?? o}</Badge>)}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {breakdown.length > 0 && (
                <Section title={t("detailBudgetBreakdown")}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {breakdown.map(([key, value]) => (
                      <div key={key} className="rounded-lg border p-2 text-center">
                        <p className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p>
                        <p className="font-semibold">{money(value as number)}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {(detail.description || detail.executionPlan || detail.expectedOutcome) && (
                <Section title={t("detailDescription")}>
                  <div className="space-y-3 text-sm">
                    {detail.description && <p className="whitespace-pre-line">{detail.description}</p>}
                    {detail.executionPlan && (
                      <div><p className="text-xs font-semibold text-muted-foreground">{t("detailExecutionPlan")}</p><p className="whitespace-pre-line">{detail.executionPlan}</p></div>
                    )}
                    {detail.expectedOutcome && (
                      <div><p className="text-xs font-semibold text-muted-foreground">{t("detailExpectedOutcome")}</p><p className="whitespace-pre-line">{detail.expectedOutcome}</p></div>
                    )}
                  </div>
                </Section>
              )}

              <Section title={t("attachmentsTitle")}>
                <AttachmentsSection requestId={detail._id} kind="event" attachments={detail.attachments ?? []} canManage={false} onChange={() => undefined} />
              </Section>

              {(detail.status === "active" || detail.status === "completed") && (
                <Section title={t("eventOutcomeTitle")}>
                  <CompletionReportView
                    requestId={detail._id}
                    report={detail.completionReport}
                    expectedLeads={detail.expectedLeads}
                    attachments={detail.attachments ?? []}
                    canManagePhotos={false}
                    onAttachmentsChange={() => undefined}
                  />
                </Section>
              )}

              <Section title={t("detailApprovalHistory")}>
                {loadingFull && !full ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ) : (
                  <ApprovalTimeline entries={detail.statusHistory ?? []} />
                )}
              </Section>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={onClose}>{tc("close")}</Button>
              {canSuperAgentMoveBack(detail) && (
                <Button variant="outline" onClick={() => onMoveBack(detail)}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  {t("moveBackAction")}
                </Button>
              )}
              {SA_EDITABLE_STATUSES.includes(detail.status) && (
                <Button variant="outline" onClick={() => onEdit(detail)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t("editDetailsAction")}
                </Button>
              )}
              {actions.secondary.map((action) => {
                const { labelKey, icon: Icon } = ACTION_META[action];
                return (
                  <Button
                    key={action}
                    variant="outline"
                    className={action === "rejected" ? "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" : "border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"}
                    onClick={() => onAction(detail, action)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(labelKey)}
                  </Button>
                );
              })}
              {actions.primary && (() => {
                const { labelKey, icon: Icon } = ACTION_META[actions.primary];
                return (
                  <Button
                    className={actions.primary === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    onClick={() => onAction(detail, actions.primary!)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(labelKey)}
                  </Button>
                );
              })()}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
