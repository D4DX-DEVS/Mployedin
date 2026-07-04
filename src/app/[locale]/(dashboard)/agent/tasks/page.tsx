"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  CheckSquare, Plus, Clock, AlertCircle, CheckCircle2,
  Trash2, Edit, Calendar, RotateCcw, Search, Inbox, Star,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

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
  high: "text-red-600 bg-red-50 dark:bg-red-950/30",
  medium: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
  low: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
};

const getStatusOptions = (t: any) => [
  { value: "all", label: t("statusAll") },
  { value: "pending", label: t("statusPending") },
  { value: "in_progress", label: t("statusInProgress") },
  { value: "completed", label: t("statusCompleted") },
];

const getCategoryOptions = (t: any) => [
  { value: "follow_up", label: t("categoryFollowUp") },
  { value: "call", label: t("categoryCall") },
  { value: "meeting", label: t("categoryMeeting") },
  { value: "document", label: t("categoryDocument") },
  { value: "other", label: t("categoryOther") },
];

const getPriorityOptions = (t: any) => [
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
  const pagination = usePagination();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  /* New task form */
  const [newTask, setNewTask] = useState({
    title: "", description: "", priority: "medium", category: "follow_up",
    dueDate: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/agent/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        const tasks = data.items ?? [];
        setAllTasks(tasks);
        pagination.updateTotal(tasks.length);
      }
    } catch {
      toast.error(t("loadTasksFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, pagination, t]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { pagination.resetPage(); }, [statusFilter, search]);

  const paginatedTasks = allTasks.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit
  );

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error(t("taskTitleRequired"));
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
        setNewTask({ title: "", description: "", priority: "medium", category: "follow_up", dueDate: "" });
        setShowForm(false);
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t("createTaskFailed"));
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

  const pending = allTasks.filter((t) => t.status === "pending").length;
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
  const completed = allTasks.filter((t) => t.status === "completed").length;
  const overdue = allTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "completed").length;

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("pageTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pageDescription")}</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> {t("newTaskButton")}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "statPending", value: pending, icon: <Clock className="h-5 w-5" />, tone: "workspace-tone-amber" },
            { key: "statInProgress", value: inProgress, icon: <Star className="h-5 w-5" />, tone: "workspace-tone-sky" },
            { key: "statCompleted", value: completed, icon: <CheckCircle2 className="h-5 w-5" />, tone: "workspace-tone-emerald" },
            { key: "statOverdue", value: overdue, icon: <AlertCircle className="h-5 w-5" />, tone: "workspace-tone-rose" },
          ].map((m) => (
            <div key={m.key} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(m.key)}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{m.value}</p>
                </div>
                <div className={`${m.tone} rounded-xl p-2`}>{m.icon}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* New Task Form */}
      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("createTaskHeading")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder={t("taskTitlePlaceholder")} value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} className="sm:col-span-2" />
            <Input placeholder={t("taskDescriptionPlaceholder")} value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            <SearchableSelect options={getCategoryOptions(t)} value={newTask.category} onValueChange={(v) => setNewTask((p) => ({ ...p, category: v }))} placeholder={t("categoryPlaceholder")} />
            <SearchableSelect options={getPriorityOptions(t)} value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))} placeholder={t("priorityPlaceholder")} />
            <DateTimePicker mode="date" value={newTask.dueDate} onChange={(v) => setNewTask((p) => ({ ...p, dueDate: v }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTask}><Plus className="mr-1 h-4 w-4" /> {tc("create")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{tc("cancel")}</Button>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <SearchableSelect options={getStatusOptions(t)} value={statusFilter} onValueChange={setStatusFilter} placeholder={tc("status")} className="w-36" />
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> {t("resetButton")}
          </Button>
        </div>
      </section>

      {/* Task List */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 h-5 w-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : allTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("emptyStateTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("emptyStateDescription")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedTasks.map((task) => (
              <div
                key={task._id}
                className={`workspace-glass-panel rounded-2xl p-4 transition-all ${
                  task.status === "completed" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => updateTaskStatus(task._id, task.status === "completed" ? "pending" : "completed")}
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                        task.status === "completed"
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-muted-foreground/30 hover:border-primary"
                      }`}
                    >
                      {task.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <div>
                      <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[task.priority]}`}>
                          {t(`priorityLabel${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                          {t(`categoryLabel${task.category.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("")}`)}
                        </span>
                        {task.dueDate && (
                          <span className={`inline-flex items-center gap-1 text-[10px] ${
                            new Date(task.dueDate) < new Date() && task.status !== "completed"
                              ? "text-red-500 font-semibold"
                              : "text-muted-foreground"
                          }`}>
                            <Calendar className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {task.status !== "completed" && task.status !== "in_progress" && (
                      <Button variant="ghost" size="sm" onClick={() => updateTaskStatus(task._id, "in_progress")}>
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteTask(task._id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {allTasks.length > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}
    </div>
  );
}
