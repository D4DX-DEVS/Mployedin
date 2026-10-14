"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";

export interface AssignableAgentOption {
  userId: string;
  name: string;
  email: string;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => null);
  const detail = Array.isArray(err?.details) ? err.details[0]?.message : undefined;
  return detail ?? err?.error ?? fallback;
}

const EMPTY = { superAgentUserId: "", agentUserId: "", title: "", description: "", priority: "medium", dueDate: "" };

/** "Assign task": who, what, how urgent, by when. */
export function AssignTaskDialog({
  open, onOpenChange, apiBase, agents, superAgents, onAssigned, presetAgentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  agents: AssignableAgentOption[];
  /** Admin only: give the task through one of these super agents (optional). */
  superAgents?: AssignableAgentOption[];
  onAssigned: () => void;
  /** Opened from one agent (their row or profile): start with them chosen. */
  presetAgentUserId?: string;
}) {
  const t = useTranslations("assignedTasks");
  const tc = useTranslations("common");
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // Through a super agent: only their team can be picked (null while loading).
  const [teamAgents, setTeamAgents] = useState<AssignableAgentOption[] | null>(null);
  const via = form.superAgentUserId;

  useEffect(() => {
    if (!via) { setTeamAgents(null); return; }
    let alive = true;
    setTeamAgents(null);
    fetch(`${apiBase}?viaSuperAgent=${encodeURIComponent(via)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setTeamAgents(d?.agents ?? []); })
      .catch(() => { if (alive) setTeamAgents([]); });
    return () => { alive = false; };
  }, [apiBase, via]);

  const agentChoices = via ? teamAgents ?? [] : agents;

  useEffect(() => {
    if (open && presetAgentUserId) setForm((p) => ({ ...p, agentUserId: presetAgentUserId }));
  }, [open, presetAgentUserId]);

  const close = (next: boolean) => {
    if (!next) setForm(EMPTY);
    onOpenChange(next);
  };

  const submit = async () => {
    if (!form.agentUserId) { toast.error(t("chooseAgent")); return; }
    if (!form.title.trim()) { toast.error(t("titleRequired")); return; }
    setSaving(true);
    try {
      const res = await csrfFetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          superAgentUserId: form.superAgentUserId || undefined,
          description: form.description.trim() || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        }),
      });
      if (!res.ok) { toast.error(await errorFrom(res, t("assignError"))); return; }
      toast.success(t("assignSuccess"));
      close(false);
      onAssigned();
    } catch {
      toast.error(t("assignError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent ref={setContainer} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("assignTitle")}</DialogTitle>
          <DialogDescription>{t("assignDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {superAgents && superAgents.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="assign-via">{t("fieldViaSuperAgent")}</Label>
              <SearchableSelect
                id="assign-via"
                options={[
                  { value: "direct", label: t("viaDirect") },
                  ...superAgents.map((a) => ({ value: a.userId, label: a.name ? `${a.name} · ${a.email}` : a.email, triggerLabel: a.name || a.email })),
                ]}
                value={form.superAgentUserId || "direct"}
                // A new super agent means a new team: the chosen agent may not be on it.
                onValueChange={(v) => setForm((p) => ({ ...p, superAgentUserId: v === "direct" ? "" : v, agentUserId: "" }))}
                placeholder={t("viaDirect")}
                container={container}
                modal
              />
              <p className="text-xs text-muted-foreground">{via ? t("viaHelpTeam") : t("viaHelpDirect")}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="assign-agent">{t("fieldAgent")}</Label>
            <SearchableSelect
              id="assign-agent"
              options={agentChoices.map((a) => ({ value: a.userId, label: a.name ? `${a.name} · ${a.email}` : a.email, triggerLabel: a.name || a.email }))}
              value={form.agentUserId}
              onValueChange={(v) => setForm((p) => ({ ...p, agentUserId: v }))}
              placeholder={via && teamAgents === null ? t("loadingTeam") : t("chooseAgent")}
              emptyMessage={via ? t("noTeamAgents") : t("noAgents")}
              disabled={Boolean(via) && teamAgents === null}
              container={container}
              modal
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-title">{t("fieldTitle")}</Label>
            <Input id="assign-title" value={form.title} maxLength={200} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("titlePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-description">{t("fieldDescription")}</Label>
            <Textarea id="assign-description" value={form.description} maxLength={2000} rows={3} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-priority">{t("fieldPriority")}</Label>
              <SearchableSelect
                id="assign-priority"
                options={[
                  { value: "high", label: t("priorityHigh") },
                  { value: "medium", label: t("priorityMedium") },
                  { value: "low", label: t("priorityLow") },
                ]}
                value={form.priority}
                onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}
                container={container}
                modal
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-due">{t("fieldDue")}</Label>
              <DateTimePicker mode="date" minDate={new Date()} value={form.dueDate} onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("assignSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
