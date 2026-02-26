"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Circle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  fr_ref?: string;
  title: string;
  status: "pending" | "in-progress" | "completed";
  verified: boolean;
  completedAt?: string;
}

interface Phase {
  id: string;
  name: string;
  progress: number;
  tasks: Task[];
}

interface TasksData {
  project: string;
  version: string;
  phases: Phase[];
}

export default function TaskBoardPage() {
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(["P0", "P1"]));

  async function fetchTasks() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTasks(); }, []);

  async function updateTask(taskId: string, updates: Partial<Task>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchTasks();
  }

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  const totalTasks = data?.phases.reduce((acc, p) => acc + p.tasks.length, 0) ?? 0;
  const completedTasks = data?.phases.reduce(
    (acc, p) => acc + p.tasks.filter((t) => t.status === "completed").length,
    0
  ) ?? 0;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Board"
        description="MPLOYEDIN development progress tracker"
        actions={
          <Button variant="outline" size="sm" onClick={fetchTasks}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Overall progress */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Overall Progress</h3>
            <p className="text-sm text-muted-foreground">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
          <span className="text-2xl font-bold text-brand-blue">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-3" />
      </div>

      {/* Phases */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data?.phases.map((phase) => {
            const isExpanded = expandedPhases.has(phase.id);
            const pCompleted = phase.tasks.filter((t) => t.status === "completed").length;
            return (
              <div key={phase.id} className="card-base overflow-hidden">
                {/* Phase header */}
                <button
                  onClick={() => togglePhase(phase.id)}
                  className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <Badge variant="outline" className="font-mono text-xs shrink-0">
                    {phase.id}
                  </Badge>
                  <span className="flex-1 font-medium text-sm">{phase.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {pCompleted}/{phase.tasks.length}
                  </span>
                  <div className="w-24 shrink-0">
                    <Progress value={phase.progress} className="h-1.5" />
                  </div>
                  <span className="text-xs font-semibold text-brand-blue shrink-0 w-10 text-right">
                    {phase.progress}%
                  </span>
                </button>

                {/* Tasks */}
                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border">
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 text-sm",
                          task.status === "completed" && "bg-green-50/50"
                        )}
                      >
                        <button
                          onClick={() =>
                            updateTask(task.id, {
                              status:
                                task.status === "completed" ? "pending" : "completed",
                              verified: task.status !== "completed",
                            })
                          }
                          className={cn(
                            "shrink-0 transition-colors",
                            task.status === "completed"
                              ? "text-green-600"
                              : "text-muted-foreground hover:text-brand-blue"
                          )}
                        >
                          {task.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : task.status === "in-progress" ? (
                            <Clock className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </button>

                        <span className="font-mono text-xs text-muted-foreground shrink-0 w-20">
                          {task.id}
                        </span>

                        <span
                          className={cn(
                            "flex-1",
                            task.status === "completed" &&
                              "line-through text-muted-foreground"
                          )}
                        >
                          {task.title}
                        </span>

                        {task.fr_ref && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {task.fr_ref}
                          </Badge>
                        )}

                        {task.verified && (
                          <Badge className="text-xs shrink-0 bg-green-100 text-green-700 border-0">
                            ✓
                          </Badge>
                        )}

                        {task.completedAt && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(task.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
