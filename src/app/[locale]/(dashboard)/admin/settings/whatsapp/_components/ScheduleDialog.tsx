"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { FieldError } from "@/components/shared/FieldError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTimezoneOptions } from "@/lib/i18n/useTimezoneOptions";
import { API, TemplateLabel, fitParams, paramRule, roleLabel, type WaSchedule, type WaTemplate } from "./shared";
import {
  EMPTY_FORM, SCHEDULE_DEFAULT_PARAMS, SCHEDULE_ROLES, TIMEZONES, hasErrors, isSpentOneOff, templateKey, toBody, toForm, toPatchBody, validateForm, type ScheduleErrors, type ScheduleForm,
} from "./scheduleForm";
import { RepeatPicker } from "./RepeatPicker";

interface BodyProps {
  /** The schedule being edited, or null for a new one. */
  editing: WaSchedule | null;
  /** Approved templates; null until they have loaded, or when they could not be. */
  approved: WaTemplate[] | null;
  templatesFailed: boolean;
  onRetryTemplates: () => void;
  onCancel: () => void;
  onSaved: () => void;
  /** The server no longer has this schedule (it was deleted meanwhile). */
  onGone: () => void;
}

interface ScheduleDialogProps extends Omit<BodyProps, "onCancel"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The form lives in the dialog's content, which Radix unmounts on close, so every opening starts from `editing`. */
export function ScheduleDialog({ open, onOpenChange, ...body }: ScheduleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <ScheduleFormBody {...body} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleFormBody({ editing, approved, templatesFailed, onRetryTemplates, onCancel, onSaved, onGone }: BodyProps) {
  const t = useTranslations("adminWhatsApp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [form, setForm] = useState<ScheduleForm>(() => (editing ? toForm(editing) : EMPTY_FORM));
  // City names with today's offset. The stored value stays the zone id; a stored zone outside TIMEZONES is added at the top so it is kept.
  const zones = useTimezoneOptions(TIMEZONES, form.timezone);
  // Errors stay hidden until the first Save, so an empty form is not covered in red on open.
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<"invalid" | "generic" | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<ScheduleForm>) => setForm((f) => ({ ...f, ...patch }));

  // A fired one-off is shown as Completed; saving it with a future time switches it on again (see toPatchBody).
  const spent = editing ? isSpentOneOff(editing, new Date()) : false;
  const errors = validateForm(form, approved, { willRun: editing ? editing.enabled : true, now: new Date() });
  const shown: ScheduleErrors = attempted ? errors : {};

  const pickTemplate = (key: string) => {
    const [templateName, language] = key.split("::");
    const rule = paramRule(approved, templateName, language);
    set({ templateName, language, params: rule.kind === "exact" ? fitParams(form.params, rule.count, SCHEDULE_DEFAULT_PARAMS) : form.params });
  };

  const submit = async () => {
    if (saving) return;
    setSaveError(null);
    if (hasErrors(errors)) {
      setAttempted(true);
      // The weekday toggles are buttons, which take no aria-invalid: their group is marked instead.
      requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] button')?.focus());
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `${API.schedules}/${editing._id}` : API.schedules, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? toPatchBody(form, editing, new Date()) : toBody(form)),
      });
      if (res.ok) {
        onSaved();
        return;
      }
      if (res.status === 404) {
        onGone();
        return;
      }
      // A 400 carries an English server sentence (timing, audience or Zod) that is never shown: one message covers all of them.
      setSaveError(res.status === 400 ? "invalid" : "generic");
    } catch {
      setSaveError("generic");
    } finally {
      setSaving(false);
    }
  };

  const templateValue = form.templateName ? templateKey(form.templateName, form.language) : undefined;
  const templateListed = approved?.some((x) => x.name === form.templateName && x.language === form.language) ?? false;
  const paramProblemShown = shown.params;
  const runAtError = shown.runAt === "required" ? t("errRunAtRequired") : shown.runAt === "past" ? t("errRunAtPast") : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? t("editSchedule") : t("newSchedule")}</DialogTitle>
        <DialogDescription>{t("schedulesDesc")}</DialogDescription>
      </DialogHeader>
      <div ref={bodyRef} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="wa-sch-name">{t("fieldName")}</Label>
          <Input
            id="wa-sch-name"
            value={form.name}
            maxLength={120}
            aria-invalid={shown.name ? true : undefined}
            aria-describedby={shown.name ? "wa-sch-name-error" : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          <FieldError id="wa-sch-name-error" message={shown.name ? t("errNameRequired") : undefined} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wa-sch-kind">{t("fieldKind")}</Label>
            <Select value={form.kind} onValueChange={(v) => set({ kind: v as ScheduleForm["kind"] })}>
              <SelectTrigger id="wa-sch-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="once">{t("kindOnce")}</SelectItem>
                <SelectItem value="recurring">{t("kindRecurring")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* A one-off fires at an instant, so its zone is ignored (and the picker below is in the browser's own zone). */}
          {form.kind === "recurring" && (
            <div className="space-y-1">
              <Label htmlFor="wa-sch-tz">{t("fieldTimezone")}</Label>
              <Select value={zones.value} onValueChange={(v) => set({ timezone: v })}>
                <SelectTrigger
                  id="wa-sch-tz"
                  aria-invalid={shown.timezone ? true : undefined}
                  aria-describedby={shown.timezone ? "wa-sch-tz-error" : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.options.map((zone) => <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError id="wa-sch-tz-error" message={shown.timezone ? t("errTimezoneInvalid") : undefined} />
            </div>
          )}
        </div>

        {form.kind === "once" ? (
          <div className="space-y-1">
            <DateTimePicker
              id="wa-sch-runat"
              label={t("fieldRunAt")}
              value={form.runAt}
              onChange={(v) => set({ runAt: v })}
              minDate={new Date()}
              modal
              ariaInvalid={Boolean(runAtError)}
              ariaDescribedBy={runAtError ? "wa-sch-runat-error" : undefined}
            />
            <FieldError id="wa-sch-runat-error" message={runAtError} />
            {spent && <p className="text-xs text-muted-foreground">{t("scheduleSpentEditNote")}</p>}
          </div>
        ) : (
          <RepeatPicker repeat={form.repeat} onChange={(repeat) => set({ repeat })} error={shown.repeat} />
        )}

        <div className="space-y-1">
          <Label htmlFor="wa-sch-template">{t("fieldTemplate")}</Label>
          <Select value={templateValue ?? ""} onValueChange={pickTemplate}>
            <SelectTrigger
              id="wa-sch-template"
              aria-invalid={shown.template ? true : undefined}
              aria-describedby={shown.template ? "wa-sch-template-error" : undefined}
            >
              <SelectValue placeholder={t("fieldTemplate")} />
            </SelectTrigger>
            <SelectContent>
              {/* Radix forbids an empty-string item value; the current pair stays pickable even when Meta no longer approves it. */}
              {templateValue && !templateListed && <SelectItem value={templateValue}><TemplateLabel name={form.templateName} language={form.language} locale={locale} /></SelectItem>}
              {(approved ?? []).map((x) => (
                // (name, language) is the identity: a sync can delete and re-create rows, so _id is not stable.
                <SelectItem key={templateKey(x.name, x.language)} value={templateKey(x.name, x.language)}><TemplateLabel name={x.name} language={x.language} locale={locale} /></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="wa-sch-template-error" message={shown.template ? t("errTemplateRequired") : undefined} />
          {/* Only once the approved list has loaded: an empty list from a failed load says nothing about approval. */}
          {approved && templateValue && !templateListed && <p className="text-xs text-amber-600">{t("templateNotApprovedLanguage")}</p>}
          {approved && approved.length === 0 && <p className="text-xs text-muted-foreground">{t("noApprovedTemplates")}</p>}
          {templatesFailed && (
            <div className="flex flex-wrap items-center gap-2" role="status">
              <p className="text-xs text-amber-600">{t("templatesLoadError")}</p>
              <Button type="button" size="dense" variant="outline" onClick={onRetryTemplates}>{tc("errorStateRetry")}</Button>
            </div>
          )}
        </div>

        {form.params.length > 0 && (
          <div className="space-y-1">
            <div className="grid gap-2 sm:grid-cols-2">
              {form.params.map((v, i) => (
                <div key={i} className="space-y-1">
                  <Label htmlFor={`wa-sch-param-${i}`}>{t("paramPlaceholder", { index: i + 1 })}</Label>
                  <Input
                    id={`wa-sch-param-${i}`}
                    dir="ltr"
                    maxLength={1024}
                    value={v}
                    aria-invalid={paramProblemShown ? true : undefined}
                    aria-describedby={paramProblemShown ? "wa-sch-params-error" : undefined}
                    onChange={(e) => set({ params: form.params.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("scheduleTokensHelp")}</p>
          </div>
        )}
        {paramProblemShown?.kind === "mismatch" && (
          <div className="flex flex-wrap items-center gap-2">
            <FieldError id="wa-sch-params-error" message={t("scheduleParamCountMismatch", { expected: paramProblemShown.expected, actual: form.params.length })} />
            <Button
              type="button"
              size="dense"
              variant="outline"
              onClick={() => set({ params: fitParams(form.params, paramProblemShown.expected, SCHEDULE_DEFAULT_PARAMS) })}
            >
              {t("paramsMatchTemplate")}
            </Button>
          </div>
        )}
        {paramProblemShown?.kind === "blank" && <FieldError id="wa-sch-params-error" message={t("paramEmpty")} />}
        {paramProblemShown?.kind === "unknownToken" && (
          <FieldError id="wa-sch-params-error" message={t("scheduleParamUnknownToken", { token: `{{${paramProblemShown.token}}}` })} />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <Label htmlFor="wa-sch-all" className="font-medium">{t("audienceAll")}</Label>
            <Switch id="wa-sch-all" checked={form.targetAll} onCheckedChange={(v) => set({ targetAll: v })} />
          </div>
          {!form.targetAll && (
            <div role="group" aria-label={t("fieldAudience")} aria-describedby={shown.audience ? "wa-sch-audience-error" : undefined} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCHEDULE_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.targetRoles.includes(role)}
                    onCheckedChange={(v) => set({ targetRoles: v === true ? [...form.targetRoles, role] : form.targetRoles.filter((r) => r !== role) })}
                  />
                  {roleLabel(role, t)}
                </label>
              ))}
            </div>
          )}
          <FieldError id="wa-sch-audience-error" message={shown.audience ? t("errAudienceRequired") : undefined} />
        </div>

        <FieldError
          id="wa-sch-save-error"
          message={saveError === "invalid" ? t("scheduleInvalid") : saveError === "generic" ? t("scheduleSaveError") : undefined}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t("cancel")}</Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {saving ? t("saving") : t("saveSchedule")}
        </Button>
      </DialogFooter>
    </>
  );
}
