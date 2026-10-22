"use client";

import { useTranslations } from "next-intl";
import { ClipboardCheck, FileText, History, Link2, MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlinePicker, type RowPicker } from "@/components/shared/RowActions";
import { TaskSection } from "@/components/features/tasks/TaskDetailsPanel";
import { TaskHistoryTimeline } from "@/components/features/tasks/TaskHistoryDialog";
import { TaskStatusBadge, type AgentTaskStatus } from "@/components/features/tasks/TaskStatusDialog";
import type { ResolvedTaskLinks } from "@/lib/agentTasks/links";
import { formatDateTime, formatListDate } from "@/lib/ui/intlFormat";
import { TaskLinkChips } from "./TaskLinkChips";

/** One row of the agent's task list, as /api/agent/tasks returns it. */
export interface AgentTaskRow {
  _id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: AgentTaskStatus;
  dueDate?: string;
  category: "follow_up" | "call" | "meeting" | "document" | "other";
  relatedTo?: string;
  /** The candidate / job / employer it is about, each linking to where the agent acts on it. */
  links?: ResolvedTaskLinks;
  createdAt: string;
  /** Present only on tasks a super agent or an admin gave this agent. */
  assignedBy?: { name: string; role: "super_agent" | "admin" };
  reviewStatus?: "none" | "awaiting_review" | "approved" | "returned";
  completionNote?: string;
  reviewComment?: string;
}

const PRIORITY_CLASS: Record<AgentTaskRow["priority"], string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-emerald-600 bg-emerald-50",
};

interface AgentTaskDetailsPanelProps {
  task: AgentTaskRow | null;
  locale: string;
  /** The row's own status picker; disabled while the task is with the reviewer. */
  statusPicker: RowPicker | null;
  /** Only the agent's own to-dos can be deleted; assigned ones belong to whoever gave them. */
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * The agent's view of one task, in the same side panel a super agent reviews
 * from: what it is, what it is about (each linked record opens where the agent
 * acts on it), what they reported and what came back, and its activity — with
 * the status change at the foot instead of a separate history popup.
 */
export function AgentTaskDetailsPanel({ task, locale, statusPicker, onDelete, onClose }: AgentTaskDetailsPanelProps) {
  const t = useTranslations("agentTasks");
  const ta = useTranslations("assignedTasks");
  const tc = useTranslations("common");

  const categoryLabel = (c: AgentTaskRow["category"]) =>
    c === "follow_up" ? t("categoryFollowUp")
    : c === "call" ? t("categoryCall")
    : c === "meeting" ? t("categoryMeeting")
    : c === "document" ? t("categoryDocument")
    : t("categoryOther");
  const priorityLabel = (p: AgentTaskRow["priority"]) =>
    p === "high" ? t("priorityHigh") : p === "low" ? t("priorityLow") : t("priorityMedium");

  const closed = task ? task.status === "completed" || task.status === "failed" : false;
  const overdue = Boolean(task?.dueDate && new Date(task.dueDate) < new Date() && !closed);
  const hasLinks = Boolean(task?.links && (task.links.candidate || task.links.job || task.links.employer));
  const reported = Boolean(task?.completionNote || task?.reviewComment);

  return (
    <Dialog open={task !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        {task && (
          <>
            <DialogHeader className="space-y-2 border-b px-5 pb-4 pt-5 pe-14">
              <DialogTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                {t("detailsTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">{task.title}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-lg font-semibold text-foreground">{task.title}</p>
                  <TaskStatusBadge status={task.status} reviewStatus={task.reviewStatus} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  {task.assignedBy && (
                    <>
                      <dt className="text-muted-foreground">{ta("columnAssignedBy")}</dt>
                      <dd className="text-foreground">
                        {task.assignedBy.name || "—"}
                        <span className="text-muted-foreground"> · {task.assignedBy.role === "admin" ? ta("roleAdmin") : ta("roleSuperAgent")}</span>
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t("categoryPlaceholder")}</dt>
                  <dd className="text-foreground">{categoryLabel(task.category)}</dd>
                  <dt className="text-muted-foreground">{t("priorityPlaceholder")}</dt>
                  <dd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[task.priority]}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">{t("columnDueDate")}</dt>
                  <dd className={overdue ? "font-semibold text-red-600" : "text-foreground"}>
                    {task.dueDate ? formatListDate(task.dueDate, locale) : "—"}
                  </dd>
                  <dt className="text-muted-foreground">{ta("detailsCreated")}</dt>
                  <dd className="text-foreground">{formatDateTime(task.createdAt, { dateStyle: "medium", timeStyle: "short" }, locale)}</dd>
                </dl>
              </div>

              {hasLinks && (
                <TaskSection icon={Link2} title={t("linkedRecords")}>
                  <TaskLinkChips locale={locale} links={task.links} />
                </TaskSection>
              )}

              <TaskSection icon={FileText} title={t("fieldDescription")}>
                <p className="whitespace-pre-line break-words rounded-xl border bg-muted/30 px-3 py-2 text-sm text-foreground/90">
                  {task.description || <span className="text-muted-foreground">{ta("detailsNoDescription")}</span>}
                </p>
              </TaskSection>

              {reported && (
                <TaskSection icon={MessageSquareText} title={t("detailsReport")}>
                  {task.completionNote && (
                    <p className="whitespace-pre-line break-words rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-foreground/90">
                      {task.completionNote}
                    </p>
                  )}
                  {task.reviewComment && (
                    <p className="whitespace-pre-line break-words rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-semibold">{ta("reviewCommentLabel")}:</span> {task.reviewComment}
                    </p>
                  )}
                </TaskSection>
              )}

              <TaskSection icon={History} title={ta("detailsHistory")}>
                <TaskHistoryTimeline url={`/api/agent/tasks/${task._id}`} />
              </TaskSection>
            </div>

            {(statusPicker || onDelete) && (
              <DialogFooter className="flex-row flex-wrap items-center gap-3 border-t px-5 py-4 sm:justify-between sm:space-x-0">
                {statusPicker && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t("changeStatus")}</span>
                    <InlinePicker name={task.title} picker={statusPicker} align="start" />
                  </div>
                )}
                {onDelete && (
                  <Button variant="outline" className="ms-auto text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {tc("delete")}
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
