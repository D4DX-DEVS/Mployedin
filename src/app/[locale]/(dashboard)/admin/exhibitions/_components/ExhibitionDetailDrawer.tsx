"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  ChevronLeft,
  ClipboardCheck,
  ChevronRight,
  FolderOpen,
  Pencil,
  XCircle,
} from "lucide-react";
import { AttachmentsSection } from "@/components/features/exhibitions/ExhibitionAttachments";
import { CompletionReportView } from "@/components/features/exhibitions/CompletionReportView";
import { BudgetTiles, InspectorFact, InspectorSection, WaitingOn, WorkflowSteps } from "@/components/features/exhibitions/ExhibitionInspectorParts";
import { PriorityCriteria, PriorityPicker } from "@/components/features/exhibitions/PriorityFields";
import type { ExhibitionAttachmentView } from "@/components/features/exhibitions/attachmentsClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABEL_KEYS,
  PRIORITY_BADGES,
  PRIORITY_LABEL_KEYS,
  RESOURCE_LABEL_KEYS,
  STATUS_BADGES,
  STATUS_LABEL_KEYS,
  dayCount,
  formatDate,
  formatDateRange,
  getSla,
  type ExhibitionRequest,
  type MatchedResource,
} from "../_lib/exhibitions";
import { adminWorkflowActions } from "../_lib/workflowActions";
import { PAYMENT_APPROVED_STATUSES, eventHasStarted, isClosedStatus, isSettled } from "@/lib/exhibitions/transitions";
import { SupportInventoryPanel } from "./SupportInventoryPanel";
import type { SupportDialogMode } from "./SupportManageDialog";

interface ExhibitionDetailDrawerProps {
  item: ExhibitionRequest | null;
  matchedResources: MatchedResource[];
  resourcesLoading: boolean;
  onClose: () => void;
  /** Open the confirm dialog for a move to `status`. */
  onAction: (item: ExhibitionRequest, status: string) => void;
  previousItem: ExhibitionRequest | null;
  nextItem: ExhibitionRequest | null;
  onPrevious: () => void;
  onNext: () => void;
  /** Open the allocation or delivery dialog for the requested support. */
  onManageSupport: (item: ExhibitionRequest, mode: SupportDialogMode) => void;
  /** Correct the request's facts. */
  onEdit: (item: ExhibitionRequest) => void;
  /** Record or correct a completed event's outcome. */
  onRecordOutcome: (item: ExhibitionRequest) => void;
  /** A field changed here (priority, files); merge it and refresh the queue. */
  onItemChange: (item: ExhibitionRequest, change: Partial<ExhibitionRequest>) => void;
}

/**
 * The request inspector. Each fact appears once. It used to show priority,
 * dates, venue and leads three times (header chips, a summary card and an
 * "Overview" grid), the workflow twice (Workflow and Activity), and sections
 * with nothing behind them: six fixed attachment names, two invented comments,
 * a comment box that saved nothing, "Insurance pending" on every request, and
 * Assign Reviewer / Download PDF buttons that only toasted "queued".
 */
export function ExhibitionDetailDrawer({
  item,
  matchedResources,
  resourcesLoading,
  onClose,
  onAction,
  previousItem,
  nextItem,
  onPrevious,
  onNext,
  onManageSupport,
  onEdit,
  onRecordOutcome,
  onItemChange,
}: ExhibitionDetailDrawerProps) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const locale = useLocale();
  if (!item) return null;

  const sla = getSla(item);
  const days = dayCount(item.eventStartDate, item.eventEndDate);
  const { next, others } = adminWorkflowActions(item.status);
  // Once completed, rejected or archived the request is a finished record:
  // its facts, priority and event files stay as they were. Only the outcome
  // of a completed event (leads, spend, photos) can still be filled in.
  const isOpen = !isClosedStatus(item.status);
  const canReject = others.some((action) => action.key === "reject");
  const setAttachments = (all: ExhibitionAttachmentView[]) => onItemChange(item, { attachments: all });
  const spendRecorded = typeof item.actualSpend === "number";
  // The outcome shows once the event has run, and stays on the settled record.
  const showOutcome =
    item.status === "completed" || isSettled(item) || (PAYMENT_APPROVED_STATUSES.includes(item.status) && eventHasStarted(item.eventStartDate));
  const place = [item.venue, item.eventLocation, item.country].filter(Boolean).join(" · ");

  return (
    <aside
      aria-label={t("exhibitionRequestInspector")}
      className="fixed bottom-0 right-0 top-[72px] z-[70] flex w-full animate-in flex-col border-l border-t border-border bg-background shadow-2xl shadow-black/15 duration-200 slide-in-from-right-8 md:max-w-[640px]"
    >
      <header className="border-b bg-background px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="iconDense" className="rounded-lg" disabled={!previousItem} onClick={onPrevious} aria-label={t("previous")} title={t("previous")}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <Button variant="ghost" size="iconDense" className="rounded-lg" disabled={!nextItem} onClick={onNext} aria-label={t("next")} title={t("next")}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <span className="ms-1 font-mono text-xs text-muted-foreground">{item._id.slice(-12).toUpperCase()}</span>
          </div>
          <Button variant="ghost" size="iconDense" className="rounded-full" onClick={onClose} aria-label={t("closeInspector")} title={t("closeInspector")}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="heading-section min-w-0 truncate font-semibold tracking-tight text-foreground">{item.eventName}</h2>
          <Badge className={`${STATUS_BADGES[item.status] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
            {STATUS_LABEL_KEYS[item.status] ? t(STATUS_LABEL_KEYS[item.status]) : item.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(CATEGORY_LABEL_KEYS[item.eventCategory] ?? "otherCategory")}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <WaitingOn item={item} viewer="admin" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-muted/15 card-pad text-sm">
          <InspectorFact label={t("agent")}>
            <span className="block truncate">{item.agentId?.name ?? "-"}</span>
            {item.agentId?.email && <span className="block truncate text-xs font-normal text-muted-foreground">{item.agentId.email}</span>}
          </InspectorFact>
          <InspectorFact label={t("dates")}>
            {formatDateRange(item, locale)}
            {days ? <span className="text-xs font-normal text-muted-foreground"> · {days} {t("days")}</span> : null}
          </InspectorFact>
          <InspectorFact label={t("location")}>{place || t("tbd")}</InspectorFact>
          <InspectorFact label={t("expectedLeads")}>{item.expectedLeads ?? "-"}</InspectorFact>
          <InspectorFact label={t("priority")}>
            {isOpen ? (
              <span className="block space-y-1 font-normal">
                <PriorityPicker requestId={item._id} value={item.priority} onSaved={(priority) => onItemChange(item, { priority })} />
                <PriorityCriteria />
              </span>
            ) : (
              <Badge className={`${PRIORITY_BADGES[item.priority] ?? PRIORITY_BADGES.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
                {t(PRIORITY_LABEL_KEYS[item.priority] ?? "medium")}
              </Badge>
            )}
          </InspectorFact>
          <InspectorFact label={t("sla")}>
            <span className={sla.className}>{t(sla.labelKey, { days: sla.days })}</span>
          </InspectorFact>
          <InspectorFact label={t("submittedHeader")}>{formatDate(item.createdAt, locale)}</InspectorFact>
          {item.participationTypes?.includes("booth") && <InspectorFact label={t("booths")}>{t("requested")}</InspectorFact>}
          {item.assignedTeam?.length ? <InspectorFact label={t("assignedTeam")} wide>{item.assignedTeam.join(", ")}</InspectorFact> : null}
        </dl>

        <p className="text-sm leading-6 text-muted-foreground">{item.description || item.executionPlan || t("noDescriptionProvided")}</p>

        <InspectorSection title={t("budget")}>
          <BudgetTiles item={item} />
        </InspectorSection>

        {((item.supportItems?.length ?? 0) > 0 || item.additionalRequirements) && (
          <InspectorSection title={t("supportSectionTitle")}>
            <SupportInventoryPanel item={item} onManage={(mode) => onManageSupport(item, mode)} />
          </InspectorSection>
        )}

        {(isOpen || (item.attachments ?? []).some((file) => file.kind === "event")) && (
          <InspectorSection title={tx("attachmentsTitle")}>
            <AttachmentsSection requestId={item._id} kind="event" attachments={item.attachments ?? []} canManage={isOpen} onChange={setAttachments} />
          </InspectorSection>
        )}

        {showOutcome && (
          <InspectorSection
            title={tx("eventOutcomeTitle")}
            action={item.status === "completed" ? (
              <Button size="dense" variant="outline" className="rounded-lg" onClick={() => onRecordOutcome(item)}>
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                {tx(item.completionReport || spendRecorded ? "editOutcomeAction" : "recordOutcomeAction")}
              </Button>
            ) : undefined}
          >
            {item.status === "completed" && !item.completionReport && (
              <p className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">{tx("noOutcomeRecorded")}</p>
            )}
            <CompletionReportView
              requestId={item._id}
              report={item.completionReport}
              expectedLeads={item.expectedLeads}
              attachments={item.attachments ?? []}
              canManagePhotos={false}
              onAttachmentsChange={setAttachments}
            />
          </InspectorSection>
        )}

        <InspectorSection title={t("workflow")}>
          <WorkflowSteps item={item} />
        </InspectorSection>

        {item.requiredResources?.length > 0 && (
          <InspectorSection title={t("resources")}>
            <div className="flex flex-wrap gap-2">
              {item.requiredResources.map((resource) => (
                <Badge key={resource} variant="outline" className="rounded-md">
                  {RESOURCE_LABEL_KEYS[resource] ? t(RESOURCE_LABEL_KEYS[resource]) : resource}
                </Badge>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {resourcesLoading ? (
                <p className="text-sm text-muted-foreground">{t("loadingMatchingResources")}</p>
              ) : matchedResources.length > 0 ? (
                matchedResources.map((resource) => {
                  const url = resource.files?.[0]?.url;
                  return (
                    <div key={resource._id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 chip-pad">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate font-medium text-foreground">{resource.title}</span>
                      </span>
                      {url && (
                        <Button asChild variant="outline" size="dense" className="rounded-lg">
                          <a href={url} target="_blank" rel="noopener noreferrer">{t("preview")}</a>
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="rounded-xl border border-dashed bg-muted/10 text-center text-sm text-muted-foreground card-pad">{t("noMatchingResourcesUploaded")}</p>
              )}
            </div>
          </InspectorSection>
        )}
      </div>

      {(next || others.length > 0 || isOpen) && (
        <footer className="border-t bg-background px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <Button size="sm" className="rounded-lg" onClick={() => onAction(item, next.status)}>
                <next.icon className="h-4 w-4" aria-hidden="true" />
                {t(next.labelKey)}
              </Button>
            )}
            {others.map((action) => (
              <Button
                key={action.key}
                size="sm"
                variant="outline"
                className={action.destructive ? "rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" : "rounded-lg"}
                onClick={() => onAction(item, action.status)}
              >
                <action.icon className="h-4 w-4" aria-hidden="true" />
                {t(action.labelKey)}
              </Button>
            ))}
            {isOpen && (
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => onEdit(item)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {tx("editDetailsAction")}
              </Button>
            )}
          </div>
          {(next?.status === "approved" || canReject) && (
            <p className="mt-2 hidden text-[11px] text-muted-foreground md:block">{t("escCloseLeftRightNavigateAApproveRReject")}</p>
          )}
        </footer>
      )}
    </aside>
  );
}

