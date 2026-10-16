"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { PendingFilesField } from "./ExhibitionAttachments";
import { uploadExhibitionFiles } from "./attachmentsClient";

export interface CompleteEventRequest {
  _id: string;
  eventName: string;
  expectedLeads?: number;
  completionPhotoCount?: number;
  budgetCurrency?: string;
  approvedBudget?: number;
  actualSpend?: number;
  completionReport?: { actualLeads?: number; summary?: string } | null;
}

interface CompleteEventDialogProps {
  request: CompleteEventRequest | null;
  /**
   * `complete` moves a running event to completed; `outcome` records or
   * corrects the outcome of one that already is (admin only).
   */
  mode?: "complete" | "outcome";
  /** Admin: also records what the event actually cost. */
  recordSpend?: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * The event's outcome: leads collected, how it went and, from the agent, the
 * photos; from the admin, the actual spend instead of photos (client feedback 2026-10-14: "Agent should update
 * the exhibition status… photos upload option upon completion"). The agent
 * and the admin complete an event through this one form, so an event closed
 * from either side carries the same report. Photos upload first, while the
 * event is still running, so a failed upload leaves the request where it was.
 */
export function CompleteEventDialog({ request, mode = "complete", recordSpend = false, onClose, onDone }: CompleteEventDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [actualLeads, setActualLeads] = useState("");
  const [summary, setSummary] = useState("");
  const [spend, setSpend] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const recording = mode === "outcome";

  useEffect(() => {
    if (!request) return;
    const report = request.completionReport;
    setActualLeads(typeof report?.actualLeads === "number" ? String(report.actualLeads) : "");
    setSummary(report?.summary ?? "");
    setSpend(typeof request.actualSpend === "number" ? String(request.actualSpend) : "");
    setPhotos([]);
    setError("");
  }, [request]);

  const submit = async () => {
    if (!request || saving) return;
    const spendValue = spend.trim() === "" ? undefined : Number(spend);
    if (spendValue !== undefined && (!Number.isFinite(spendValue) || spendValue < 0)) {
      setError(t("actualSpendInvalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (photos.length > 0) {
        const upload = await uploadExhibitionFiles(request._id, "completion", photos);
        if (!upload.ok) { setError(upload.error ?? t("uploadError")); return; }
        setPhotos([]);
      }
      const body: Record<string, unknown> = {
        completionReport: { actualLeads: actualLeads === "" ? undefined : Number(actualLeads), summary: summary.trim() || undefined },
      };
      if (!recording) body.status = "completed";
      if (recordSpend && spendValue !== undefined) body.actualSpend = spendValue;
      const res = await csrfFetch(`/api/exhibitions/${request._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t(recording ? "outcomeSaveError" : "completeEventError"));
        return;
      }
      toast.success(t(recording ? "outcomeSaved" : "eventCompletedToast"));
      onDone();
    } catch {
      setError(t(recording ? "outcomeSaveError" : "completeEventError"));
    } finally {
      setSaving(false);
    }
  };

  const description = recording
    ? t("recordOutcomeDescription", { name: request?.eventName ?? "" })
    : recordSpend
      ? t("completeEventAdminDescription", { name: request?.eventName ?? "" })
      : t("completeEventDescription", { name: request?.eventName ?? "" });

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{t(recording ? "eventOutcomeTitle" : "completeEventTitle")}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 -mx-1 overflow-y-auto px-1 py-1">
              <div className={recordSpend ? "grid gap-4 sm:grid-cols-2" : ""}>
                <div className="space-y-1.5">
                  <Label htmlFor="completion-leads">{t("leadsCollected")}</Label>
                  <Input
                    id="completion-leads"
                    inputMode="numeric"
                    value={actualLeads}
                    onChange={(e) => setActualLeads(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="0"
                  />
                  {typeof request.expectedLeads === "number" && (
                    <p className="text-xs text-muted-foreground">{t("expectedLeadsWas", { count: request.expectedLeads })}</p>
                  )}
                </div>
                {recordSpend && (
                  <div className="space-y-1.5">
                    <Label htmlFor="completion-spend">{t("actualSpendLabel", { currency: request.budgetCurrency ?? "" })}</Label>
                    <Input
                      id="completion-spend"
                      type="number"
                      min={0}
                      step="any"
                      value={spend}
                      onChange={(e) => { setSpend(e.target.value); setError(""); }}
                      placeholder="0"
                    />
                    {typeof request.approvedBudget === "number" && (
                      <p className="text-xs text-muted-foreground">
                        {t("approvedBudgetWas", { amount: request.approvedBudget, currency: request.budgetCurrency ?? "" })}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="completion-summary">{t("completionSummary")} <span className="text-xs text-muted-foreground">({t("optional")})</span></Label>
                <Textarea
                  id="completion-summary"
                  rows={3}
                  maxLength={2000}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t("completionSummaryPlaceholder")}
                />
              </div>
              {/* Photos are the agent's: added here when they complete the event, or later in its detail view. */}
              {!recording && !recordSpend && (
                <PendingFilesField
                  kind="completion"
                  files={photos}
                  onChange={setPhotos}
                  existingCount={request.completionPhotoCount ?? 0}
                  label={t("completionPhotosTitle")}
                  hint={t("completionPhotosHint")}
                />
              )}
              {error && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
              <Button onClick={() => void submit()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
                {t(recording ? "saveOutcome" : "markEventCompleted")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
