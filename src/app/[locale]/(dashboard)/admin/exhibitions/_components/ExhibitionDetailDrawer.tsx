"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  FolderOpen,
  Hotel,
  Megaphone,
  Package,
  Plane,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  formatDateTime,
  formatMoney,
  getSla,
  type ExhibitionRequest,
  type MatchedResource,
} from "../_lib/exhibitions";
import { adminWorkflowActions } from "../_lib/workflowActions";

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
}: ExhibitionDetailDrawerProps) {
  const t = useTranslations("adminExhibitions");
  const locale = useLocale();
  if (!item) return null;

  const sla = getSla(item);
  const days = dayCount(item.eventStartDate, item.eventEndDate);
  const { next, others } = adminWorkflowActions(item.status);
  const approved = item.approvedBudget ?? 0;
  const actual = item.actualSpend ?? 0;
  const utilization = approved ? Math.min(100, Math.round((actual / approved) * 100)) : 0;
  const place = [item.venue, item.eventLocation, item.country].filter(Boolean).join(" · ");
  const breakdown = [
    { key: "stall", label: t("venueCost"), value: item.budgetBreakdown?.stallCost ?? 0, icon: Building2 },
    { key: "marketing", label: t("marketingMaterial"), value: item.budgetBreakdown?.marketingMaterial ?? 0, icon: Megaphone },
    { key: "travel", label: t("travel"), value: item.budgetBreakdown?.travel ?? 0, icon: Plane },
    { key: "accommodation", label: t("accommodation"), value: item.budgetBreakdown?.accommodation ?? 0, icon: Hotel },
    { key: "misc", label: t("miscellaneous"), value: item.budgetBreakdown?.miscellaneous ?? 0, icon: Package },
  ].filter((line) => line.value > 0);

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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-muted/15 card-pad text-sm">
          <Fact label={t("agent")}>
            <span className="block truncate">{item.agentId?.name ?? "-"}</span>
            {item.agentId?.email && <span className="block truncate text-xs font-normal text-muted-foreground">{item.agentId.email}</span>}
          </Fact>
          <Fact label={t("dates")}>
            {formatDateRange(item, locale)}
            {days ? <span className="text-xs font-normal text-muted-foreground"> · {days} {t("days")}</span> : null}
          </Fact>
          <Fact label={t("location")}>{place || t("tbd")}</Fact>
          <Fact label={t("expectedLeads")}>{item.expectedLeads ?? "-"}</Fact>
          <Fact label={t("priority")}>
            <Badge className={`${PRIORITY_BADGES[item.priority] ?? PRIORITY_BADGES.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
              {t(PRIORITY_LABEL_KEYS[item.priority] ?? "medium")}
            </Badge>
          </Fact>
          <Fact label={t("sla")}>
            <span className={sla.className}>{t(sla.labelKey, { days: sla.days })}</span>
          </Fact>
          <Fact label={t("submittedHeader")}>{formatDate(item.createdAt, locale)}</Fact>
          <Fact label={t("booths")}>{item.participationTypes?.includes("booth") ? t("requested") : t("notRequested")}</Fact>
          {item.assignedTeam?.length ? <Fact label={t("assignedTeam")} wide>{item.assignedTeam.join(", ")}</Fact> : null}
        </dl>

        <p className="text-sm leading-6 text-muted-foreground">{item.description || item.executionPlan || t("noDescriptionProvided")}</p>

        <Section title={t("budget")}>
          <div className={`grid grid-cols-2 gap-2 ${typeof item.recommendedBudget === "number" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <Tile label={t("requestedLabel")} value={formatMoney(item.estimatedBudget, item.budgetCurrency)} />
            {typeof item.recommendedBudget === "number" && (
              <Tile label={t("superAgentRecommended")} value={formatMoney(item.recommendedBudget, item.budgetCurrency)} />
            )}
            <Tile label={t("approvedLabel")} value={formatMoney(item.approvedBudget, item.budgetCurrency)} accent={item.approvedBudget ? "text-emerald-600" : undefined} />
            <Tile label={t("actualLabel")} value={formatMoney(item.actualSpend, item.budgetCurrency)} />
          </div>
          {approved > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("utilized")}</span>
                <span className="font-semibold text-foreground">{utilization}%</span>
              </div>
              <Progress value={utilization} className="h-2" />
            </div>
          )}
          {breakdown.length > 0 && (
            <ul className="mt-3 divide-y divide-border/60 rounded-xl border border-border/60">
              {breakdown.map(({ key, label, value, icon: Icon }) => (
                <li key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {label}
                  </span>
                  <span className="font-semibold">{formatMoney(value, item.budgetCurrency)}</span>
                </li>
              ))}
            </ul>
          )}
          {item.budgetNotes && <p className="mt-2 text-xs text-muted-foreground">{item.budgetNotes}</p>}
        </Section>

        <Section title={t("workflow")}>
          <WorkflowTimeline item={item} />
        </Section>

        {item.requiredResources?.length > 0 && (
          <Section title={t("resources")}>
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
          </Section>
        )}
      </div>

      {(next || others.length > 0) && (
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
          </div>
          <p className="mt-2 hidden text-[11px] text-muted-foreground md:block">{t("escCloseLeftRightNavigateAApproveRReject")}</p>
        </footer>
      )}
    </aside>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="heading-label mb-3 font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 chip-pad">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

const WORKFLOW_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  under_review: 1,
  revision_requested: 1,
  approved: 2,
  budget_approved: 3,
  resources_assigned: 4,
  active: 4,
  completed: 5,
};

/**
 * The approval steps, stamped only from recorded history. The previous version
 * filled a step's time with the submission time and its owner with an English
 * role name when nothing had been recorded, so every request looked reviewed.
 */
function WorkflowTimeline({ item }: { item: ExhibitionRequest }) {
  const t = useTranslations("adminExhibitions");
  const locale = useLocale();
  const currentIndex = WORKFLOW_INDEX[item.status] ?? 1;
  const historyByStatus = new Map((item.statusHistory ?? []).map((entry) => [entry.status, entry]));
  const steps = [
    { key: "submitted", label: t("agentSubmitted"), at: item.createdAt, by: item.agentId?.name },
    { key: "under_review", label: t("teamLeaderReviewLabel") },
    { key: "approved", label: t("financeBudgetReview") },
    // After finance approves the budget the admin assigns resources, then the
    // event runs. There is no super-agent step here: the API gives super agents
    // no move past their own review. The old labels said "Super Agent Approval"
    // and "Admin Verification".
    { key: "budget_approved", label: t("stageResourcing") },
    { key: "resources_assigned", label: t("stageDelivery") },
  ];

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const history = historyByStatus.get(step.key);
        const rejected = item.status === "rejected";
        const isDone = rejected ? index === 0 || Boolean(history) : item.status === "completed" || index < currentIndex;
        const isCurrent = !rejected && !isDone && index === currentIndex;
        const at = history?.changedAt ?? (index === 0 ? step.at : undefined);
        const by = history?.changedBy?.name ?? (index === 0 ? step.by : undefined);
        const note = history?.note || history?.statusReason;
        const tone = isCurrent
            ? "border-primary bg-primary/10 text-primary"
            : isDone
              ? "border-emerald-500 bg-emerald-50 text-emerald-600"
              : "border-border bg-muted text-muted-foreground";
        return (
          <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && <span className="absolute start-[13px] top-7 h-[calc(100%-1.4rem)] w-px bg-border" aria-hidden="true" />}
            <span className={`z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${tone}`}>
              {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : isCurrent ? <CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  {isCurrent ? t("currentStatusLabel") : isDone ? t("doneStatusLabel") : t("waitingStatusLabel")}
                </span>
              </div>
              {(at || by) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[at ? formatDateTime(at, locale) : null, by].filter(Boolean).join(" · ")}
                </p>
              )}
              {note && <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">{note}</p>}
            </div>
          </li>
        );
      })}
      {item.status === "rejected" && (
        <li className="mt-3 rounded-xl border border-red-200 bg-red-50/60 chip-pad">
          <p className="text-sm font-semibold text-red-700">{t("rejectedStatusLabel")}</p>
          <p className="mt-1 text-xs text-red-600">{item.reviewNote || t("requestRejected")}</p>
        </li>
      )}
    </ol>
  );
}
