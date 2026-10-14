"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { STEP_BACK } from "@/lib/exhibitions/transitions";

/** The request fields a reviewer can correct. */
export interface EditableRequest {
  _id: string;
  status: string;
  eventName: string;
  eventCategory: string;
  eventLocation?: string;
  venue?: string;
  country?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  organizerName?: string;
  organizerContact?: string;
  description?: string;
  expectedLeads?: number;
}

const CATEGORY_KEYS: [string, string][] = [
  ["career_fair", "categoryCareerFair"],
  ["recruitment_expo", "categoryRecruitmentExpo"],
  ["employer_branding", "categoryEmployerBranding"],
  ["hiring_drive", "categoryHiringDrive"],
  ["university_event", "categoryUniversityEvent"],
  ["gcc_recruitment", "categoryGccRecruitment"],
  ["job_fair", "categoryJobFair"],
  ["other", "categoryOther"],
];

const dateOnly = (value?: string) => (value ? value.slice(0, 10) : "");

/**
 * Super agent / admin: correct the facts of a request (client feedback
 * 2026-10-14: no edit option for super agent or admin). The server logs which
 * fields changed in the request's history.
 */
export function EditRequestDialog({ request, onClose, onSaved }: { request: EditableRequest | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const initial = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!request) return;
    const values = {
      eventName: request.eventName ?? "",
      eventCategory: request.eventCategory ?? "career_fair",
      eventLocation: request.eventLocation && request.eventLocation !== "TBD" ? request.eventLocation : "",
      venue: request.venue ?? "",
      country: request.country ?? "",
      eventStartDate: dateOnly(request.eventStartDate),
      eventEndDate: dateOnly(request.eventEndDate),
      organizerName: request.organizerName ?? "",
      organizerContact: request.organizerContact ?? "",
      description: request.description ?? "",
      expectedLeads: request.expectedLeads != null ? String(request.expectedLeads) : "",
    };
    initial.current = values;
    setForm(values);
    setError("");
  }, [request]);

  const categoryOptions = useMemo(() => CATEGORY_KEYS.map(([value, key]) => ({ value, label: t(key) })), [t]);
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!request) return;
    if (!form.eventName?.trim()) { setError(t("enterExhibitionTitle")); return; }
    if (form.eventStartDate && form.eventEndDate && form.eventEndDate < form.eventStartDate) { setError(t("endDateEarlierThanStart")); return; }
    // Only what changed, so an untouched field never overwrites a newer value.
    const details = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== initial.current[key]));
    if (Object.keys(details).length === 0) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/exhibitions/${request._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("editDetailsError"));
        return;
      }
      toast.success(t("detailsSaved"));
      onSaved();
    } catch {
      setError(t("editDetailsError"));
    } finally {
      setSaving(false);
    }
  };

  const text = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${key}`}>{label}</Label>
      <Input id={`edit-${key}`} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent ref={setContainer} className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("editDetailsTitle")}</DialogTitle>
          <DialogDescription>{t("editDetailsDescription")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pe-1">
          {text("eventName", t("exhibitionTitleLabel"), { maxLength: 200 })}
          <div className="space-y-1.5">
            <Label>{t("tableHeaderCategory")}</Label>
            <SearchableSelect options={categoryOptions} value={form.eventCategory ?? "career_fair"} onValueChange={(v) => set("eventCategory", v)} ariaLabel={t("tableHeaderCategory")} container={container} modal />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("startDate")}</Label>
              <DateTimePicker value={form.eventStartDate ?? ""} onChange={(v) => set("eventStartDate", v)} mode="date" placeholder={t("selectStartDate")} container={container} modal />
            </div>
            <div className="space-y-1.5">
              <Label>{t("endDate")}</Label>
              <DateTimePicker value={form.eventEndDate ?? ""} onChange={(v) => set("eventEndDate", v)} mode="date" placeholder={t("selectEndDate")} container={container} modal />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("eventLocation", t("eventLocation"), { maxLength: 300 })}
            {text("country", t("country"), { maxLength: 100 })}
          </div>
          {text("venue", t("venue"), { maxLength: 300 })}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("organizerName", t("organizerName"), { maxLength: 200 })}
            {text("organizerContact", t("organizerContactShort"), { maxLength: 200 })}
          </div>
          {text("expectedLeads", t("detailExpectedLeads"), {
            inputMode: "numeric",
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => set("expectedLeads", e.target.value.replace(/\D/g, "").slice(0, 6)),
          })}
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">{t("description")}</Label>
            <Textarea id="edit-description" rows={3} maxLength={5000} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Move a request back one stage, with the reason the server requires
 * (client feedback 2026-10-14: "no back option"). `stageLabel` names the
 * stage it returns to, in the caller's own vocabulary.
 */
export function MoveBackDialog({
  request,
  stageLabel,
  onClose,
  onDone,
}: {
  request: { _id: string; status: string; eventName: string } | null;
  stageLabel: (status: string) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const target = request ? STEP_BACK[request.status as keyof typeof STEP_BACK] : undefined;

  useEffect(() => { setReason(""); setError(""); }, [request]);

  const submit = async () => {
    if (!request || !target) return;
    if (!reason.trim()) {
      setError(t("moveBackReasonRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/exhibitions/${request._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, statusReason: reason.trim(), reviewNote: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("moveBackError"));
        return;
      }
      toast.success(t("movedBackToast", { stage: stageLabel(target) }));
      onDone();
    } catch {
      setError(t("moveBackError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!request && !!target} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        {request && target && (
          <>
            <DialogHeader>
              <DialogTitle>{t("moveBackTitle", { stage: stageLabel(target) })}</DialogTitle>
              <DialogDescription>{t("moveBackDescription", { name: request.eventName, from: stageLabel(request.status) })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="move-back-reason">{t("moveBackReason")} <span className="text-destructive">*</span></Label>
              <Textarea id="move-back-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} placeholder={t("moveBackReasonPlaceholder")} aria-required aria-invalid={error && !reason.trim() ? true : undefined} />
              <p className="text-xs text-muted-foreground">{t("reviewReasonShared")}</p>
            </div>
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
              <Button onClick={() => void submit()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Undo2 className="size-4" aria-hidden="true" />}
                {t("moveBackConfirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
