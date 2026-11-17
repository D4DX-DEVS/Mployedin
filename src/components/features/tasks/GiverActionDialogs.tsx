"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { errorFrom } from "./GiveTaskDialog";
import { PeoplePicker, type PersonOption } from "./PeoplePicker";

/**
 * What a giver does to a task they gave, from "Tasks I gave":
 * withdraw it, give it to someone else, or change its due date — for one
 * person's copy, or (`scope: "group"`) every open copy of a group task.
 */
export interface GiverActionTarget {
  action: "withdraw" | "reassign" | "set_due";
  taskId: string;
  title: string;
  /** Whose copy, for the one-person wording. */
  personName?: string;
  scope: "one" | "group";
  /** Open copies the group action reaches. */
  openCount?: number;
  /** reassign: who it may go to (same role as now), minus the current person. */
  candidates?: PersonOption[];
  dueDate?: string;
}

interface GiverActionDialogProps {
  target: GiverActionTarget | null;
  apiBase: string;
  onClose: () => void;
  onDone: () => void;
}

export function GiverActionDialog({ target, apiBase, onClose, onDone }: GiverActionDialogProps) {
  const t = useTranslations("assignedTasks");
  const tc = useTranslations("common");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [toUser, setToUser] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote("");
    setToUser([]);
    setDue(target?.dueDate ? target.dueDate.slice(0, 10) : "");
  }, [target]);

  const group = target?.scope === "group";
  const title = !target ? "" : target.action === "withdraw"
    ? (group ? t("withdrawGroupTitle") : t("withdrawTitle"))
    : target.action === "reassign" ? t("reassignTitle")
    : (group ? t("dueGroupTitle") : t("dueTitle"));
  const description = !target ? "" : target.action === "withdraw"
    ? (group ? t("withdrawGroupDescription", { count: target.openCount ?? 0, title: target.title }) : t("withdrawDescription", { name: target.personName ?? "", title: target.title }))
    : target.action === "reassign" ? t("reassignDescription", { name: target.personName ?? "", title: target.title })
    : (group ? t("dueGroupDescription", { count: target.openCount ?? 0 }) : t("dueDescription", { title: target.title }));

  const submit = async () => {
    if (!target || saving) return;
    if (target.action === "reassign" && toUser.length !== 1) { toast.error(t("reassignPickOne")); return; }
    const body = target.action === "withdraw"
      ? { action: "withdraw", scope: target.scope, note: note.trim() || undefined }
      : target.action === "reassign"
        ? { action: "reassign", toUserId: toUser[0], note: note.trim() || undefined }
        : { action: "set_due", scope: target.scope, dueDate: due ? new Date(due).toISOString() : null };
    setSaving(true);
    try {
      const res = await csrfFetch(`${apiBase}/${target.taskId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error(await errorFrom(res, t("actionError"))); return; }
      toast.success(target.action === "withdraw" ? t("withdrawnToast") : target.action === "reassign" ? t("reassignedToast") : t("dueChangedToast"));
      onClose();
      onDone();
    } catch {
      toast.error(t("actionError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {target?.action === "reassign" && (
            <PeoplePicker
              people={target.candidates ?? []}
              values={toUser}
              onChange={(v) => setToUser(v.slice(-1))}
              label={t("reassignTo")}
              emptyMessage={t("noAgents")}
            />
          )}
          {target?.action === "set_due" && (
            <div className="space-y-1.5">
              <Label htmlFor="giver-due">{t("fieldDue")}</Label>
              <DateTimePicker mode="date" minDate={new Date()} value={due} onChange={setDue} />
              <p className="text-xs text-muted-foreground">{t("dueClearHint")}</p>
            </div>
          )}
          {target && target.action !== "set_due" && (
            <div className="space-y-1.5">
              <Label htmlFor="giver-note">{t("actionNoteLabel")}</Label>
              <Textarea id="giver-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("actionNotePlaceholder")} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving} variant={target?.action === "withdraw" ? "destructive" : "default"}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {target?.action === "withdraw" ? t("withdrawAction") : target?.action === "reassign" ? t("reassignAction") : t("dueSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
