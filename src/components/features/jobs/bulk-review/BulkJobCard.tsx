"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, ChevronDown, ExternalLink, Loader2, MapPin, Pencil, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";
import { changedFields, type JobAssistChangeField, type JobAssistChanges } from "@/lib/ai/jobAssist";
import { WordingWarning } from "@/components/features/employer/job-form/WordingWarning";
import { assistErrorKind } from "@/components/features/jobs/ai-assistant/useJobAssistant";
import { applyAssistToValues, wizardToAssistDraft } from "@/components/features/employer/job-form/jobFormAssist";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";

export type BulkJobStatus = "idle" | "saving" | "saved" | "error";

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance"] as const;
const WORK_MODES = ["onsite", "hybrid", "remote"] as const;

/**
 * What a job still lacks before it can be saved, even as a draft: the jobs
 * API needs a title, a description and a full location on every job.
 */
export function missingToSave(v: Partial<JobFormValues>): Array<"title" | "description" | "country" | "city"> {
  const missing: Array<"title" | "description" | "country" | "city"> = [];
  if ((v.title?.trim().length ?? 0) < 5) missing.push("title");
  if ((v.description?.trim().length ?? 0) < 20) missing.push("description");
  if (!v.location?.country?.trim()) missing.push("country");
  if (!v.location?.city?.trim()) missing.push("city");
  return missing;
}

export const isReadyToSave = (v: Partial<JobFormValues>) => missingToSave(v).length === 0;

interface BulkJobCardProps {
  job: Partial<JobFormValues>;
  selected: boolean;
  status: BulkJobStatus;
  onToggle: () => void;
  onChange: (next: Partial<JobFormValues>) => void;
  onRemove: () => void;
  onOpenInForm?: () => void;
  /** Saving, or an AI answer pending on any card: nothing may move or change under it. */
  locked: boolean;
  onAiBusyChange: (busy: boolean) => void;
}

/** One job in a bulk review: check it, fix it here or with the AI assistant, or open the full form. */
export function BulkJobCard({ job, selected, status, onToggle, onChange, onRemove, onOpenInForm, locked, onAiBusyChange }: BulkJobCardProps) {
  const t = useTranslations("jobBulkReview");
  const tQuick = useTranslations("jobAssistant.quick.fillMissing");
  const tAssist = useTranslations("jobAssistant");
  const tTypes = useTranslations("jobBulkReview.employmentTypes");
  const tModes = useTranslations("jobBulkReview.workModes");
  const idBase = useId();
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ reply: string; fields: JobAssistChangeField[]; before: Partial<JobFormValues> | null } | null>(null);

  const saved = status === "saved";
  const missing = missingToSave(job);
  const place = [job.location?.city, job.location?.country].filter(Boolean).join(", ");

  // A hand edit ends the AI answer's undo: putting back the whole job as it
  // was would throw that edit away.
  const edit = (next: Partial<JobFormValues>) => {
    setAiNote((note) => (note?.before ? { ...note, before: null } : note));
    onChange(next);
  };
  const set = (patch: Partial<JobFormValues>) => edit({ ...job, ...patch });
  const setLocation = (patch: Partial<NonNullable<JobFormValues["location"]>>) =>
    edit({ ...job, location: { country: "", city: "", isRemote: false, ...job.location, ...patch } });

  async function improveWithAi() {
    setAiBusy(true);
    onAiBusyChange(true);
    try {
      const res = await csrfFetch("/api/ai/job-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: tQuick("instruction"), job: wizardToAssistDraft(job) }),
      });
      if (!res.ok) {
        toast.error(tAssist(`errors.${await assistErrorKind(res)}`));
        return;
      }
      const data = (await res.json()) as { reply: string; changes: JobAssistChanges };
      const fields = changedFields(data.changes);
      setAiNote({ reply: data.reply, fields, before: fields.length ? job : null });
      if (fields.length) onChange(applyAssistToValues(job, data.changes));
    } catch {
      toast.error(tAssist("errors.failed"));
    } finally {
      setAiBusy(false);
      onAiBusyChange(false);
    }
  }

  return (
    <li
      className={cn(
        "rounded-2xl border bg-background transition-colors card-pad",
        saved ? "border-green-300 bg-green-50/50" : status === "error" ? "border-destructive/30 bg-destructive/5" : selected ? "border-primary/40" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-3">
        {!saved && (
          <Checkbox
            // A job missing what the save needs cannot be ticked until it is filled in.
            checked={selected && missing.length === 0}
            disabled={status === "saving" || missing.length > 0}
            onCheckedChange={onToggle}
            aria-label={t("includeJob", { title: job.title || t("untitled") })}
            className="mt-1"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold text-foreground line-clamp-2">{job.title || t("untitled")}</h3>
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                <Check className="size-3" aria-hidden="true" />
                {t("savedAsDraft")}
              </span>
            )}
            {status === "saving" && <Loader2 className="size-4 animate-spin text-primary" aria-label={t("saving")} />}
            {status === "error" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <AlertCircle className="size-3" aria-hidden="true" />
                {t("notSaved")}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden="true" />{place}</span>}
            {job.employmentType && <span>{tTypes(job.employmentType)}</span>}
            {job.workMode && <span>{tModes(job.workMode)}</span>}
          </p>
          {!saved && missing.length > 0 && (
            <p className="text-xs text-amber-700">{t("missing", { fields: missing.map((f) => t(`fields.${f}`)).join(", ") })}</p>
          )}
        </div>
      </div>

      {aiNote && (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-foreground">
          {aiNote.reply && <p className="whitespace-pre-wrap">{aiNote.reply}</p>}
          {aiNote.fields.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{tAssist("updated", { fields: aiNote.fields.map((f) => tAssist(`fields.${f}`)).join(", ") })}</span>
              {aiNote.before && !saved && !locked && (
                <button
                  type="button"
                  className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline"
                  onClick={() => { onChange(aiNote.before!); setAiNote({ ...aiNote, before: null }); }}
                >
                  <Undo2 className="size-3" aria-hidden="true" />
                  {tAssist("undo")}
                </button>
              )}
            </div>
          ) : !aiNote.reply ? <p className="text-muted-foreground">{tAssist("noChange")}</p> : null}
        </div>
      )}

      {editing && !saved && (
        <fieldset disabled={locked} className="mt-3 grid min-w-0 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idBase}-title`} className="text-xs">{t("fields.title")}</Label>
            <Input id={`${idBase}-title`} value={job.title ?? ""} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-country`} className="text-xs">{t("fields.country")}</Label>
            <Input id={`${idBase}-country`} value={job.location?.country ?? ""} maxLength={100} onChange={(e) => setLocation({ country: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-city`} className="text-xs">{t("fields.city")}</Label>
            <Input id={`${idBase}-city`} value={job.location?.city ?? ""} maxLength={100} onChange={(e) => setLocation({ city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-type`} className="text-xs">{t("fields.employmentType")}</Label>
            <Select value={job.employmentType ?? ""} onValueChange={(v) => set({ employmentType: v as JobFormValues["employmentType"] })}>
              <SelectTrigger id={`${idBase}-type`}><SelectValue placeholder={t("choose")} /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((v) => <SelectItem key={v} value={v}>{tTypes(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-mode`} className="text-xs">{t("fields.workMode")}</Label>
            <Select
              value={job.workMode ?? ""}
              onValueChange={(v) => edit({
                ...job,
                workMode: v as JobFormValues["workMode"],
                location: { country: "", city: "", ...job.location, isRemote: v === "remote" },
              })}
            >
              <SelectTrigger id={`${idBase}-mode`}><SelectValue placeholder={t("choose")} /></SelectTrigger>
              <SelectContent>
                {WORK_MODES.map((v) => <SelectItem key={v} value={v}>{tModes(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idBase}-desc`} className="text-xs">{t("fields.description")}</Label>
            <Textarea id={`${idBase}-desc`} value={job.description ?? ""} rows={5} maxLength={5000} onChange={(e) => set({ description: e.target.value })} className="text-sm" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idBase}-skills`} className="text-xs">{t("fields.skills")}</Label>
            <Input
              id={`${idBase}-skills`}
              // Committed on blur; remounts when the AI assistant changes the list.
              key={(job.requirements?.skills ?? []).join("|")}
              defaultValue={(job.requirements?.skills ?? []).join(", ")}
              onBlur={(e) => edit({
                ...job,
                requirements: {
                  preferredSkills: [], experienceMin: 0, experienceMax: 10, ...job.requirements,
                  skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50),
                },
              })}
            />
            <p className="text-[11px] text-muted-foreground">{t("skillsHint")}</p>
          </div>
        </fieldset>
      )}

      {!saved && (
        <WordingWarning
          advert={{ title: job.title, description: job.description, responsibilities: job.responsibilities, qualifications: job.qualifications, benefits: job.benefits }}
          className="mt-3"
        />
      )}

      {!saved && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button type="button" variant="outline" size="sm" className="min-h-9 gap-1.5 text-xs" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? <ChevronDown className="size-3.5 rotate-180" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
            {editing ? t("doneEditing") : t("edit")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="min-h-9 gap-1.5 text-xs" onClick={improveWithAi} disabled={locked}>
            {aiBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5 text-primary" aria-hidden="true" />}
            {aiBusy ? t("improving") : t("improveWithAi")}
          </Button>
          {onOpenInForm && (
            <Button type="button" variant="ghost" size="sm" className="min-h-9 gap-1.5 text-xs" onClick={onOpenInForm} disabled={locked}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("openFullForm")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ms-auto min-h-9 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={locked}
            aria-label={t("removeJob", { title: job.title || t("untitled") })}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </li>
  );
}
