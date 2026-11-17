"use client";

import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { formatListDate } from "@/lib/ui/intlFormat";
import { TASK_STATE_CLASS, taskState, taskStateKey } from "./taskState";
import type { TaskDetails } from "./TaskDetailsPanel";
import type { GroupSummary } from "./GroupProgressPanel";

type Row = TaskDetails & { group?: GroupSummary };
type Audience = "admin" | "super_agent";

export const PRIORITY_CLASS: Record<string, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-emerald-600 bg-emerald-50",
};

const isClosed = (s: string) => ["completed", "failed", "cancelled"].includes(s);

function GiverLine({ task }: { task: Row }) {
  const t = useTranslations("assignedTasks");
  return (
    <>
      {task.assignedByName || "—"} · {task.assignedByRole === "admin" ? t("roleAdmin") : t("roleSuperAgent")}
      {task.managedByName ? ` · ${t("viaName", { name: task.managedByName })}` : ""}
    </>
  );
}

/** Small chips: view only, person deactivated, review off. */
function Flags({ task }: { task: Row }) {
  const t = useTranslations("assignedTasks");
  return (
    <span className="flex flex-wrap gap-1">
      {task.canAct === false && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t("viewOnly")}</span>
      )}
      {!task.group && task.assigneeActive === false && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{t("personDeactivated")}</span>
      )}
      {task.reviewRequired === false && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{t("reviewOff")}</span>
      )}
    </span>
  );
}

function StateCell({ task }: { task: Row }) {
  const t = useTranslations("assignedTasks");
  const g = task.group;
  if (g) {
    const counted = g.size - g.withdrawn;
    return (
      <div className="min-w-[120px] space-y-1">
        <p className="whitespace-nowrap text-xs font-semibold">{t("groupProgress", { done: g.done, total: counted })}</p>
        <Progress value={counted ? (g.done / counted) * 100 : 0} className="h-1.5" aria-hidden="true" />
        {g.needsYou > 0 && <p className="whitespace-nowrap text-[11px] font-semibold text-violet-700">{t("groupNeedsYou", { count: g.needsYou })}</p>}
      </div>
    );
  }
  const state = taskState(task);
  return (
    <>
      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATE_CLASS[state]}`}>
        {t(taskStateKey(state))}
      </span>
      {/* Reported failed: the giver is deciding on a failure, not a finish. */}
      {state === "awaiting_review" && task.status === "failed" && (
        <span className="ms-1 inline-flex whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
          {t("stateFailed")}
        </span>
      )}
    </>
  );
}

function DueDate({ task }: { task: Row }) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && (task.group ? task.group.members.some((m) => !isClosed(m.status)) : !isClosed(task.status));
  if (!task.dueDate) return <>—</>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>
      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
      {formatListDate(new Date(task.dueDate))}
    </span>
  );
}

/** The table cells of one "Tasks I gave" row (everything but Actions). */
function RowCells({ task, audience }: { task: Row; audience: Audience }) {
  const t = useTranslations("assignedTasks");
  const showNotes = !task.group;
  const state = taskState(task);
  return (
    <>
      <TableCell>
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium text-foreground">{task.title}</p>
          {task.description && <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
          <span className="flex flex-wrap items-center gap-1">
            <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[task.priority]}`}>
              {task.priority === "high" ? t("priorityHigh") : task.priority === "low" ? t("priorityLow") : t("priorityMedium")}
            </span>
            <Flags task={task} />
          </span>
          {showNotes && task.completionNote && (state === "awaiting_review" || state === "approved" || state === "failed") && (
            <p className="rounded-lg bg-muted/40 px-2 py-1 text-xs text-foreground/80">
              <span className="font-semibold">{t("agentNoteLabel")}:</span> {task.completionNote}
            </p>
          )}
          {showNotes && task.reviewComment && (state === "returned" || state === "approved" || state === "failed") && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <span className="font-semibold">{t("reviewCommentLabel")}:</span> {task.reviewComment}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {task.group ? t("groupPeople", { count: task.group.size }) : task.agentName || "—"}
        {!task.group && task.assigneeRole === "super_agent" && (
          <span className="block text-xs text-muted-foreground">{t("roleSuperAgent")}</span>
        )}
      </TableCell>
      {audience === "admin" && (
        <TableCell className="text-sm"><GiverLine task={task} /></TableCell>
      )}
      <TableCell><StateCell task={task} /></TableCell>
      <TableCell className="text-sm text-muted-foreground"><DueDate task={task} /></TableCell>
    </>
  );
}

/** The phone card's detail lines. */
function Meta({ task, audience }: { task: Row; audience: Audience }) {
  const t = useTranslations("assignedTasks");
  return (
    <>
      {task.description && <p className="line-clamp-2">{task.description}</p>}
      {audience === "admin" && <p className="truncate">{t("columnAssignedBy")}: <GiverLine task={task} /></p>}
      {task.dueDate && <p>{t("columnDue")}: <DueDate task={task} /></p>}
      <Flags task={task} />
    </>
  );
}

export const GivenTaskCells = { Row: RowCells, Meta };
