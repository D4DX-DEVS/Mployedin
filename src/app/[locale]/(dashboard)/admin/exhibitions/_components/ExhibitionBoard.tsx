"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, GripVertical, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { cn } from "@/lib/utils";
import { adminCanMove } from "@/lib/exhibitions/transitions";
import type { ExhibitionRequestStatus } from "@/models/ExhibitionRequest";
import { PRIORITY_BADGES, PRIORITY_LABEL_KEYS, formatDate, formatMoney, type ExhibitionRequest } from "../_lib/exhibitions";
import { adminWorkflowActions } from "../_lib/workflowActions";

/**
 * Board columns, left to right in workflow order. `enter` is the status a card
 * takes when dropped into the column — the move goes through the same action
 * dialog as the queue's buttons, so a drop still asks for the budget, the
 * allocation or the reason that step needs. Payment approval decides the
 * support too, so the event column holds everything approved and not yet
 * reported, including requests left at the retired Resourcing and Live stages.
 */
const COLUMNS: { key: string; statuses: ExhibitionRequestStatus[]; enter: ExhibitionRequestStatus; titleKey: string; ns: "admin" | "ex"; tone: string }[] = [
  { key: "review", statuses: ["submitted", "under_review", "revision_requested"], enter: "under_review", titleKey: "teamLeaderReview", ns: "admin", tone: "bg-orange-500" },
  { key: "finance", statuses: ["approved"], enter: "approved", titleKey: "financeReviewStage", ns: "admin", tone: "bg-purple-500" },
  { key: "event", statuses: ["budget_approved", "resources_assigned", "active"], enter: "budget_approved", titleKey: "stageEvent", ns: "admin", tone: "bg-emerald-500" },
  { key: "done", statuses: ["completed"], enter: "completed", titleKey: "completedStage", ns: "admin", tone: "bg-slate-400" },
];

const PER_COLUMN = 30;

interface ColumnData {
  items: ExhibitionRequest[];
  total: number;
}

interface ExhibitionBoardProps {
  /** The page's filters minus status/stage (the columns are the status). */
  filterParams: URLSearchParams;
  /** Bump to reload every column. */
  refreshKey: number;
  onOpen: (item: ExhibitionRequest) => void;
  onAction: (item: ExhibitionRequest, status: string) => void;
  /** Show only these statuses in the table (a column's "+N more"). */
  onShowInTable: (statuses: ExhibitionRequestStatus[]) => void;
}

/**
 * Admin → Exhibitions as a board (client feedback 2026-10-14: "kanban table
 * for viewing the events status"). Each column is one stage of the workflow,
 * soonest event first; a card's button is the same next step the queue row
 * offers, and dragging a card one stage on opens that move.
 */
export function ExhibitionBoard({ filterParams, refreshKey, onOpen, onAction, onShowInTable }: ExhibitionBoardProps) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const locale = useLocale();
  const [columns, setColumns] = useState<Record<string, ColumnData>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState<ExhibitionRequest | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const query = filterParams.toString();

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const results = await Promise.all(
        COLUMNS.map(async (column) => {
          const params = new URLSearchParams(query);
          params.set("statuses", column.statuses.join(","));
          params.set("limit", String(PER_COLUMN));
          params.set("sortBy", "eventStartDate");
          params.set("sortOrder", "asc");
          const res = await fetch(`/api/exhibitions?${params}`);
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          return [column.key, { items: data.items ?? [], total: data.total ?? 0 }] as const;
        }),
      );
      setColumns(Object.fromEntries(results));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const drop = (column: (typeof COLUMNS)[number]) => {
    const card = dragging;
    setDragging(null);
    setOver(null);
    if (!card || column.statuses.includes(card.status as ExhibitionRequestStatus)) return;
    if (adminCanMove(card.status, column.enter)) { onAction(card, column.enter); return; }
    toast.info(tx("boardMoveNotAllowed"));
  };

  if (failed) return <ErrorState description={t("couldNotLoadExhibitionRequests")} onRetry={() => void load()} />;

  return (
    <div className="overflow-x-auto pb-2" role="region" aria-label={tx("boardView")}>
      <div className="flex min-w-max gap-3">
        {COLUMNS.map((column) => {
          const data = columns[column.key];
          const title = column.ns === "admin" ? t(column.titleKey) : tx(column.titleKey);
          return (
            <section
              key={column.key}
              aria-label={title}
              onDragOver={(event: DragEvent) => { if (dragging) { event.preventDefault(); setOver(column.key); } }}
              onDragLeave={() => setOver((current) => (current === column.key ? null : current))}
              onDrop={(event: DragEvent) => { event.preventDefault(); drop(column); }}
              className={cn(
                "flex w-[17rem] shrink-0 flex-col rounded-2xl border border-border/60 bg-muted/20 transition-colors",
                over === column.key && "border-primary/50 bg-primary/5",
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", column.tone)} aria-hidden="true" />
                  <span className="truncate">{title}</span>
                </h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
                  {loading ? "…" : data?.total ?? 0}
                </span>
              </header>
              <ul className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {loading
                  ? [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-24 w-full rounded-xl" /></li>)
                  : (data?.items ?? []).length === 0
                    ? <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{tx("boardEmpty")}</li>
                    : data!.items.map((item) => (
                        <BoardCard
                          key={item._id}
                          item={item}
                          locale={locale}
                          onOpen={onOpen}
                          onAction={onAction}
                          onDragStart={() => setDragging(item)}
                          onDragEnd={() => { setDragging(null); setOver(null); }}
                        />
                      ))}
              </ul>
              {!loading && data && data.total > data.items.length && (
                <Button variant="ghost" size="sm" className="m-2 mt-0 text-xs" onClick={() => onShowInTable(column.statuses)}>
                  {tx("boardMore", { count: data.total - data.items.length })}
                </Button>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-2 hidden text-[11px] text-muted-foreground md:block">{tx("boardDragHint")}</p>
    </div>
  );
}

function BoardCard({
  item,
  locale,
  onOpen,
  onAction,
  onDragStart,
  onDragEnd,
}: {
  item: ExhibitionRequest;
  locale: string;
  onOpen: (item: ExhibitionRequest) => void;
  onAction: (item: ExhibitionRequest, status: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("adminExhibitions");
  const { next } = adminWorkflowActions(item.status);
  const files = item.attachments?.length ?? 0;
  const budget = item.approvedBudget ?? item.estimatedBudget;

  return (
    <li
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      className="group rounded-xl border border-border/70 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden="true" />
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-start">
          <span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">{item.eventName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.agentId?.name ?? "-"}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Badge className={`${PRIORITY_BADGES[item.priority] ?? PRIORITY_BADGES.medium} rounded-md px-1.5 py-0 text-[11px] font-semibold`}>
          {t(PRIORITY_LABEL_KEYS[item.priority] ?? "medium")}
        </Badge>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3" aria-hidden="true" />
          {item.eventStartDate ? formatDate(item.eventStartDate, locale) : t("tbd")}
        </span>
        {files > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="size-3" aria-hidden="true" />
            {files}
          </span>
        )}
      </div>
      {/* No line for a request with no budget: "-" and "USD 0" read as data. */}
      {budget ? <p className="mt-1.5 text-xs font-medium text-foreground">{formatMoney(budget, item.budgetCurrency)}</p> : null}
      {next && (
        <Button size="sm" variant="outline" className="mt-2 h-8 w-full rounded-lg text-xs" onClick={() => onAction(item, next.status)}>
          <next.icon className="size-3.5" aria-hidden="true" />
          {t(next.labelKey)}
        </Button>
      )}
    </li>
  );
}
