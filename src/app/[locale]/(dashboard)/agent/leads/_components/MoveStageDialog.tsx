"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { formatList } from "@/lib/i18n/formatList";
import { cn } from "@/lib/utils";
import {
  CONTACT_METHODS, FOLLOW_UP_TYPES, HIRING_RANGES, LOST_REASONS, STAGE_REQUIRED_FIELDS,
  missingStageFields, stageNeedsDetails,
  type ContactMethod, type FollowUpType, type HiringRange, type LostReasonCode, type StageField,
} from "@/lib/leads/stageRules";
import { ChoiceChips } from "./ChoiceChips";
import {
  ACTIVITY_ICONS, CONTACT_METHOD_KEYS, HIRING_RANGE_KEYS, LOST_REASON_KEYS, STAGES, STAGE_FIELD_KEYS, followUpHasTime,
  type Lead, type LeadStatus, type StageStyle, type T,
} from "./leadShared";

interface MoveValues {
  contactMethod?: ContactMethod;
  contactedAt: string;
  requirement: string;
  expectedHiring?: HiringRange;
  expectedRevenue: string;
  followUpAt: string;
  followUpType?: FollowUpType;
  followUpNote: string;
  wonValue: string;
  wonAt: string;
  lostReasonCode?: LostReasonCode;
  note: string;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The form opens on what the lead already holds, so a move that only
 *  confirms known facts is one click. Won and Lost start blank: they record
 *  this outcome, so the estimate is a hint on the final value, never its
 *  value, and a reopened lead's old loss reason is not offered again. */
function initialValues(lead: Lead): MoveValues {
  // Only a follow-up still ahead, with a real time, counts as the next one.
  const nextFollowUp = lead.followUpAt && followUpHasTime(lead.followUpAt) && new Date(lead.followUpAt) > new Date()
    ? lead.followUpAt
    : "";
  return {
    contactMethod: undefined,
    contactedAt: new Date().toISOString(),
    requirement: lead.requirement ?? "",
    expectedHiring: lead.expectedHiring,
    expectedRevenue: lead.expectedRevenue != null ? String(lead.expectedRevenue) : "",
    followUpAt: nextFollowUp,
    followUpType: lead.followUpType,
    followUpNote: lead.followUpNote ?? "",
    wonValue: "",
    wonAt: today(),
    lostReasonCode: undefined,
    note: "",
  };
}

const asNumber = (value: string) => (value.trim() === "" ? undefined : Number(value));

/**
 * Move a lead between stages, collecting what the target stage needs
 * (src/lib/leads/stageRules.ts). Opened from Move stage (pick any stage), from
 * Mark Won / Mark Lost (stage fixed), and when a card is dropped on a column
 * whose details the lead does not have yet.
 */
export function MoveStageDialog({
  open,
  lead,
  target,
  lockTarget = false,
  onOpenChange,
  onMoved,
  stageConfig,
  t,
  tf,
  locale,
}: {
  open: boolean;
  lead: Lead | null;
  target?: LeadStatus;
  lockTarget?: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: (lead: Lead, from: LeadStatus) => void;
  stageConfig: Record<LeadStatus, StageStyle>;
  t: T;
  tf: T;
  locale: string;
}) {
  const [selected, setSelected] = useState<LeadStatus | undefined>(target);
  const [values, setValues] = useState<MoveValues | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const stageRefs = useRef<Partial<Record<LeadStatus, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!open || !lead) return;
    setSelected(target ?? lead.status);
    setValues(initialValues(lead));
    setError("");
  }, [open, lead, target]);

  const from = lead?.status;
  const needsDetails = Boolean(from && selected && stageNeedsDetails(from, selected));
  const fields = useMemo<readonly StageField[]>(
    () => (needsDetails && selected ? STAGE_REQUIRED_FIELDS[selected] : []),
    [needsDetails, selected],
  );

  if (!lead || !values) return null;

  const set = <K extends keyof MoveValues>(key: K, value: MoveValues[K]) => {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
    setError("");
  };

  const fieldLabel = (field: StageField) => t(STAGE_FIELD_KEYS[field]);
  const isWon = selected === "converted";
  const isLost = selected === "lost";
  const unchanged = !selected || selected === lead.status;

  const payload = (): Record<string, unknown> => {
    const body: Record<string, unknown> = { status: selected };
    if (values.note.trim()) body.note = values.note.trim();
    if (!needsDetails) return body;
    for (const field of fields) {
      if (field === "contactMethod") body.contactMethod = values.contactMethod;
      if (field === "contactedAt") body.contactedAt = values.contactedAt;
      if (field === "requirement") body.requirement = values.requirement.trim();
      if (field === "expectedHiring") body.expectedHiring = values.expectedHiring;
      if (field === "expectedRevenue") body.expectedRevenue = asNumber(values.expectedRevenue);
      if (field === "followUpAt") {
        body.followUpAt = values.followUpAt;
        body.followUpType = values.followUpType;
        body.followUpNote = values.followUpNote.trim() || undefined;
      }
      if (field === "wonValue") body.wonValue = asNumber(values.wonValue);
      if (field === "wonAt") body.wonAt = values.wonAt;
      if (field === "lostReasonCode") body.lostReasonCode = values.lostReasonCode;
    }
    return body;
  };

  // One tab stop for the stage list; arrows move the choice, as in a native
  // radio group (Left/Right follow the reading direction).
  const onStageKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    const target = step !== undefined
      ? STAGES[(index + step + STAGES.length) % STAGES.length]
      : event.key === "Home" ? STAGES[0] : event.key === "End" ? STAGES[STAGES.length - 1] : undefined;
    if (!target) return;
    event.preventDefault();
    setSelected(target);
    setError("");
    stageRefs.current[target]?.focus();
  };

  const requiredMessage = (missing: StageField[]) =>
    tf("requiredFields", { fields: formatList(missing.map(fieldLabel), locale) });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (unchanged || submitting || !selected) return;
    const body = payload();
    // Checked against the form only: a prefilled value the agent cleared is
    // missing, even though the lead still holds the old one.
    const missing = missingStageFields(lead.status, selected, body as Partial<Record<StageField, unknown>>);
    const badNumber = (["expectedRevenue", "wonValue"] as const).some(
      (key) => body[key] !== undefined && (Number.isNaN(body[key]) || (body[key] as number) < 0),
    );
    if (missing.length > 0) { setError(requiredMessage(missing)); return; }
    if (badNumber) { setError(t("moveInvalidAmount")); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverMissing = Array.isArray(data.missing) ? (data.missing as StageField[]) : [];
        const badDates = Array.isArray(data.invalid) && data.invalid.length > 0;
        setError(serverMissing.length > 0 ? requiredMessage(serverMissing) : badDates ? t("moveInvalidDates") : t("moveFailed"));
        return;
      }
      onMoved(data as Lead, lead.status);
      onOpenChange(false);
    } catch {
      setError(tf("network"));
    } finally {
      setSubmitting(false);
    }
  };

  // A drop on a column or Mark Won/Lost fixes the stage, so the title names it.
  const title = !lockTarget || !selected
    ? t("moveLeadTitle")
    : isWon ? t("markWonTitle") : isLost ? t("markLostTitle") : t("moveToStage", { stage: stageConfig[selected].label });
  const submitLabel = isWon ? t("markWon") : isLost ? t("markLost") : t("moveAction");
  const required = <span className="ms-0.5 text-destructive" aria-hidden="true">*</span>;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[calc(100dvh-4rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 px-6 pb-2 pt-6 pe-14">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{lead.companyName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 chip-pad text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!lockTarget && (
              <div className="space-y-2">
                <p id="move-stage-label" className="text-sm font-medium">{t("moveToLabel")}</p>
                <div role="radiogroup" aria-labelledby="move-stage-label" className="grid gap-1.5">
                  {STAGES.map((stage, index) => {
                    const style = stageConfig[stage];
                    const checked = selected === stage;
                    const current = stage === lead.status;
                    return (
                      <button
                        key={stage}
                        ref={(node) => { stageRefs.current[stage] = node; }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked || (!selected && index === 0) ? 0 : -1}
                        onKeyDown={(event) => onStageKey(event, index)}
                        onClick={() => { setSelected(stage); setError(""); }}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-lg border px-3 text-start text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          checked ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-foreground/30",
                        )}
                      >
                        <span className={cn("[&_svg]:h-4 [&_svg]:w-4", style.color)}>{style.icon}</span>
                        <span className="flex-1">{style.label}</span>
                        {current && <span className="text-xs font-normal text-muted-foreground">{t("currentStageTag")}</span>}
                        {checked && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {fields.includes("contactMethod") && (
              <div className="space-y-2">
                <p id="move-contact-method" className="text-sm font-medium">{fieldLabel("contactMethod")}{required}</p>
                <ChoiceChips
                  labelledBy="move-contact-method"
                  choices={CONTACT_METHODS.map((m) => ({ value: m, label: t(CONTACT_METHOD_KEYS[m]), icon: ACTIVITY_ICONS[m] }))}
                  value={values.contactMethod}
                  onChange={(v) => set("contactMethod", v)}
                />
              </div>
            )}
            {fields.includes("contactedAt") && (
              <div className="space-y-2">
                <Label htmlFor="move-contacted-at">{fieldLabel("contactedAt")}{required}</Label>
                <DateTimePicker id="move-contacted-at" value={values.contactedAt} onChange={(v) => set("contactedAt", v)} maxDate={new Date()} modal />
              </div>
            )}
            {fields.includes("requirement") && (
              <div className="space-y-2">
                <Label htmlFor="move-requirement">{fieldLabel("requirement")}{required}</Label>
                <Input id="move-requirement" value={values.requirement} onChange={(e) => set("requirement", e.target.value)} placeholder={t("requirementPlaceholder")} maxLength={500} />
              </div>
            )}
            {fields.includes("expectedHiring") && (
              <div className="space-y-2">
                <Label htmlFor="move-hiring">{fieldLabel("expectedHiring")}{required}</Label>
                <Select value={values.expectedHiring ?? ""} onValueChange={(v) => set("expectedHiring", v as HiringRange)}>
                  <SelectTrigger id="move-hiring"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {HIRING_RANGES.map((range) => <SelectItem key={range} value={range}>{t(HIRING_RANGE_KEYS[range])}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {fields.includes("expectedRevenue") && (
              <MoneyField id="move-proposal" label={fieldLabel("expectedRevenue")} required={required} currency={lead.expectedRevenueCurrency} value={values.expectedRevenue} onChange={(v) => set("expectedRevenue", v)} />
            )}
            {fields.includes("followUpAt") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="move-follow-up">{fieldLabel("followUpAt")}{required}</Label>
                  <DateTimePicker id="move-follow-up" value={values.followUpAt} onChange={(v) => set("followUpAt", v)} minDate={new Date()} modal />
                </div>
                <div className="space-y-2">
                  <p id="move-follow-up-type" className="text-sm font-medium">{t("followUpTypeLabel")}</p>
                  <ChoiceChips
                    labelledBy="move-follow-up-type"
                    choices={FOLLOW_UP_TYPES.map((m) => ({ value: m, label: t(CONTACT_METHOD_KEYS[m]), icon: ACTIVITY_ICONS[m] }))}
                    value={values.followUpType}
                    onChange={(v) => set("followUpType", v)}
                  />
                </div>
              </>
            )}
            {fields.includes("wonValue") && (
              <MoneyField id="move-final-value" label={fieldLabel("wonValue")} required={required} currency={lead.expectedRevenueCurrency} value={values.wonValue} onChange={(v) => set("wonValue", v)} placeholder={lead.expectedRevenue != null ? String(lead.expectedRevenue) : undefined} />
            )}
            {fields.includes("wonAt") && (
              <div className="space-y-2">
                <Label htmlFor="move-won-at">{fieldLabel("wonAt")}{required}</Label>
                <DateTimePicker id="move-won-at" mode="date" value={values.wonAt} onChange={(v) => set("wonAt", v)} maxDate={new Date()} modal />
              </div>
            )}
            {fields.includes("lostReasonCode") && (
              <div className="space-y-2">
                <p id="move-lost-reason" className="text-sm font-medium">{fieldLabel("lostReasonCode")}{required}</p>
                <ChoiceChips
                  labelledBy="move-lost-reason"
                  layout="list"
                  choices={LOST_REASONS.map((r) => ({ value: r, label: t(LOST_REASON_KEYS[r]) }))}
                  value={values.lostReasonCode}
                  onChange={(v) => set("lostReasonCode", v)}
                />
              </div>
            )}

            {!unchanged && (
              <div className="space-y-2">
                <Label htmlFor="move-note">{t("moveNoteLabel")}</Label>
                <Textarea id="move-note" rows={2} value={values.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} placeholder={isLost ? t("lostNotePlaceholder") : undefined} />
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border/50 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("cancelAction")}
            </Button>
            <Button type="submit" disabled={unchanged || submitting} variant={isLost ? "destructive" : "default"}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoneyField({ id, label, required, currency, value, onChange, placeholder }: {
  id: string;
  label: string;
  required: React.ReactNode;
  currency?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required}</Label>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">{currency ?? "AED"}</span>
        <Input id={id} type="number" inputMode="decimal" min={0} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-required="true" />
      </div>
    </div>
  );
}
