"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, FileText, History, Loader2, MessageSquareText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { formatDateTime, formatListDate } from "@/lib/ui/intlFormat";
import { TASK_STATE_CLASS, taskState, taskStateKey } from "./taskState";
import { TaskHistoryTimeline } from "./TaskHistoryDialog";

export interface TaskDetails {
  _id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: string;
  reviewStatus: string;
  dueDate?: string;
  createdAt?: string;
  completionNote?: string;
  reviewComment?: string;
  agentName: string;
  assignedByName: string;
  assignedByRole?: "super_agent" | "admin";
  /** Set when an admin gave the task through a super agent. */
  managedByName?: string;
  canReview: boolean;
}

const PRIORITY_CLASS: Record<TaskDetails["priority"], string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-emerald-600 bg-emerald-50",
};

export function TaskSection({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Everything a reviewer needs about one assigned task in one place — what was
 * asked, what the agent reported, how it got here — with the review itself at
 * the bottom when this reviewer may give it. Approve / Send back stay in the
 * table too, for submissions that don't need the full read.
 */
export function TaskDetailsPanel({
  task, apiBase, onClose, onReviewed,
}: {
  task: TaskDetails | null;
  apiBase: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const t = useTranslations("assignedTasks");
  const locale = useLocale();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState<"approve" | "return" | null>(null);

  const close = () => { setComment(""); onClose(); };

  const review = async (action: "approve" | "return") => {
    if (!task || saving) return;
    if (action === "return" && !comment.trim()) { toast.error(t("returnCommentRequired")); return; }
    setSaving(action);
    try {
      const res = await csrfFetch(`${apiBase}/${task._id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewComment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t("reviewError"));
        return;
      }
      toast.success(action === "approve" ? t("approvedToast") : t("returnedToast"));
      close();
      onReviewed();
    } catch {
      toast.error(t("reviewError"));
    } finally {
      setSaving(null);
    }
  };

  const state = task ? taskState(task) : "pending";
  const submitted = task && (task.reviewStatus !== "none" || task.completionNote);

  return (
    <Dialog open={task !== null} onOpenChange={(o) => { if (!o) close(); }}>
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
                  <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATE_CLASS[state]}`}>
                    {t(taskStateKey(state))}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t("detailsAssignedTo")}</dt>
                  <dd className="text-foreground">{task.agentName || "—"}</dd>
                  <dt className="text-muted-foreground">{t("columnAssignedBy")}</dt>
                  <dd className="text-foreground">
                    {task.assignedByName || "—"}
                    {task.assignedByRole && (
                      <span className="text-muted-foreground"> · {task.assignedByRole === "admin" ? t("roleAdmin") : t("roleSuperAgent")}</span>
                    )}
                  </dd>
                  {task.managedByName && (
                    <>
                      <dt className="text-muted-foreground">{t("detailsManagedBy")}</dt>
                      <dd className="text-foreground">{task.managedByName}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t("fieldPriority")}</dt>
                  <dd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[task.priority]}`}>
                      {task.priority === "high" ? t("priorityHigh") : task.priority === "low" ? t("priorityLow") : t("priorityMedium")}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">{t("fieldDue")}</dt>
                  <dd className="text-foreground">{task.dueDate ? formatListDate(task.dueDate, locale) : "—"}</dd>
                  {task.createdAt && (
                    <>
                      <dt className="text-muted-foreground">{t("detailsCreated")}</dt>
                      <dd className="text-foreground">{formatDateTime(task.createdAt, { dateStyle: "medium", timeStyle: "short" }, locale)}</dd>
                    </>
                  )}
                </dl>
              </div>

              <TaskSection icon={FileText} title={t("detailsDescription")}>
                <p className="whitespace-pre-line break-words rounded-xl border bg-muted/30 px-3 py-2 text-sm text-foreground/90">
                  {task.description || <span className="text-muted-foreground">{t("detailsNoDescription")}</span>}
                </p>
              </TaskSection>

              {submitted && (
                <TaskSection icon={MessageSquareText} title={t("detailsSubmission")}>
                  <p className="whitespace-pre-line break-words rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-foreground/90">
                    {task.completionNote || <span className="text-muted-foreground">{t("detailsNoNote")}</span>}
                  </p>
                  {task.reviewComment && (
                    <p className="whitespace-pre-line break-words rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-semibold">{t("reviewCommentLabel")}:</span> {task.reviewComment}
                    </p>
                  )}
                </TaskSection>
              )}

              <TaskSection icon={History} title={t("detailsHistory")}>
                <TaskHistoryTimeline url={`${apiBase}/${task._id}/history`} />
              </TaskSection>
            </div>

            {task.canReview && (
              <DialogFooter className="flex-col gap-3 border-t px-5 py-4 sm:flex-col sm:space-x-0">
                <div className="w-full space-y-1.5">
                  <Label htmlFor="details-review-comment">{t("detailsReviewLabel")}</Label>
                  <Textarea
                    id="details-review-comment"
                    rows={2}
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t("returnCommentPlaceholder")}
                  />
                </div>
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => void review("return")} disabled={saving !== null}>
                    {saving === "return"
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Undo2 className="mr-1.5 h-4 w-4 text-amber-600" aria-hidden="true" />}
                    {t("returnAction")}
                  </Button>
                  <Button onClick={() => void review("approve")} disabled={saving !== null}>
                    {saving === "approve"
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    {t("approveAction")}
                  </Button>
                </div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
