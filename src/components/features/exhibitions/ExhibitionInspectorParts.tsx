"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Building2, Check, CheckCircle2, ChevronDown, Circle, CircleDot, Clock, Hotel, Megaphone, Package, Plane, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatCount, formatDate, formatDateTime } from "@/lib/ui/intlFormat";
import { PAYMENT_APPROVED_STATUSES, eventHasStarted, isSettled } from "@/lib/exhibitions/transitions";
import { ApprovalTimeline, type TimelineEntry } from "./ApprovalTimeline";

/**
 * The pieces of an exhibition request's detail view that the admin drawer and
 * the super agent's panel share, so both read the same way: facts, the budget
 * tiles, and the workflow steps (client feedback 2026-10-15: "uniformity").
 */

export function InspectorFact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{children}</dd>
    </div>
  );
}

export function InspectorSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="heading-label font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 chip-pad">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

interface BudgetItem {
  estimatedBudget?: number;
  recommendedBudget?: number;
  approvedBudget?: number;
  actualSpend?: number;
  budgetCurrency?: string;
  budgetNotes?: string;
  budgetBreakdown?: { stallCost?: number; marketingMaterial?: number; travel?: number; accommodation?: number; miscellaneous?: number };
}

const money = (amount: number | undefined | null, currency = "") => (amount == null ? "-" : `${currency} ${formatCount(amount)}`.trim());

/** Requested, the super agent's recommendation, approved and actual spend, then the breakdown. */
export function BudgetTiles({ item }: { item: BudgetItem }) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const currency = item.budgetCurrency ?? "";
  const approved = item.approvedBudget ?? 0;
  const spendRecorded = typeof item.actualSpend === "number";
  const utilization = approved ? Math.min(100, Math.round(((item.actualSpend ?? 0) / approved) * 100)) : 0;
  const breakdown = [
    { key: "stall", label: t("venueCost"), value: item.budgetBreakdown?.stallCost ?? 0, icon: Building2 },
    { key: "marketing", label: t("marketingMaterial"), value: item.budgetBreakdown?.marketingMaterial ?? 0, icon: Megaphone },
    { key: "travel", label: t("travel"), value: item.budgetBreakdown?.travel ?? 0, icon: Plane },
    { key: "accommodation", label: t("accommodation"), value: item.budgetBreakdown?.accommodation ?? 0, icon: Hotel },
    { key: "misc", label: t("miscellaneous"), value: item.budgetBreakdown?.miscellaneous ?? 0, icon: Package },
  ].filter((line) => line.value > 0);
  const hasRecommendation = typeof item.recommendedBudget === "number";
  // What settling the event comes to: unused money back, or the overspend.
  const balance = approved > 0 && spendRecorded ? approved - (item.actualSpend ?? 0) : null;
  const tileCount = 3 + (hasRecommendation ? 1 : 0) + (balance !== null ? 1 : 0);

  return (
    <>
      <div className={`grid grid-cols-2 gap-2 ${tileCount === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {/* 0 is the form's default, not a figure the agent asked for. */}
        <Tile label={t("requestedLabel")} value={money(item.estimatedBudget || null, currency)} />
        {hasRecommendation && <Tile label={t("superAgentRecommended")} value={money(item.recommendedBudget, currency)} />}
        <Tile label={t("approvedLabel")} value={money(item.approvedBudget, currency)} accent={item.approvedBudget ? "text-emerald-600" : undefined} />
        <Tile label={t("actualLabel")} value={money(item.actualSpend, currency)} />
        {balance !== null && (
          <Tile
            label={balance < 0 ? tx("balanceOverspent") : tx("balanceUnused")}
            value={money(Math.abs(balance), currency)}
            accent={balance < 0 ? "text-red-600" : "text-foreground"}
          />
        )}
      </div>
      {approved > 0 && spendRecorded && (
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
              <span className="font-semibold">{money(value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {item.budgetNotes && <p className="mt-2 text-xs text-muted-foreground">{item.budgetNotes}</p>}
    </>
  );
}

interface WorkflowItem {
  status: string;
  createdAt?: string;
  reviewNote?: string;
  eventStartDate?: string;
  agentId?: { name?: string } | null;
  statusHistory?: TimelineEntry[];
  completionReport?: { completedAt?: string; completedBy?: { name?: string } | string | null } | null;
}

type Viewer = "agent" | "super_agent" | "admin";

/**
 * One line at the top of a request: who it is waiting on, in the viewer's
 * terms (owner, 2026-10-15: the detail view has to say where it stands).
 */
export function WaitingOn({ item, viewer }: { item: WorkflowItem; viewer: Viewer }) {
  const tx = useTranslations("exhibitions");
  const locale = useLocale();
  const settled = isSettled(item);
  const started = eventHasStarted(item.eventStartDate);
  const { key, owner, tone }: { key: string; owner?: Viewer; tone: "wait" | "done" | "stop" } = (() => {
    if (item.status === "draft") return { key: "waitingDraft", owner: "agent", tone: "wait" };
    if (item.status === "submitted" || item.status === "under_review") return { key: "waitingSuperAgent", owner: "super_agent", tone: "wait" };
    if (item.status === "revision_requested") return { key: "waitingAgentChanges", owner: "agent", tone: "wait" };
    if (item.status === "approved") return { key: "waitingAdminPayment", owner: "admin", tone: "wait" };
    if (PAYMENT_APPROVED_STATUSES.includes(item.status)) {
      return started ? { key: "waitingAgentReport", owner: "agent", tone: "wait" } : { key: "waitingEventDate", tone: "wait" };
    }
    // Completed is the final record; the admin fills in an outcome the report left out.
    if (item.status === "completed") {
      return item.completionReport ? { key: "waitingCompleted", tone: "done" } : { key: "waitingOutcomeMissing", owner: "admin", tone: "wait" };
    }
    if (item.status === "rejected") return { key: "waitingRejected", tone: "stop" };
    return { key: settled ? "waitingCompleted" : "waitingArchived", tone: settled ? "done" : "stop" };
  })();
  const yourTurn = owner === viewer;
  const Icon = tone === "done" ? CheckCircle2 : tone === "stop" ? XCircle : Clock;
  const date = item.eventStartDate ? formatDate(item.eventStartDate, { day: "2-digit", month: "short", year: "numeric" }, locale) : "";
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
        tone === "done"
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
          : tone === "stop"
            ? "border-border bg-muted/30 text-muted-foreground"
            : yourTurn
              ? "border-primary/30 bg-primary/5 text-foreground"
              : "border-amber-200 bg-amber-50/70 text-amber-950"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{tx(key, { date })}</span>
      {yourTurn && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{tx("yourTurn")}</span>}
    </p>
  );
}

/** Where each status sits on the four steps; 4 means all done. */
const WORKFLOW_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  under_review: 1,
  revision_requested: 1,
  approved: 2,
  budget_approved: 3,
  resources_assigned: 3,
  active: 3,
  completed: 4,
  archived: 4,
};

const actorName = (by: TimelineEntry["changedBy"]) => (by && typeof by === "object" ? by.name : undefined);

/**
 * The approval steps, stamped only from recorded history, then the full
 * history (priority changes, edits, send-backs) folded away underneath.
 * Four steps for three people (owner, 2026-10-15): the agent submits, the
 * super agent verifies, the admin approves the payment and the support, and
 * the event runs and is reported. Completed is final; the balance shows in
 * the budget tiles.
 */
export function WorkflowSteps({ item }: { item: WorkflowItem }) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const locale = useLocale();
  const [showHistory, setShowHistory] = useState(false);
  const settled = isSettled(item);
  // An archived rejection reads like a rejection, not a finished event.
  const rejected = item.status === "rejected" || (item.status === "archived" && !settled);
  const currentIndex = WORKFLOW_INDEX[item.status] ?? 1;
  const history = item.statusHistory ?? [];
  // The latest move into each stage. Entries written while the request stays
  // there (a priority change, an edit, an outcome update) repeat the status;
  // taking the last entry put those notes and times on the step.
  const historyByStatus = new Map<string, TimelineEntry>();
  history.forEach((entry, index, all) => {
    if (index === 0 || all[index - 1].status !== entry.status) historyByStatus.set(entry.status, entry);
  });
  const steps: { key: string; doneBy: string; label: string; at?: string; by?: string }[] = [
    // `doneBy` is the move that finishes the step: the super agent's approval
    // ends their review, the payment approval ends the admin's, and so on.
    { key: "submitted", doneBy: "submitted", label: t("agentSubmitted"), at: item.createdAt, by: item.agentId?.name },
    { key: "verify", doneBy: "approved", label: t("teamLeaderReviewLabel") },
    { key: "payment", doneBy: "budget_approved", label: t("stagePaymentApproval") },
    // The event runs on its dates; the step is done once it is reported.
    {
      key: "event",
      doneBy: "completed",
      label: t("stageEventReport"),
      at: item.completionReport?.completedAt,
      by: typeof item.completionReport?.completedBy === "object" ? item.completionReport?.completedBy?.name : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const entry = historyByStatus.get(step.doneBy);
          const isDone = rejected ? index === 0 || Boolean(entry) : index < currentIndex;
          const isCurrent = !rejected && !isDone && index === currentIndex;
          const at = entry?.changedAt ?? step.at;
          const by = actorName(entry?.changedBy) ?? step.by;
          const note = entry?.note || entry?.statusReason;
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
                {(at || by) && (isDone || isCurrent) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[at ? formatDateTime(at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, locale) : null, by].filter(Boolean).join(" · ")}
                  </p>
                )}
                {note && isDone && <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">{note}</p>}
              </div>
            </li>
          );
        })}
        {rejected && (
          <li className="mt-3 rounded-xl border border-red-200 bg-red-50/60 chip-pad">
            <p className="text-sm font-semibold text-red-700">{t("rejectedStatusLabel")}</p>
            <p className="mt-1 text-xs text-red-600">{item.reviewNote || t("requestRejected")}</p>
          </li>
        )}
      </ol>
      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((open) => !open)}
            aria-expanded={showHistory}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-0"
          >
            <ChevronDown className={`size-4 transition-transform ${showHistory ? "rotate-180" : ""}`} aria-hidden="true" />
            {tx(showHistory ? "hideFullHistory" : "showFullHistory", { count: history.length })}
          </button>
          {showHistory && (
            <div className="mt-3 rounded-xl border border-border/60 p-3">
              <ApprovalTimeline entries={history} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
