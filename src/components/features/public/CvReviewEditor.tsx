"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagAutocomplete } from "@/components/ui/tag-autocomplete";
import { MonthYearPicker } from "@/app/[locale]/(dashboard)/job-seeker/cv/month-picker";
import type { SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { MAX_SKILLS, skillNames, str } from "./cvReviewEdits";

/**
 * The CV's own content, editable in the review window: summary, skills, jobs
 * and education. Edits change the draft the preview is drawn from, and are
 * saved with the rest of the window (cvEditsBody).
 */

type Entry = Record<string, unknown>;

interface CvReviewEditorProps {
  profile: SeekerProfileData;
  onChange: (next: SeekerProfileData) => void;
}

/** "2025-09" from a stored date ("2025-09-01T00:00:00.000Z"), else "". */
function monthOf(value: unknown): string {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})/.exec(value) : null;
  if (m) return `${m[1]}-${m[2]}`;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7);
  return "";
}

/** The stored form of a picked month: its first day, UTC. */
function dateOf(month: string): string | undefined {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01T00:00:00.000Z` : undefined;
}

export function CvReviewEditor({ profile, onChange }: CvReviewEditorProps) {
  const t = useTranslations("easyApply.reviewEdit");
  const jobs = profile.experience ?? [];
  const schools = profile.education ?? [];
  // One open entry at a time keeps the column short; new ones open themselves.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const setJobs = (next: Entry[]) => onChange({ ...profile, experience: next });
  const setSchools = (next: Entry[]) => onChange({ ...profile, education: next });
  const patchAt = (list: Entry[], i: number, patch: Entry) => list.map((e, j) => (j === i ? { ...e, ...patch } : e));

  return (
    <div className="space-y-6">
      <div className="field">
        <Label htmlFor="review-summary" className="text-xs font-medium text-foreground">{t("summary")}</Label>
        <Textarea id="review-summary" rows={4} maxLength={5000} value={str(profile.summary)}
          onChange={(e) => onChange({ ...profile, summary: e.target.value })} />
      </div>

      <div className="field">
        <Label htmlFor="review-skills" className="text-xs font-medium text-foreground">{t("skills")}</Label>
        <TagAutocomplete id="review-skills" type="skills" max={MAX_SKILLS} value={skillNames(profile.skills)}
          onChange={(skills) => onChange({ ...profile, skills })} placeholder={t("skillsPlaceholder")} />
      </div>

      <section aria-labelledby="review-jobs" className="space-y-2">
        <h4 id="review-jobs" className="text-sm font-semibold text-foreground">{t("jobs")}</h4>
        {jobs.map((job, i) => {
          const key = `job-${i}`;
          const open = openKey === key;
          return (
            <EntryShell
              key={key}
              title={[str(job.jobTitle), str(job.company)].filter(Boolean).join(" · ") || t("newJob")}
              subtitle={[monthOf(job.startDate), job.isCurrent ? t("present") : monthOf(job.endDate)].filter(Boolean).join(" – ")}
              open={open}
              onToggle={() => setOpenKey(open ? null : key)}
              onRemove={() => { setJobs(jobs.filter((_, j) => j !== i)); setOpenKey(null); }}
              removeLabel={t("remove")}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <Label htmlFor={`${key}-title`} className="text-xs">{t("jobTitle")}</Label>
                  <Input id={`${key}-title`} value={str(job.jobTitle)} maxLength={200} onChange={(e) => setJobs(patchAt(jobs, i, { jobTitle: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor={`${key}-company`} className="text-xs">{t("company")}</Label>
                  <Input id={`${key}-company`} value={str(job.company)} maxLength={200} onChange={(e) => setJobs(patchAt(jobs, i, { company: e.target.value }))} />
                </div>
                <MonthYearPicker label={t("from")} value={monthOf(job.startDate)} maxYear={new Date().getFullYear()}
                  onChange={(m) => setJobs(patchAt(jobs, i, { startDate: dateOf(m) }))} />
                <MonthYearPicker label={t("to")} value={job.isCurrent ? "" : monthOf(job.endDate)} disabled={job.isCurrent === true}
                  placeholder={job.isCurrent ? t("present") : undefined} maxYear={new Date().getFullYear()}
                  onChange={(m) => setJobs(patchAt(jobs, i, { endDate: dateOf(m) }))} />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox checked={job.isCurrent === true}
                  onCheckedChange={(v) => setJobs(patchAt(jobs, i, { isCurrent: v === true, ...(v === true ? { endDate: undefined } : {}) }))} />
                {t("current")}
              </label>
              <div className="field">
                <Label htmlFor={`${key}-desc`} className="text-xs">{t("description")}</Label>
                <Textarea id={`${key}-desc`} rows={4} maxLength={3000} value={str(job.description)}
                  onChange={(e) => setJobs(patchAt(jobs, i, { description: e.target.value }))} />
              </div>
            </EntryShell>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-xl"
          onClick={() => { setJobs([...jobs, { jobTitle: "", company: "", isCurrent: false }]); setOpenKey(`job-${jobs.length}`); }}>
          <Plus className="size-4" aria-hidden="true" /> {t("addJob")}
        </Button>
      </section>

      <section aria-labelledby="review-education" className="space-y-2">
        <h4 id="review-education" className="text-sm font-semibold text-foreground">{t("education")}</h4>
        {schools.map((school, i) => {
          const key = `edu-${i}`;
          const open = openKey === key;
          return (
            <EntryShell
              key={key}
              title={[str(school.degree), str(school.institution)].filter(Boolean).join(" · ") || t("newEducation")}
              subtitle={monthOf(school.graduationDate)}
              open={open}
              onToggle={() => setOpenKey(open ? null : key)}
              onRemove={() => { setSchools(schools.filter((_, j) => j !== i)); setOpenKey(null); }}
              removeLabel={t("remove")}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <Label htmlFor={`${key}-degree`} className="text-xs">{t("degree")}</Label>
                  <Input id={`${key}-degree`} value={str(school.degree)} maxLength={200} onChange={(e) => setSchools(patchAt(schools, i, { degree: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor={`${key}-field`} className="text-xs">{t("field")}</Label>
                  <Input id={`${key}-field`} value={str(school.field)} maxLength={200} onChange={(e) => setSchools(patchAt(schools, i, { field: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor={`${key}-school`} className="text-xs">{t("institution")}</Label>
                  <Input id={`${key}-school`} value={str(school.institution)} maxLength={200} onChange={(e) => setSchools(patchAt(schools, i, { institution: e.target.value }))} />
                </div>
                <MonthYearPicker label={t("graduated")} value={monthOf(school.graduationDate)}
                  onChange={(m) => setSchools(patchAt(schools, i, { graduationDate: dateOf(m) }))} />
              </div>
            </EntryShell>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-xl"
          onClick={() => { setSchools([...schools, { degree: "", institution: "" }]); setOpenKey(`edu-${schools.length}`); }}>
          <Plus className="size-4" aria-hidden="true" /> {t("addEducation")}
        </Button>
      </section>
    </div>
  );
}

interface EntryShellProps {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
}

/** One job or school: a summary row that opens into its fields. */
function EntryShell({ title, subtitle, open, onToggle, onRemove, removeLabel, children }: EntryShellProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-background">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground"><bdi>{title}</bdi></span>
            {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`${removeLabel}: ${title}`} className="me-1 size-11 shrink-0">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {open && <div className="space-y-3 border-t border-border/70 p-3">{children}</div>}
    </div>
  );
}
