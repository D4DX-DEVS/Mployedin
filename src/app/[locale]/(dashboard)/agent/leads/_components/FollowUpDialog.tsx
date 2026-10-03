"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { FOLLOW_UP_TYPES, type FollowUpType } from "@/lib/leads/stageRules";
import { ChoiceChips } from "./ChoiceChips";
import { ACTIVITY_ICONS, CONTACT_METHOD_KEYS, followUpHasTime, type Lead, type T } from "./leadShared";

/** Schedule or reschedule a lead's next follow-up: when, how, and what for. */
export function FollowUpDialog({
  open,
  lead,
  onOpenChange,
  onSaved,
  t,
  tf,
}: {
  open: boolean;
  lead: Lead | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (lead: Lead) => void;
  t: T;
  tf: T;
}) {
  const [at, setAt] = useState("");
  const [type, setType] = useState<FollowUpType | undefined>();
  const [what, setWhat] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !lead) return;
    // A date-only legacy follow-up has no real time; start the picker blank
    // rather than at an invented 4:00 AM.
    setAt(lead.followUpAt && followUpHasTime(lead.followUpAt) ? lead.followUpAt : "");
    setType(lead.followUpType);
    setWhat(lead.followUpNote ?? "");
    setError("");
  }, [open, lead]);

  if (!lead) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!at) { setError(tf("requiredFields", { fields: t("followUpWhenLabel") })); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpAt: at, followUpType: type, followUpNote: what.trim() || undefined }),
      });
      if (!res.ok) { setError(t("followUpSaveFailed")); return; }
      onSaved(await res.json());
      onOpenChange(false);
    } catch {
      setError(tf("network"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pe-10">
          <DialogTitle>{lead.followUpAt ? t("rescheduleFollowUp") : t("addFollowUp")}</DialogTitle>
          <DialogDescription>{lead.companyName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 chip-pad text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="follow-up-at">{t("followUpWhenLabel")}<span className="ms-0.5 text-destructive" aria-hidden="true">*</span></Label>
            <DateTimePicker id="follow-up-at" value={at} onChange={(v) => { setAt(v); setError(""); }} minDate={new Date()} modal />
          </div>
          <div className="space-y-2">
            <p id="follow-up-type" className="text-sm font-medium">{t("followUpTypeLabel")}</p>
            <ChoiceChips
              labelledBy="follow-up-type"
              choices={FOLLOW_UP_TYPES.map((m) => ({ value: m, label: t(CONTACT_METHOD_KEYS[m]), icon: ACTIVITY_ICONS[m] }))}
              value={type}
              onChange={setType}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="follow-up-what">{t("followUpWhatLabel")}</Label>
            <Input id="follow-up-what" value={what} onChange={(e) => setWhat(e.target.value)} maxLength={200} placeholder={t("followUpWhatPlaceholder")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancelAction")}</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("saveFollowUp")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
