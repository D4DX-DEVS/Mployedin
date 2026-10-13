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

/**
 * An agent finishing a task someone assigned: the note is what the reviewer
 * reads before approving it or sending it back.
 */
export function SubmitTaskDialog({
  task, onClose, onSubmitted,
}: {
  task: { id: string; title: string; assignerName: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations("agentTasks");
  const tc = useTranslations("common");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => { setNote(""); onClose(); };

  const submit = async () => {
    if (!task) return;
    if (!note.trim()) { toast.error(t("submitNoteRequired")); return; }
    setSaving(true);
    try {
      const res = await csrfFetch(`/api/agent/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", completionNote: note.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t("submitError"));
        return;
      }
      toast.success(t("submitSuccess"));
      close();
      onSubmitted();
    } catch {
      toast.error(t("submitError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={task !== null} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("submitTitle")}</DialogTitle>
          <DialogDescription>{task ? t("submitDescription", { title: task.title, name: task.assignerName }) : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="submit-note">{t("submitNoteLabel")}</Label>
          <Textarea id="submit-note" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("submitNotePlaceholder")} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("submitAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
