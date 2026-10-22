"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { readQuery } from "@/lib/ui/urlQuery";
import {
  Plus, Clock, AlertCircle, CheckCircle2,
  Trash2, Calendar, PlayCircle, UserCheck, Undo2, XCircle, Eye,
} from "lucide-react";
import { STATUS_DOT, TaskStatusBadge, TaskStatusDialog, type AgentTaskStatus, type StatusChange } from "@/components/features/tasks/TaskStatusDialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { NewTaskDialog } from "./_components/NewTaskDialog";
import { AgentTaskDetailsPanel, type AgentTaskRow } from "./_components/AgentTaskDetailsPanel";
import { TaskLinkChips } from "./_components/TaskLinkChips";
import { useCopilotExecuted } from "@/components/shared/Copilot/events";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate } from "@/lib/ui/intlFormat";
import { useConfirm } from "@/hooks/useConfirm";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions, type RowPicker } from "@/components/shared/RowActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Task = AgentTaskRow;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-emerald-600 bg-emerald-50",
};

type TranslationFunction = ReturnType<typeof useTranslations>;

const getStatusOptions = (t: TranslationFunction) => [
  { value: "all", label: t("filterAllStatuses") },
  { value: "pending", label: t("statusPending") },
  { value: "in_progress", label: t("statusInProgress") },
  { value: "completed", label: t("statusCompleted") },
  { value: "failed", label: t("statusFailed") },
];

const getCategoryOptions = (t: TranslationFunction) => [
  { value: "follow_up", label: t("categoryFollowUp") },
  { value: "call", label: t("categoryCall") },
  { value: "meeting", label: t("categoryMeeting") },
  { value: "document", label: t("categoryDocument") },
  { value: "other", label: t("categoryOther") },
];

const getPriorityOptions = (t: TranslationFunction) => [
  { value: "high", label: t("priorityHigh") },
  { value: "medium", label: t("priorityMedium") },
  { value: "low", label: t("priorityLow") },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentTasksPage() {
  const t = useTranslations("agentTasks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const tConfirm = useTranslations("confirm");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, completed: 0, failed: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so the dashboard queue and the nav badge
  // can link straight to "overdue tasks" instead of dropping the agent on an
  // unfiltered list and asking them to narrow it again.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [dueFilter, setDueFilter] = useUrlFilter("due", "all");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  // assigned = from a super agent / admin (notifications link here); personal = own to-dos.
  const [kindFilter, setKindFilter] = useUrlFilter("kind", "all");
  // Every status change confirms with an optional note (kept in the task's
  // history); Completed / Failed on an assigned task goes to review.
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  // The side panel with everything about one task (same shape as the super agent's).
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);
  // The Create menu and ⌘K link `?new=1` so "New task" starts the task instead
  // of dropping the agent on the list beside the button that starts it.
  // Opened after mount: the server has no query string, so reading it in the
  // initialiser rendered the form on the client only (hydration mismatch).
  const [showForm, setShowForm] = useState(false);
  useEffect(() => {
    if (readQuery().get("new") === "1") setShowForm(true);
  }, []);


  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dueFilter !== "all") params.set("due", dueFilter);
      if (search.trim()) params.set("search", search.trim());
      if (kindFilter !== "all") params.set("kind", kindFilter);

      const res = await fetch(`/api/agent/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.items ?? []);
        updateTotal(data.total ?? 0);
        setStats(data.stats ?? { pending: 0, inProgress: 0, completed: 0, failed: 0, overdue: 0 });
      }
    } catch {
      toast.error(t("loadTasksFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dueFilter, search, kindFilter, page, limit, updateTotal, t]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  // A task the Copilot created or moved shows up without a reload.
  useCopilotExecuted(["create_task", "update_task_status"], () => void fetchTasks());
  useEffect(() => { resetPage(); }, [statusFilter, dueFilter, search, kindFilter, resetPage]);

  const deleteTask = async (id: string) => {
    const ok = await confirm({
      message: tConfirm("deleteMessage"),
      confirmLabel: tConfirm("delete"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/agent/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("taskDeletedSuccess"));
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t("deleteTaskFailed"));
      }
    } catch {
      toast.error(t("deleteTaskFailed"));
    }
  };

  // One status control for the row and the details panel. With the reviewer
  // (or accepted) the agent can't reopen or edit it, so it is disabled.
  const statusPickerFor = (task: Task): RowPicker => {
    const assigned = Boolean(task.assignedBy);
    return {
      label: t("changeStatusFor", { title: task.title }),
      heading: t("changeStatus"),
      value: task.status,
      options: getStatusOptions(t)
        .filter((o) => o.value !== "all")
        .map((o) => ({ ...o, dotClassName: STATUS_DOT[o.value as AgentTaskStatus] })),
      onChange: (to: string) => {
        if (to === task.status) return;
        setDetailsTask(null);
        setStatusChange({ id: task._id, title: task.title, from: task.status, to: to as AgentTaskStatus, ...(assigned ? { assignerName: task.assignedBy?.name ?? "" } : {}) });
      },
      display: <TaskStatusBadge status={task.status} reviewStatus={task.reviewStatus} />,
      disabled: task.reviewStatus === "awaiting_review" || task.reviewStatus === "approved",
    };
  };

  // BUG-11: filtered-to-zero must not show first-use copy.
  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== "all" || dueFilter !== "all" || kindFilter !== "all";

  return (
    <>
    {ConfirmDialogNode}
    <div className="page-container">
      {/* Hero */}
      <WorkspaceHeader
        title={t("pageTitle")}
        context={t("pageDescription")}
        actions={
          <Button onClick={() => setShowForm(true)} aria-label={t("newTaskButton")} className="min-h-11 gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("newTaskButton")}</span>
          </Button>
        }
        // The strip used to be four dead numbers. Each cell is now the filter
        // it describes, so "Overdue 6" is the way into those six tasks.
        metrics={[
          {
            label: t("statPending"), value: stats.pending, icon: Clock, tone: "warning",
            onClick: () => setStatusFilter(statusFilter === "pending" ? "all" : "pending"),
            active: statusFilter === "pending",
          },
          {
            label: t("statInProgress"), value: stats.inProgress, icon: PlayCircle, tone: "primary",
            onClick: () => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress"),
            active: statusFilter === "in_progress",
          },
          {
            label: t("statCompleted"), value: stats.completed, icon: CheckCircle2, tone: "success",
            onClick: () => setStatusFilter(statusFilter === "completed" ? "all" : "completed"),
            active: statusFilter === "completed",
          },
          {
            label: t("statFailed"), value: stats.failed, icon: XCircle, tone: "danger",
            onClick: () => setStatusFilter(statusFilter === "failed" ? "all" : "failed"),
            active: statusFilter === "failed",
          },
          {
            label: t("statOverdue"), value: stats.overdue, icon: AlertCircle, tone: "info",
            onClick: () => setDueFilter(dueFilter === "overdue" ? "all" : "overdue"),
            active: dueFilter === "overdue",
          },
        ]}
      />

      {/* Filters */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={hasActiveFilters ? () => { setSearch(""); setStatusFilter("all"); setDueFilter("all"); setKindFilter("all"); resetPage(); } : undefined}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          options={getStatusOptions(t)}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
          placeholder={tc("status")}
          ariaLabel={tc("status")}
          className={INLINE_FILTER_CONTROL}
        />
        <SearchableSelect
          options={[
            { value: "all", label: t("kindAll") },
            { value: "assigned", label: t("kindAssigned") },
            { value: "personal", label: t("kindPersonal") },
          ]}
          value={kindFilter}
          onValueChange={(v) => { setKindFilter(v); resetPage(); }}
          ariaLabel={t("kindLabel")}
          className={INLINE_FILTER_CONTROL}
        />
      </InlineFilterBar>

      {/* Table section */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[200px]">{t("columnTask")}</TableHead>
                {/* Was headed "Status" over the priority badge and "Date" over the due date. */}
                <TableHead className="w-[130px]">{tc("status")}</TableHead>
                <TableHead className="w-[100px]">{t("priorityPlaceholder")}</TableHead>
                <TableHead className="w-[120px]">{t("columnDueDate")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={5} />
              ) : tasks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    {/* BUG-11: filtered-to-zero must not show first-use copy. */}
                    <EmptyState
                      title={hasActiveFilters ? t("noResultsTitle") : t("emptyStateTitle")}
                      description={hasActiveFilters ? t("noResultsDescription") : t("emptyStateDescription")}
                      icon={Calendar}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => {
                  const assigned = Boolean(task.assignedBy);
                  const assignerName = task.assignedBy?.name ?? "";
                  const closed = task.status === "completed" || task.status === "failed";
                  return (
                  <TableRow key={task._id} className={`group ${closed ? "opacity-60" : ""}`}>
                    <TableCell>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDetailsTask(task)}
                            className={`block max-w-full truncate rounded text-start text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${closed && task.reviewStatus !== "awaiting_review" ? "line-through text-muted-foreground" : "text-foreground"}`}
                          >
                            {task.title}
                          </button>
                          {task.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">{task.description}</p>
                          )}
                          <TaskLinkChips locale={locale} links={task.links} />
                          {assigned && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                <UserCheck className="h-3 w-3" aria-hidden="true" />
                                {task.assignedBy?.role === "admin"
                                  ? t("assignedByAdmin", { name: assignerName })
                                  : t("assignedBySuperAgent", { name: assignerName })}
                              </span>
                              {task.reviewStatus === "approved" && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{t("reviewApproved")}</span>
                              )}
                              {task.reviewStatus === "returned" && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t("reviewReturned")}</span>
                              )}
                            </div>
                          )}
                          {task.reviewStatus === "returned" && task.reviewComment && (
                            <p className="mt-1 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                              <Undo2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="break-words"><span className="font-semibold">{t("returnedReasonLabel")}</span> {task.reviewComment}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RowActions name={task.title} picker={statusPickerFor(task)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${PRIORITY_COLORS[task.priority]}`}>
                          {t(`priorityLabel${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.dueDate ? (
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${
                          new Date(task.dueDate) < new Date() && !closed
                            ? "text-red-500 font-semibold"
                            : ""
                        }`}>
                          <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {formatListDate(new Date(task.dueDate))}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        name={task.title}
                        labelsFrom="wide"
                        quick={[{ key: "details", label: t("detailsAction"), icon: Eye, onSelect: () => setDetailsTask(task) }]}
                        menu={[
                          // An assigned task belongs to whoever gave it: no delete.
                          ...(assigned ? [] : [{
                            key: "delete",
                            label: tc("delete"),
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => { void deleteTask(task._id); },
                          }]),
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {total > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </div>
    <NewTaskDialog
      open={showForm}
      onOpenChange={setShowForm}
      categoryOptions={getCategoryOptions(t)}
      priorityOptions={getPriorityOptions(t)}
      onCreated={() => void fetchTasks()}
    />
    <TaskStatusDialog change={statusChange} onClose={() => setStatusChange(null)} onSaved={() => void fetchTasks()} />
    <AgentTaskDetailsPanel
      task={detailsTask}
      locale={locale}
      statusPicker={detailsTask ? statusPickerFor(detailsTask) : null}
      onDelete={detailsTask && !detailsTask.assignedBy
        ? () => { const id = detailsTask._id; setDetailsTask(null); void deleteTask(id); }
        : undefined}
      onClose={() => setDetailsTask(null)}
    />
    </>
  );
}

