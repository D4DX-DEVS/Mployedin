"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Dot, FolderOpen, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReferredBadge } from "@/components/shared/ReferredBadge";
import { useInfiniteApplications, type ApplicationsFilters } from "@/hooks/useApplications";
import { OFF_PATH_STATUSES, STAGE_LABEL_KEYS, STAGE_DOT_CLASS } from "@/lib/hiring/pipeline";
import {
  DEFAULT_WORKFLOW_STAGE_DEFS,
  columnCounts,
  stageForApplication,
  workflowColumns,
  type WorkflowStageDef,
} from "@/lib/hiring/workflowStages";
import { useStageLabel } from "@/components/features/workflow/WorkflowStageChips";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Applicant } from "./ApplicationsWorkspace";

/**
 * Cards fetched per column page. A stage with 900 candidates renders 20 cards
 * and a "Load more" — the DOM never holds the whole stage.
 */
export const BOARD_PAGE_SIZE = 20;
/** `gap-3` between columns; turns a scroll offset into a stage index on phones. */
const COLUMN_GAP_PX = 12;

type BoardFilters = Omit<ApplicationsFilters, "page" | "limit" | "status" | "jobId" | "fetchJobs" | "fetchCounts">;

export interface ApplicationsBoardProps {
  jobId: string;
  locale: string;
  baseFilters: BoardFilters;
  statusCounts?: Record<string, number>;
  /** The job's workflow stages; the columns. Absent = the standard pipeline. */
  stages?: readonly WorkflowStageDef[];
  /** Per status + stage totals for the job, so split statuses show each column's own count. */
  stageCounts?: readonly { status: string; stageId?: string | null; count: number }[];
  onOpen: (app: Applicant, trigger?: HTMLElement | null) => void;
  /** `stageId` is passed only for a column that is one of several stages sharing a status. */
  onMove: (app: Applicant, status: string, stageId?: string) => Promise<void>;
}

/** A place a card can go: a column of the board, or an off-path status. */
interface MoveTarget {
  key: string;
  status: string;
  stageId: string | null;
  label: string;
}

// Shape of next-intl's translator, so the hooks' `t` can be passed straight down.
type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * The card being dragged, held at board level. Each column only knows its own
 * rows, so a drop handler that looked the id up in the *target* column's list
 * never found the card and the drop silently did nothing — the bug behind
 * "drag not working". `dataTransfer` still carries the id (Firefox refuses to
 * start a drag without data) but the object itself travels through this ref.
 */
type DragState = MutableRefObject<{ app: Applicant; fromKey: string } | null>;

function initials(name?: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "•";
}

function getCandidateName(app: Applicant): string {
  const user = app.jobSeekerId?.userId;
  return typeof user === "object" ? user?.name ?? "" : "";
}

function getCurrentRole(app: Applicant): string {
  return app.jobSeekerId?.experience?.find((e) => e.isCurrent)?.jobTitle ?? "";
}

function getAiMatchColor(score?: number): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-status-selected";
  if (score >= 70) return "text-status-applied";
  if (score >= 50) return "text-status-shortlisted";
  return "text-status-rejected";
}

function getAiMatchBg(score?: number): string {
  if (score == null) return "bg-secondary/50";
  if (score >= 80) return "bg-status-selected-bg";
  if (score >= 70) return "bg-status-applied-bg";
  if (score >= 50) return "bg-status-shortlisted-bg";
  return "bg-status-rejected-bg";
}

function getCandidateAvatar(app: Applicant): string | undefined {
  const u = app.jobSeekerId?.userId;
  return typeof u === "object" ? u?.avatar : undefined;
}

function daysSinceDate(dateStr?: string): number {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const today = new Date();
  const ms = today.getTime() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

interface BoardCardProps {
  app: Applicant;
  /** The column this card is shown in. */
  columnKey: string;
  moveTargets: readonly MoveTarget[];
  t: Translate;
  onOpen: (app: Applicant, trigger?: HTMLElement | null) => void;
  onMoveCard: (app: Applicant, target: MoveTarget) => Promise<void>;
  isMoving: boolean;
  dragState: DragState;
}

function BoardCard({
  app,
  columnKey,
  moveTargets,
  t,
  onOpen,
  onMoveCard,
  isMoving,
  dragState,
}: BoardCardProps) {
  const ta = useTranslations("employerApplications");
  const format = useFormatter();
  const candidateName = getCandidateName(app);
  const role = getCurrentRole(app);
  const daysInStage = daysSinceDate(app.appliedAt);
  const isNew = app.status === "applied" && !app.viewedByEmployerAt;
  const appliedOn = app.appliedAt ? format.dateTime(new Date(app.appliedAt), { month: "short", day: "numeric" }) : "";

  return (
    // Mouse users can click anywhere on the card; the keyboard target is the
    // name button below. The card itself is not a role=button, because the
    // move menu inside it would be an interactive control nested in another.
    <article
      data-app-id={app._id}
      onClick={() => onOpen(app)}
      aria-busy={isMoving || undefined}
      draggable={!isMoving}
      onDragStart={(e) => {
        dragState.current = { app, fromKey: columnKey };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", app._id);
        }
      }}
      onDragEnd={() => {
        dragState.current = null;
      }}
      className={cn(
        "workspace-panel-surface group rounded-2xl p-3 cursor-grab transition-all hover:shadow-md active:cursor-grabbing",
        isMoving && "opacity-60 pointer-events-none"
      )}
    >
      {/* Name row: a small avatar and the name only. With six columns in a
          row a card is ~160px wide; the 32px avatar + 32px menu that used to
          share this row left "Job S…" of the name. The menu sits in the
          footer instead. */}
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <Avatar className="h-6 w-6 shrink-0">
          {getCandidateAvatar(app) ? <AvatarImage src={getCandidateAvatar(app)!} alt="" /> : null}
          <AvatarFallback className="text-[10px] font-semibold">{initials(candidateName)}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(app, e.currentTarget); }}
          className="min-w-0 flex-1 truncate rounded text-start text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title={candidateName || undefined}
        >
          {candidateName || "—"}
        </button>
      </div>
      {app.isAgentReferred && (
        <div className="mb-1.5">
          <ReferredBadge size="xs" />
        </div>
      )}
      {isNew && (
        <div className="mb-1.5 inline-flex items-center gap-1 text-xs text-status-applied font-medium">
          <Dot className="h-2 w-2 bg-status-applied rounded-full" aria-hidden /> {ta("newBadge")}
        </div>
      )}

      {/* Current role */}
      {role && <p className="mb-2 text-xs text-muted-foreground truncate" title={role}>{role}</p>}

      {/* AI match score */}
      {app.aiMatchScore != null && (
        <div className={cn("mb-2 inline-flex px-2 py-1 rounded text-xs font-semibold", getAiMatchBg(app.aiMatchScore), getAiMatchColor(app.aiMatchScore))}>
          {t("boardMatch", { score: app.aiMatchScore })}
        </div>
      )}

      {/* Footer: applied date + days in stage, with the move menu at the end.
          The menu stays beside drag-and-drop: it is the keyboard and touch
          path, and the only way to Reject from the board. */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          <p className="truncate">{t("boardApplied", { date: appliedOn })}</p>
          <p className="truncate">{t("boardDaysInStage", { days: daysInStage })}</p>
        </div>
        {/* Opening the menu must not also open the candidate: the click stops here. */}
        <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-70 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100" aria-label={t("boardMoveTo")}>
              <MoreVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {/* The job's stages are the move targets; Reject is its own verb
                and Withdrawn belongs to the candidate. */}
            {moveTargets
              .filter((target) => target.key !== columnKey)
              .map((target) => (
                <DropdownMenuItem key={target.key} onClick={() => void onMoveCard(app, target)}>
                  {target.label}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onMoveCard(app, { key: "rejected", status: "rejected", stageId: null, label: t("boardReject") })} className="text-destructive">
              {t("boardReject")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

interface BoardColumnProps {
  /** The column's identity (a stage id, or the status for a single-stage status). */
  columnKey: string;
  status: string;
  /** Set when the column is one of several stages sharing `status`. */
  stageId: string | null;
  label: string;
  /** Whole-job count for this status from the list's `statusCounts`; shown until the column's own total arrives. */
  count: number;
  jobId: string;
  baseFilters: BoardFilters;
  t: Translate;
  moveTargets: readonly MoveTarget[];
  onOpen: (app: Applicant, trigger?: HTMLElement | null) => void;
  onMoveCard: (app: Applicant, target: MoveTarget) => Promise<void>;
  movingId: string | null;
  dragState: DragState;
  /** Below xl the board scrolls sideways; wider than six columns it scrolls on xl too. */
  fitsRow?: boolean;
  /**
   * `column`: a pipeline stage — header, vertical card stack, drop target.
   * `strip`: rows of an off-path status inside the "Rejected & withdrawn"
   * strip under the board — no header, cards wrap in a grid, not droppable
   * (Reject is a menu verb, Withdrawn is the candidate's).
   */
  layout?: "column" | "strip";
}

function BoardColumn({
  columnKey,
  status,
  stageId,
  label,
  count,
  jobId,
  baseFilters,
  t,
  moveTargets,
  onOpen,
  onMoveCard,
  movingId,
  dragState,
  fitsRow = true,
  layout = "column",
}: BoardColumnProps) {
  // Each stage loads its own pages: 20 cards, then "Load more" appends the
  // next 20. A job with 2,000 applications never renders 2,000 cards.
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteApplications({
    jobId,
    status,
    ...(stageId ? { stageId } : {}),
    limit: BOARD_PAGE_SIZE,
    ...baseFilters,
  });

  const applications = (data?.pages.flatMap((page) => page.applications ?? []) ?? []) as Applicant[];
  const shown = applications.length;
  // The server total under the current filters. The header uses it once it is
  // known so "Applied 842" and "Showing 20 of 842" always agree.
  const total = data?.pages[0]?.pagination?.total ?? count;
  const showProgress = !isLoading && !isError && total > BOARD_PAGE_SIZE;
  const [isOver, setIsOver] = useState(false);
  const droppable = layout === "column";

  const dropHandlers = droppable
    ? {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          // Required, or the browser refuses the drop.
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          if (!isOver) setIsOver(true);
        },
        onDragLeave: (e: React.DragEvent<HTMLElement>) => {
          // Leaving for a child (a card, the empty-state icon) is not leaving.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsOver(false);
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          e.preventDefault();
          setIsOver(false);
          const drag = dragState.current;
          dragState.current = null;
          if (!drag || drag.fromKey === columnKey) return;
          void onMoveCard(drag.app, { key: columnKey, status, stageId, label });
        },
      }
    : {};

  const spanStrip = layout === "strip" && "sm:col-span-2 xl:col-span-3";

  const cards = (
    <>
      {isLoading ? (
        [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/50" />)
      ) : isError ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-2">{t("loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : shown === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground mb-2" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("boardEmptyColumn")}</p>
        </div>
      ) : (
        applications.map((app) => (
          <BoardCard
            key={app._id}
            app={app}
            columnKey={columnKey}
            moveTargets={moveTargets}
            t={t}
            onOpen={onOpen}
            onMoveCard={onMoveCard}
            isMoving={movingId === app._id}
            dragState={dragState}
          />
        ))
      )}

      {/* "Showing 20 of 842": says out loud that the stage is bigger than the
          cards on screen, and stays once everything is loaded. */}
      {showProgress && (
        <p className={cn("pt-1 text-center text-xs text-muted-foreground", spanStrip)} aria-live="polite">
          {t("boardShowing", { shown, total })}
        </p>
      )}

      {hasNextPage && (
        <Button
          variant="outline"
          className={cn("w-full min-h-11 sm:min-h-9", spanStrip)}
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? t("boardLoadingMore") : t("boardLoadMore")}
        </Button>
      )}
    </>
  );

  if (layout === "strip") {
    return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{cards}</div>;
  }

  return (
    <section
      aria-label={t("boardColumnLabel", { stage: label, count: total })}
      data-board-column={columnKey}
      data-drop-over={isOver || undefined}
      {...dropHandlers}
      // Phones: one stage fills the board and the row snaps stage by stage.
      // Small screens: 256px columns. Tablets/laptops (md–lg): three whole
      // columns per screen, so no column is cut at the edge of the board and
      // the sideways scroll moves in full stages. From xl the six stages
      // share the row, nothing off-screen.
      className={cn(
        "flex min-h-0 shrink-0 basis-full snap-center flex-col rounded-2xl transition-colors sm:basis-64 md:basis-[calc((100%-1.5rem)/3)] sm:snap-start",
        fitsRow ? "xl:min-w-0 xl:basis-auto" : "xl:basis-64",
        isOver && "bg-primary/5 ring-2 ring-primary/40"
      )}
    >
      {/* Column header: outside the scrolling body, so it stays put however
          far down a long stage the recruiter has gone. */}
      <div className="workspace-panel-surface shrink-0 rounded-t-2xl border-b px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("h-2 w-2 rounded-full shrink-0", STAGE_DOT_CLASS[status as keyof typeof STAGE_DOT_CLASS] ?? "bg-gray-300")} aria-hidden />
          <span className="text-sm font-semibold text-foreground truncate">{label}</span>
          <span className="text-xs font-medium text-muted-foreground shrink-0">{total}</span>
        </div>
      </div>

      {/* Column body: scrolls on its own. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 sm:p-3" data-board-column-body>{cards}</div>
    </section>
  );
}

// Pager geometry, read from the DOM: the stride is one column plus the gap,
// and a screen holds however many whole columns fit the scroller.
function stageStride(el: HTMLDivElement): number {
  const column = el.querySelector<HTMLElement>("[data-board-column]");
  return (column?.offsetWidth || el.clientWidth) + COLUMN_GAP_PX;
}
function stagesPerScreen(el: HTMLDivElement, columns: number): number {
  return Math.max(1, Math.min(columns, Math.floor((el.clientWidth + COLUMN_GAP_PX + 1) / stageStride(el))));
}

/** More columns than this and the board scrolls sideways on wide screens too. */
const MAX_COLUMNS_IN_ROW = 6;

export function ApplicationsBoard({
  jobId,
  baseFilters,
  statusCounts,
  stages = DEFAULT_WORKFLOW_STAGE_DEFS,
  stageCounts,
  onOpen,
  onMove,
}: ApplicationsBoardProps) {
  const t = useTranslations("employerJobWorkspace");
  const tp = useTranslations("hiringPipeline");
  const stageLabel = useStageLabel();

  // Columns: the job's stages, plus any status the workflow skips while
  // candidates sit in it (an interview or offer made elsewhere moves them there).
  const columns = workflowColumns(stages, statusCounts ?? {}).map((column) => ({
    ...column,
    key: column.stageId ?? column.phase,
    label: column.stage ? stageLabel(column.stage) : tp(STAGE_LABEL_KEYS[column.phase]),
  }));
  const perColumn = stageCounts ? columnCounts(stages, stageCounts) : null;
  const countFor = (column: (typeof columns)[number]): number =>
    column.stageId && perColumn ? perColumn[`stage:${column.stageId}`] ?? 0 : statusCounts?.[column.phase] ?? 0;
  const moveTargets: MoveTarget[] = columns.map((c) => ({ key: c.key, status: c.phase, stageId: c.stageId, label: c.label }));
  const fitsRow = columns.length <= MAX_COLUMNS_IN_ROW;
  const [collapsedOffPath, setCollapsedOffPath] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);
  const dragState: DragState = useRef(null);

  // Stage pager (below xl): which stages are on screen right now. A phone
  // shows one column, a tablet three; the stride is the real column width
  // plus the gap, so offset / stride is the first visible stage. The arrows
  // step by a whole screen. From xl all six stages fit and the pager hides.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [visibleStages, setVisibleStages] = useState(1);
  const lastStage = columns.length - 1;
  const firstStageOfLastScreen = Math.max(0, columns.length - visibleStages);
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current;
      if (el) setVisibleStages(stagesPerScreen(el, columns.length));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [columns.length]);
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(Math.abs(el.scrollLeft) / stageStride(el));
    setActiveStage(Math.max(0, Math.min(lastStage, idx)));
  };
  const scrollToStage = (index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(firstStageOfLastScreen, index));
    // Chrome counts RTL scroll offsets down from zero.
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: (rtl ? -1 : 1) * next * stageStride(el), behavior: "smooth" });
    setActiveStage(next);
  };
  const pagerLabel = visibleStages > 1
    ? t("boardStagesOf", { from: activeStage + 1, to: Math.min(columns.length, activeStage + visibleStages), count: columns.length })
    : t("boardStageOf", { index: activeStage + 1, count: columns.length });

  // One move path for drag-and-drop and the card menu: dim the card, PATCH,
  // toast the outcome. The columns refetch when the workspace invalidates.
  const moveCard = async (app: Applicant, target: MoveTarget) => {
    if (movingId) return;
    const current = stageForApplication(stages, app.status, app.stageId);
    const sameStatus = target.status === app.status;
    if (sameStatus && (!target.stageId || target.stageId === current?.id)) return;
    const name = getCandidateName(app);
    setMovingId(app._id);
    try {
      if (target.stageId) await onMove(app, target.status, target.stageId);
      else await onMove(app, target.status);
      toast.success(t("boardMoved", { name, stage: target.label }));
    } catch {
      toast.error(t("boardMoveError", { name }));
    } finally {
      setMovingId(null);
    }
  };

  const offPathStatuses = OFF_PATH_STATUSES.map((status) => ({
    status,
    label: tp(STAGE_LABEL_KEYS[status]),
    count: statusCounts?.[status] ?? 0,
  }));
  const offPathTotal = offPathStatuses.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-3">
      {/* Below xl: the stage pager sits above the board so "Stage 1 of 6" (or
          "Stages 1–3 of 6" on a tablet) and the arrows are on screen without
          scrolling past a 70vh column. Swiping the board works too. */}
      <div className={cn("flex items-center justify-between gap-2", fitsRow && "xl:hidden")} data-board-pager>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 rounded-xl p-0"
          aria-label={t("boardPrevStage")}
          onClick={() => scrollToStage(activeStage - visibleStages)}
          disabled={activeStage === 0}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <p className="min-w-0 truncate text-center text-xs font-medium text-muted-foreground" aria-live="polite">
          {pagerLabel}
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 rounded-xl p-0"
          aria-label={t("boardNextStage")}
          onClick={() => scrollToStage(activeStage + visibleStages)}
          disabled={activeStage >= firstStageOfLastScreen}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
      </div>

      {/* The board viewport: a fixed-height box that scrolls sideways on its
          own. The page never scrolls horizontally; each column scrolls
          vertically inside it. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        data-board-scroller
        style={fitsRow ? ({ "--board-cols": columns.length } as React.CSSProperties) : undefined}
        className={cn(
          "flex h-[70vh] min-h-[24rem] snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain",
          fitsRow && "xl:grid xl:grid-cols-[repeat(var(--board-cols),minmax(0,1fr))] xl:snap-none xl:overflow-visible",
        )}
      >
        {columns.map((column) => (
          <BoardColumn
            key={column.key}
            columnKey={column.key}
            status={column.phase}
            stageId={column.stageId}
            label={column.label}
            count={countFor(column)}
            jobId={jobId}
            baseFilters={baseFilters}
            t={t}
            moveTargets={moveTargets}
            onOpen={onOpen}
            onMoveCard={moveCard}
            movingId={movingId}
            dragState={dragState}
            fitsRow={fitsRow}
          />
        ))}
      </div>

      {/* Rejected & withdrawn: a strip under the board, not a seventh column,
          so the six stages fit the row on a laptop and the off-path rows read
          as what they are — out of the funnel. */}
      <section aria-labelledby="board-off-path-heading" className="workspace-panel-surface rounded-2xl">
        <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <h3 id="board-off-path-heading" className="text-sm font-semibold text-foreground truncate">{t("boardOffPath")}</h3>
            <span className="text-xs font-medium text-muted-foreground shrink-0">{offPathTotal}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            aria-expanded={!collapsedOffPath}
            onClick={() => setCollapsedOffPath((c) => !c)}
          >
            {collapsedOffPath ? t("boardShow") : t("boardHide")}
          </Button>
        </div>

        {!collapsedOffPath && (
          <div className="space-y-4 border-t border-border/60 p-3 sm:p-4">
            {offPathStatuses.some((s) => s.count > 0) ? (
              offPathStatuses
                .filter(({ count }) => count > 0)
                .map(({ status, label, count }) => (
                  <div key={status} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {label} ({count})
                    </p>
                    <BoardColumn
                      columnKey={status}
                      status={status}
                      stageId={null}
                      label={label}
                      count={count}
                      jobId={jobId}
                      baseFilters={baseFilters}
                      t={t}
                      moveTargets={moveTargets}
                      onOpen={onOpen}
                      onMoveCard={moveCard}
                      movingId={movingId}
                      dragState={dragState}
                      layout="strip"
                    />
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("boardEmptyColumn")}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
