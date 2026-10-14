"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";

export type AgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";
type BadgeKey = AgentTaskStatus | "awaiting_review";

const STATUS_BADGE: Record<BadgeKey, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  awaiting_review: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

/** Where the task stands. Overdue is not a status: the due date turns red instead. */
export function TaskStatusBadge({ status, reviewStatus }: { status: AgentTaskStatus; reviewStatus?: string }) {
  const t = useTranslations("agentTasks");
  const key: BadgeKey = reviewStatus === "awaiting_review" ? "awaiting_review" : status;
  const label = {
    pending: t("statusPending"),
    in_progress: t("statusInProgress"),
    awaiting_review: t("reviewAwaiting"),
    completed: t("statusCompleted"),
    failed: t("statusFailed"),
  }[key];
  return (
    <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[key]}`}>
      {label}
    </span>
  );
}

/** Dropdown dot per status, matching the badge colours. */
export const STATUS_DOT: Record<AgentTaskStatus, string> = {
  pending: "bg-slate-400",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
};

export interface StatusChange {
  id: string;
  title: string;
  from: AgentTaskStatus;
  to: AgentTaskStatus;
  /** Set on tasks a super agent or admin gave: Completed / Failed go to them for review. */
  assignerName?: string;
}

/**
 * Every status change goes through here, with an optional note that lands in
 * the task's history. Completed / Failed on an assigned task is a report: it
 * goes to the assigner for review, and the note is what they read.
 */
export function TaskStatusDialog({
  change, onClose, onSaved,
}: {
  change: StatusChange | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("agentTasks");
  const tc = useTranslations("common");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const closing = change?.to === "completed" || change?.to === "failed";
  const review = closing && change?.assignerName !== undefined;
  const failed = change?.to === "failed";

  const close = () => { setNote(""); onClose(); };

  const submit = async () => {
    if (!change || saving) return;
    setSaving(true);
    try {
      const res = await csrfFetch(`/api/agent/tasks/${change.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: change.to, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? (review ? t("submitError") : t("updateTaskFailed")));
        return;
      }
      toast.success(review ? t("submitSuccess") : t("statusUpdatedSuccess"));
      close();
      onSaved();
    } catch {
      toast.error(review ? t("submitError") : t("updateTaskFailed"));
    } finally {
      setSaving(false);
    }
  };

  const title = review
    ? (failed ? t("statusDialogFailedReviewTitle") : t("submitTitle"))
    : t("statusDialogTitle");
  const action = review
    ? t("submitAction")
    : change?.to === "completed" ? t("statusDialogCompletedTitle")
    : failed ? t("statusDialogConfirm")
    : t("statusDialogUpdate");
  const placeholder = change?.to === "completed" ? t("statusDialogNoteCompleted")
    : failed ? t("statusDialogNoteFailed")
    : t("statusDialogNotePlaceholder");

  return (
    <Dialog open={change !== null} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {change ? (review ? t("submitDescription", { title: change.title, name: change.assignerName ?? "" }) : `“${change.title}”`) : ""}
          </DialogDescription>
        </DialogHeader>
        {change && (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t("statusDialogChange")}>
            <TaskStatusBadge status={change.from} />
            <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            <TaskStatusBadge status={change.to} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="status-note">
            {failed ? t("statusDialogFailedNoteLabel") : t("statusDialogNoteLabel")}{" "}
            <span className="font-normal text-muted-foreground">({t("noteOptional")})</span>
          </Label>
          <Textarea id="status-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving} variant={failed && !review ? "destructive" : "default"}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
