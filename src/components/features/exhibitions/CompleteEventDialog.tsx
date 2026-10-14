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

interface CompleteEventDialogProps {
  request: { _id: string; eventName: string; expectedLeads?: number; completionPhotoCount?: number } | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * The agent reports their event finished (client feedback 2026-10-14:
 * "Agent should update the exhibition status… photos upload option upon
 * completion"). Photos upload first, while the event is still running, so a
 * failed upload leaves the request where it was and nothing half-done.
 */
export function CompleteEventDialog({ request, onClose, onDone }: CompleteEventDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [actualLeads, setActualLeads] = useState("");
  const [summary, setSummary] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!request) return;
    setActualLeads("");
    setSummary("");
    setPhotos([]);
    setError("");
  }, [request]);

  const submit = async () => {
    if (!request || saving) return;
    setSaving(true);
    setError("");
    try {
      if (photos.length > 0) {
        const upload = await uploadExhibitionFiles(request._id, "completion", photos);
        if (!upload.ok) { setError(upload.error ?? t("uploadError")); return; }
        setPhotos([]);
      }
      const res = await csrfFetch(`/api/exhibitions/${request._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completionReport: { actualLeads: actualLeads === "" ? undefined : Number(actualLeads), summary: summary.trim() || undefined },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("completeEventError"));
        return;
      }
      toast.success(t("eventCompletedToast"));
      onDone();
    } catch {
      setError(t("completeEventError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{t("completeEventTitle")}</DialogTitle>
              <DialogDescription>{t("completeEventDescription", { name: request.eventName })}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
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
              <PendingFilesField
                kind="completion"
                files={photos}
                onChange={setPhotos}
                existingCount={request.completionPhotoCount ?? 0}
                label={t("completionPhotosTitle")}
                hint={t("completionPhotosHint")}
              />
              {error && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
              <Button onClick={() => void submit()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
                {t("markEventCompleted")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
