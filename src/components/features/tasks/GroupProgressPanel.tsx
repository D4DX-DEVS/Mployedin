"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Eye, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatListDate } from "@/lib/ui/intlFormat";
import { TASK_STATE_CLASS, taskState, taskStateKey } from "./taskState";
import type { TaskDetails } from "./TaskDetailsPanel";

export interface GroupSummary {
  id: string;
  size: number;
  done: number;
  withdrawn: number;
  needsYou: number;
  members: TaskDetails[];
}

export type GroupRow = TaskDetails & { group: GroupSummary };

interface GroupProgressPanelProps {
  row: GroupRow | null;
  onClose: () => void;
  /** Open one person's copy in the task details panel (review lives there). */
  onOpenMember: (member: TaskDetails) => void;
  onWithdrawAll: (row: GroupRow) => void;
  onChangeDueAll: (row: GroupRow) => void;
}

const isOpen = (m: TaskDetails) => !["completed", "failed", "cancelled"].includes(m.status);

/**
 * One task given to several people: overall progress ("2 of 4 done", withdrawn
 * copies counted apart), then one line per person. Each person's copy opens in
 * the usual details panel, where it is reviewed, withdrawn or given to
 * someone else.
 */
export function GroupProgressPanel({ row, onClose, onOpenMember, onWithdrawAll, onChangeDueAll }: GroupProgressPanelProps) {
  const t = useTranslations("assignedTasks");
  const locale = useLocale();
  const g = row?.group;
  const counted = g ? g.size - g.withdrawn : 0;
  const openCopies = g ? g.members.filter((m) => isOpen(m) && m.canAct !== false).length : 0;

  return (
    <Dialog open={row !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        {row && g && (
          <>
            <DialogHeader className="space-y-2 border-b px-5 pb-4 pt-5 pe-14">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                {row.title}
              </DialogTitle>
              <DialogDescription>
                {t("groupMeta", { count: g.size })}
                {row.dueDate ? ` · ${t("columnDue")}: ${formatListDate(row.dueDate, locale)}` : ""}
                {` · ${row.reviewRequired === false ? t("reviewOff") : t("reviewOn")}`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">{t("groupProgress", { done: g.done, total: counted })}</span>
                  <span className="text-muted-foreground">
                    {g.withdrawn > 0 && t("groupWithdrawn", { count: g.withdrawn })}
                    {g.needsYou > 0 && <span className="ms-2 font-semibold text-violet-700">{t("groupNeedsYou", { count: g.needsYou })}</span>}
                  </span>
                </div>
                <Progress value={counted ? (g.done / counted) * 100 : 0} aria-label={t("groupProgress", { done: g.done, total: counted })} />
              </div>

              <ul className="space-y-2">
                {g.members.map((m) => {
                  const state = taskState(m);
                  return (
                    <li key={m._id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${m.status === "cancelled" ? "opacity-60" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.agentName || "—"}</p>
                        {m.assigneeActive === false && <p className="text-xs text-zinc-600">{t("personDeactivated")}</p>}
                      </div>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATE_CLASS[state]}`}>
                        {t(taskStateKey(state))}
                      </span>
                      <Button size="sm" variant={m.canReview ? "default" : "outline"} className="min-h-9" onClick={() => onOpenMember(m)}>
                        {m.canReview ? <CheckCircle2 className="me-1.5 h-4 w-4" aria-hidden="true" /> : <Eye className="me-1.5 h-4 w-4" aria-hidden="true" />}
                        {m.canReview ? t("reviewAction") : t("detailsAction")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {openCopies > 0 && (
              <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => onChangeDueAll(row)}>
                  <CalendarClock className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {t("dueGroupAction")}
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => onWithdrawAll(row)}>
                  <XCircle className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {t("withdrawGroupAction")}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
