"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const CATEGORY_OPTIONS = [
  { value: "follow_up", label: "Follow Up" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
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
        setTasks(data.items ?? []);
      }
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error("Task title is required");
      return;
    }

    try {
      const res = await csrfFetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });

      if (res.ok) {
        toast.success("Task created");
        setNewTask({ title: "", description: "", priority: "medium", category: "follow_up", dueDate: "" });
        setShowForm(false);
        fetchTasks();
      }
    } catch {
      toast.error("Failed to create task");
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
        toast.success("Task updated");
        fetchTasks();
      }
    } catch {
      toast.error("Failed to update task");
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/agent/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Task deleted");
        fetchTasks();
      }
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "completed").length;

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasks & Follow-ups</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage your personal to-do list and follow-up reminders</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> New Task
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pending", value: pending, icon: <Clock className="h-5 w-5" />, tone: "workspace-tone-amber" },
            { label: "In Progress", value: inProgress, icon: <Star className="h-5 w-5" />, tone: "workspace-tone-sky" },
            { label: "Completed", value: completed, icon: <CheckCircle2 className="h-5 w-5" />, tone: "workspace-tone-emerald" },
            { label: "Overdue", value: overdue, icon: <AlertCircle className="h-5 w-5" />, tone: "workspace-tone-rose" },
          ].map((m) => (
            <div key={m.label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{m.label}</p>
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
          <h2 className="text-lg font-semibold text-foreground">Create Task</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Task title *" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} className="sm:col-span-2" />
            <Input placeholder="Description (optional)" value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            <SearchableSelect options={CATEGORY_OPTIONS} value={newTask.category} onValueChange={(v) => setNewTask((p) => ({ ...p, category: v }))} placeholder="Category" />
            <SearchableSelect options={PRIORITY_OPTIONS} value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))} placeholder="Priority" />
            <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTask}><Plus className="mr-1 h-4 w-4" /> Create</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} placeholder="Status" className="w-36" />
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </section>

      {/* Task List */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No tasks yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Create your first task to start tracking follow-ups</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
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
                          {task.priority}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                          {task.category.replace("_", " ")}
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
    </div>
  );
}
