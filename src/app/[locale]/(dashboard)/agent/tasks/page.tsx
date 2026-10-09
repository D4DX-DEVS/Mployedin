"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { readQuery } from "@/lib/ui/urlQuery";
import {
  Plus, Clock, AlertCircle, CheckCircle2,
  Trash2, Calendar, Star,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate } from "@/lib/ui/intlFormat";
import { useConfirm } from "@/hooks/useConfirm";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
  dueDate?: string;
  category: "follow_up" | "call" | "meeting" | "document" | "other";
  relatedTo?: string;
  createdAt: string;
}

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
  const tConfirm = useTranslations("confirm");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, completed: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so the dashboard queue and the nav badge
  // can link straight to "overdue tasks" instead of dropping the agent on an
  // unfiltered list and asking them to narrow it again.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [dueFilter, setDueFilter] = useUrlFilter("due", "all");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  // The Create menu and ⌘K link `?new=1` so "New task" starts the task instead
  // of dropping the agent on the list beside the button that starts it.
  const [showForm, setShowForm] = useState(() => readQuery().get("new") === "1");

  const emptyTaskForm = { title: "", description: "", priority: "medium", category: "follow_up", dueDate: "" };

  /* New task form */
  const [newTask, setNewTask] = useState({
    title: "", description: "", priority: "medium", category: "follow_up",
    dueDate: "",
  });

  const closeTaskForm = () => {
    // BUG-13: reset so a cancelled draft does not reappear on reopen.
    setNewTask({ ...emptyTaskForm });
    setShowForm(false);
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dueFilter !== "all") params.set("due", dueFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/agent/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.items ?? []);
        updateTotal(data.total ?? 0);
        setStats(data.stats ?? { pending: 0, inProgress: 0, completed: 0, overdue: 0 });
      }
    } catch {
      toast.error(t("loadTasksFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dueFilter, search, page, limit, updateTotal, t]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { resetPage(); }, [statusFilter, dueFilter, search, resetPage]);

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error(t("taskTitleRequired"));
      return;
    }
    // BUG-12: name the field failure instead of a generic "Validation failed".
    if (newTask.title.trim().length > 200) {
      toast.error(t("taskTitleMax"));
      return;
    }

    try {
      const payload = {
        ...newTask,
        dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
      };
      const res = await csrfFetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(t("taskCreatedSuccess"));
        setNewTask({ ...emptyTaskForm });
        setShowForm(false);
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        // Prefer the field-level detail when the API provides it.
        const detail = Array.isArray(err?.details) ? err.details[0]?.message : undefined;
        toast.error(detail ?? err?.error ?? t("createTaskFailed"));
      }
    } catch {
      toast.error(t("createTaskFailed"));
    }
  };

  const updateTaskStatus = async (id: string, status: string) => {
    try {
      const res = await csrfFetch(`/api/agent/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        toast.success(t("taskUpdatedSuccess"));
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t("updateTaskFailed"));
      }
    } catch {
      toast.error(t("updateTaskFailed"));
    }
  };

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

  // BUG-11: filtered-to-zero must not show first-use copy.
  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== "all" || dueFilter !== "all";

  return (
    <>
    {ConfirmDialogNode}
    <div className="page-container">
      {/* Hero */}
      <WorkspaceHeader
        title={t("pageTitle")}
        context={t("pageDescription")}
        actions={
          <Button onClick={() => setShowForm(!showForm)} aria-label={t("newTaskButton")} className="min-h-11 gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
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
            label: t("statInProgress"), value: stats.inProgress, icon: Star, tone: "primary",
            onClick: () => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress"),
            active: statusFilter === "in_progress",
          },
          {
            label: t("statCompleted"), value: stats.completed, icon: CheckCircle2, tone: "success",
            onClick: () => setStatusFilter(statusFilter === "completed" ? "all" : "completed"),
            active: statusFilter === "completed",
          },
          {
            label: t("statOverdue"), value: stats.overdue, icon: AlertCircle, tone: "info",
            onClick: () => setDueFilter(dueFilter === "overdue" ? "all" : "overdue"),
            active: dueFilter === "overdue",
          },
        ]}
      />

      {/* New Task Form */}
      {showForm && (
        <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
          <h2 className="heading-section font-semibold text-foreground">{t("createTaskHeading")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder={t("taskTitlePlaceholder")}
              value={newTask.title}
              maxLength={200}
              onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              className="sm:col-span-2"
            />
            <Input placeholder={t("taskDescriptionPlaceholder")} value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            <SearchableSelect options={getCategoryOptions(t)} value={newTask.category} onValueChange={(v) => setNewTask((p) => ({ ...p, category: v }))} placeholder={t("categoryPlaceholder")} />
            <SearchableSelect options={getPriorityOptions(t)} value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))} placeholder={t("priorityPlaceholder")} />
            <DateTimePicker mode="date" value={newTask.dueDate} onChange={(v) => setNewTask((p) => ({ ...p, dueDate: v }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTask}><Plus className="mr-1 h-4 w-4" /> {tc("create")}</Button>
            <Button variant="ghost" onClick={closeTaskForm}>{tc("cancel")}</Button>
          </div>
        </section>
      )}

      {/* Filters */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={(search || statusFilter !== "all" || dueFilter !== "all") ? () => { setSearch(""); setStatusFilter("all"); setDueFilter("all"); resetPage(); } : undefined}
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
      </InlineFilterBar>

      {/* Table section */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[200px]">{t("columnTask")}</TableHead>
                {/* Was headed "Status" over the priority badge and "Date" over the due date. */}
                <TableHead className="w-[100px]">{t("priorityPlaceholder")}</TableHead>
                <TableHead className="w-[120px]">{t("columnDueDate")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={4} />
              ) : tasks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12">
                    {/* BUG-11: filtered-to-zero must not show first-use copy. */}
                    <EmptyState
                      title={hasActiveFilters ? t("noResultsTitle") : t("emptyStateTitle")}
                      description={hasActiveFilters ? t("noResultsDescription") : t("emptyStateDescription")}
                      icon={Calendar}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task._id} className={`group ${task.status === "completed" ? "opacity-60" : ""}`}>
                    <TableCell>
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(task._id, task.status === "completed" ? "pending" : "completed")}
                          aria-pressed={task.status === "completed"}
                          aria-label={task.status === "completed" ? t("markPending") : t("markComplete")}
                          // `!min-*-0`: the phone 44px button floor exempts only
                          // role="checkbox", so this toggle drew as a 44px empty
                          // box. tap-target-box keeps the 44px hit area.
                          className={`tap-target-box mt-0.5 flex h-5 w-5 shrink-0 !min-h-0 !min-w-0 items-center justify-center rounded border-2 transition-colors ${
                            task.status === "completed"
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-muted-foreground/30 hover:border-primary"
                          }`}
                        >
                          {task.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                        </button>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">{task.description}</p>
                          )}
                        </div>
                      </div>
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
                          new Date(task.dueDate) < new Date() && task.status !== "completed"
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
                        quick={task.status !== "completed" && task.status !== "in_progress" ? [{
                          key: "star",
                          label: t("markInProgress"),
                          icon: Star,
                          iconOnly: true,
                          onSelect: () => { void updateTaskStatus(task._id, "in_progress"); },
                        }] : []}
                        menu={[
                          {
                            key: "delete",
                            label: tc("delete"),
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => { void deleteTask(task._id); },
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
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
    </>
  );
}
