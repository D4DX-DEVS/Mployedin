"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";

// "Give a task" lives in GiveTaskDialog.tsx; re-exported for existing callers.
export { AssignTaskDialog, type AssignableAgentOption } from "./GiveTaskDialog";
import { errorFrom } from "./GiveTaskDialog";

export interface ReviewTarget {
  id: string;
  title: string;
  agentName: string;
  completionNote?: string;
  action: "approve" | "return";
}

/** Approve (comment optional) or send back (comment required: the agent needs to know why). */
export function ReviewTaskDialog({
  target, onClose, apiBase, onReviewed,
}: {
  target: ReviewTarget | null;
  onClose: () => void;
  apiBase: string;
  onReviewed: () => void;
}) {
  const t = useTranslations("assignedTasks");
  const tc = useTranslations("common");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const approving = target?.action === "approve";

  const close = () => { setComment(""); onClose(); };

  const submit = async () => {
    if (!target) return;
    if (!approving && !comment.trim()) { toast.error(t("returnCommentRequired")); return; }
    setSaving(true);
    try {
      const res = await csrfFetch(`${apiBase}/${target.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: target.action, reviewComment: comment.trim() || undefined }),
      });
      if (!res.ok) { toast.error(await errorFrom(res, t("reviewError"))); return; }
      toast.success(approving ? t("approvedToast") : t("returnedToast"));
      close();
      onReviewed();
    } catch {
      toast.error(t("reviewError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{approving ? t("approveTitle") : t("returnTitle")}</DialogTitle>
          <DialogDescription>{target ? t("reviewDescription", { title: target.title, name: target.agentName }) : ""}</DialogDescription>
        </DialogHeader>
        {target?.completionNote && (
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">{t("agentNoteLabel")}</p>
            <p className="mt-1 whitespace-pre-line break-words">{target.completionNote}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="review-comment">{approving ? t("approveCommentLabel") : t("returnCommentLabel")}</Label>
          <Textarea id="review-comment" value={comment} rows={3} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder={approving ? t("approveCommentPlaceholder") : t("returnCommentPlaceholder")} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving} variant={approving ? "default" : "destructive"}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {approving ? t("approveAction") : t("returnAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
