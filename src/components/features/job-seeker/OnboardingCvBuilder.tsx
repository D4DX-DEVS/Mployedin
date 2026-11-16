"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, GraduationCap, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete, TagAutocomplete } from "@/components/ui/tag-autocomplete";
import { csrfFetch } from "@/lib/security/csrf-client";
import { cn } from "@/lib/utils";
import { builderProfilePayload } from "@/lib/onboarding/builtCvFromProfile";
import { qualificationLabel } from "@/lib/onboarding/qualifications";
import { SeekerAreaField, type SeekerAreaValue } from "./SeekerAreaField";
import { CvBuilderEntryCard } from "./CvBuilderEntryCard";
import { CvBuilderLanguages } from "./CvBuilderLanguages";
import { QuickStartStep } from "./cv-wizard/QuickStartStep";
import { EducationStep } from "./cv-wizard/EducationStep";
import { ExtrasStep, linkProblem } from "./cv-wizard/ExtrasStep";
import { ReviewStep } from "./cv-wizard/ReviewStep";
import { emptyJob, type BuiltJob, type CvBuilderResult, type CvIdentity } from "./cv-wizard/types";

export type { BuiltJob, CvBuilderResult, LanguageLevel } from "./cv-wizard/types";

/* ── Guided CV builder for seekers who have no CV ─────────────────────────────
   Opened from onboarding beside "Upload my CV". The seeker can write about
   themselves in one box and let AI fill every field (the steps then become a
   review), or go step by step with AI writing help on each one. "Save my CV"
   writes it to the profile — the CV Builder, job matching and onboarding's
   own steps read it from there. */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identity: CvIdentity;
  /** "fresher" | "experienced" | "" from onboarding's first step. */
  workStatus: string;
  area: SeekerAreaValue;
  onAreaChange: (area: SeekerAreaValue) => void;
  /** A CV built before (read back from the profile): editing starts from it. */
  initial?: CvBuilderResult | null;
  /** Roles already on the profile, kept after the target role. */
  existingRoles?: string[];
  onDone: (result: CvBuilderResult) => void;
}

type StepKey = "quick" | "about" | "work" | "projects" | "education" | "skills" | "extras" | "review";
type EntryKind = "jobs" | "projects";
type Extracted = Omit<CvBuilderResult, "fresher" | "templateId" | "linkedin" | "portfolio" | "otherLinks"> & {
  links: { label: string; url: string }[];
};

const blankDraft = (fresher: boolean): CvBuilderResult => ({
  targetRole: "", fresher, jobs: [emptyJob()], projects: [emptyJob()], education: [], skills: [], languages: [],
  certificates: [], linkedin: "", portfolio: "", otherLinks: [], summary: "", templateId: "classic",
  experienceYears: "", experienceMonths: "",
});

async function askAi<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string }> {
  try {
    const res = await csrfFetch("/api/ai/cv-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { data: json, error: "" } : { data: null, error: json.error ?? "" };
  } catch {
    return { data: null, error: "" };
  }
}

const filled = (list: BuiltJob[]) => list.filter((e) => e.title.trim());

export function OnboardingCvBuilder({ open, onOpenChange, identity, workStatus, area, onAreaChange, initial = null, existingRoles = [], onDone }: Props) {
  const t = useTranslations("cvWizard");
  const [draft, setDraft] = useState<CvBuilderResult>(() => blankDraft(workStatus === "fresher"));
  const patch = useCallback((p: Partial<CvBuilderResult>) => setDraft((d) => ({ ...d, ...p })), []);
  const [stepIndex, setStepIndex] = useState(0);
  const [aboutText, setAboutText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [aiFilled, setAiFilled] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [skillIdeas, setSkillIdeas] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const steps = useMemo<StepKey[]>(
    () => ["quick", "about", ...(draft.fresher ? [] : (["work"] as StepKey[])), "projects", "education", "skills", "extras", "review"],
    [draft.fresher],
  );
  const key = steps[Math.min(stepIndex, steps.length - 1)];

  // Editing a saved CV starts from it (on "About you"), never from blank:
  // building again from scratch would replace the saved jobs.
  const seededFrom = useRef<CvBuilderResult | null>(null);
  useEffect(() => {
    if (!open) return;
    if (initial && seededFrom.current !== initial) {
      seededFrom.current = initial;
      setDraft({
        ...initial,
        jobs: initial.jobs.length ? initial.jobs : [emptyJob()],
        projects: initial.projects.length ? initial.projects : [emptyJob()],
      });
      setStepIndex(1);
    } else if (!initial && workStatus) {
      setDraft((d) => (filled(d.jobs).length || filled(d.projects).length ? d : { ...d, fresher: workStatus === "fresher" }));
    }
  }, [open, initial, workStatus]);

  const educationText = useMemo(
    () => draft.education.map((e) => [e.course || qualificationLabel(e.level), e.field, e.institution].filter(Boolean).join(", ")).filter(Boolean).join("; "),
    [draft.education],
  );

  /* ── AI ── */
  const fillWithAi = async () => {
    setQuickError("");
    setExtracting(true);
    const { data, error } = await askAi<Extracted>({
      action: "extract",
      text: aboutText,
      ...(workStatus ? { fresher: workStatus === "fresher" } : {}),
    });
    setExtracting(false);
    if (!data) {
      setQuickError(error || t("aiUnavailable"));
      return;
    }
    const linkOf = (re: RegExp) => data.links.find((l) => re.test(l.label) || re.test(l.url))?.url ?? "";
    const linkedin = linkOf(/linkedin/i);
    const portfolio = linkOf(/portfolio|website/i);
    setDraft((d) => ({
      ...d,
      targetRole: data.targetRole || d.targetRole,
      fresher: workStatus ? workStatus === "fresher" : data.jobs.length === 0,
      // A fresher has no job steps: anything the AI filed as a job (an
      // internship) is kept as a project instead of being dropped.
      ...(() => {
        const fresher = workStatus ? workStatus === "fresher" : data.jobs.length === 0;
        const projects = fresher ? [...data.projects, ...data.jobs] : data.projects;
        return {
          jobs: !fresher && data.jobs.length ? data.jobs : d.jobs,
          projects: projects.length ? projects : d.projects,
        };
      })(),
      education: data.education.length ? data.education : d.education,
      skills: data.skills.length ? data.skills : d.skills,
      languages: data.languages.length ? data.languages : d.languages,
      certificates: data.certificates.length ? data.certificates : d.certificates,
      linkedin: linkedin || d.linkedin,
      portfolio: portfolio || d.portfolio,
      otherLinks: data.links.filter((l) => l.url !== linkedin && l.url !== portfolio),
      summary: data.summary || d.summary,
      experienceYears: data.experienceYears || d.experienceYears,
      experienceMonths: data.experienceMonths || d.experienceMonths,
    }));
    setAiFilled(true);
    setStepIndex(1);
  };

  const writeEntry = async (kind: EntryKind, i: number) => {
    const e = draft[kind][i];
    if (!e?.title.trim()) return;
    setAiError("");
    setWriting(`${kind}-${i}`);
    const { data } = await askAi<{ text?: string }>({
      action: "describe",
      kind: kind === "jobs" ? "job" : "project",
      title: e.title,
      organisation: e.organisation,
      targetRole: draft.targetRole,
      text: e.description,
    });
    setWriting(null);
    const text = data?.text;
    if (text) setDraft((d) => ({ ...d, [kind]: d[kind].map((x, j) => (j === i ? { ...x, description: text } : x)) }));
    else setAiError(t("aiUnavailable"));
  };

  const loadSkillIdeas = useCallback(async () => {
    setSkillsLoading(true);
    const entries = [...filled(draft.jobs), ...filled(draft.projects)];
    const { data } = await askAi<{ skills?: string[] }>({
      action: "skills",
      targetRole: draft.targetRole,
      titles: entries.map((e) => e.title).slice(0, 10),
      text: entries.map((e) => `${e.title}: ${e.description}`).join("\n").slice(0, 3000),
      have: draft.skills.slice(0, 40),
    });
    setSkillsLoading(false);
    setSkillIdeas(data?.skills ?? []);
  }, [draft.jobs, draft.projects, draft.targetRole, draft.skills]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    const entries = draft.fresher ? filled(draft.projects) : [...filled(draft.jobs), ...filled(draft.projects)];
    const { data } = await askAi<{ text?: string }>({
      action: "summary",
      targetRole: draft.targetRole,
      fresher: draft.fresher,
      titles: entries.map((e) => (e.organisation ? `${e.title} at ${e.organisation}` : e.title)).slice(0, 10),
      skills: draft.skills.slice(0, 30),
      education: educationText.slice(0, 200),
    });
    setSummaryLoading(false);
    if (data?.text) patch({ summary: data.text });
    else setAiError(t("aiUnavailable"));
  }, [draft, educationText, patch, t]);

  // Skill ideas and the summary are written when the seeker reaches them.
  const askedSkills = useRef(false);
  const askedSummary = useRef(false);
  useEffect(() => {
    if (key === "skills" && !askedSkills.current) {
      askedSkills.current = true;
      void loadSkillIdeas();
    }
    if (key === "review" && !askedSummary.current && !draft.summary.trim()) {
      askedSummary.current = true;
      void loadSummary();
    }
  }, [key, loadSkillIdeas, loadSummary, draft.summary]);

  /* ── Navigation & save ── */
  const linksOk = !linkProblem("LinkedIn", draft.linkedin) && !linkProblem("Portfolio", draft.portfolio)
    && draft.otherLinks.every((l) => !linkProblem(l.label, l.url));
  const canNext =
    key === "about" ? draft.targetRole.trim().length > 1 && (draft.fresher || draft.experienceYears !== "")
    : key === "work" ? filled(draft.jobs).length > 0
    : key === "extras" ? linksOk
    : true;
  const optional = key === "projects" || key === "skills" || key === "extras" || (key === "education" && !draft.education.length);
  const busy = saving || extracting || writing !== null;

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await csrfFetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(builderProfilePayload(draft, existingRoles)),
      });
      if (!res.ok) throw new Error();
      onDone(draft);
      onOpenChange(false);
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const entryList = (kind: EntryKind) => {
    const list = draft[kind];
    const asProjects = kind === "projects";
    return (
      <>
        {list.map((e, i) => (
          <CvBuilderEntryCard
            key={i}
            entry={e}
            index={i}
            fresher={asProjects}
            canRemove={list.length > 1}
            writing={writing === `${kind}-${i}`}
            aiBusy={writing !== null}
            onChange={(p) => setDraft((d) => ({ ...d, [kind]: d[kind].map((x, j) => (j === i ? { ...x, ...p } : x)) }))}
            onRemove={() => setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, j) => j !== i) }))}
            onWrite={() => void writeEntry(kind, i)}
          />
        ))}
        {list.length < 8 && (
          <Button type="button" variant="outline" className="min-h-11 w-full gap-2" onClick={() => setDraft((d) => ({ ...d, [kind]: [...d[kind], emptyJob()] }))}>
            <Plus className="h-4 w-4" /> {asProjects ? t("work.addProject") : t("work.addJob")}
          </Button>
        )}
      </>
    );
  };

  const addAllIdeas = () => {
    const have = new Set(draft.skills.map((k) => k.toLowerCase()));
    patch({ skills: [...draft.skills, ...skillIdeas.filter((s) => !have.has(s.toLowerCase()))].slice(0, 30) });
  };
  const freshIdeas = skillIdeas.filter((s) => !draft.skills.some((k) => k.toLowerCase() === s.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        ref={setContainer}
        className="sm:max-w-2xl max-h-[92dvh] flex flex-col gap-0 p-0"
        // Focusing the first box on open popped its suggestion list over the step.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b px-5 sm:px-6 pt-6 pb-4 pe-14 text-start">
          <div className="flex items-center gap-1 pb-3" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= stepIndex ? "bg-blue-600" : "bg-gray-200")} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-blue-700">{t("stepOf", { step: stepIndex + 1, total: steps.length })}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
              <Sparkles className="h-3 w-3" /> {t("aiBadge")}
            </span>
          </div>
          <DialogTitle className="text-lg">{t(`${key}.title`, { fresher: draft.fresher ? "yes" : "no" })}</DialogTitle>
          <DialogDescription>{t(`${key}.hint`, { fresher: draft.fresher ? "yes" : "no" })}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {aiFilled && key !== "quick" && key !== "review" && (
            <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" /> {t("aiFilledCheck")}
            </p>
          )}
          {aiError && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{aiError}</p>}

          {key === "quick" && (
            <QuickStartStep text={aboutText} onTextChange={setAboutText} filling={extracting} error={quickError}
              onFill={() => void fillWithAi()} onStepByStep={() => setStepIndex(1)} />
          )}

          {key === "about" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cvw-role">{t("about.roleLabel")}</Label>
                <Autocomplete id="cvw-role" type="roles" value={draft.targetRole} onChange={(v) => patch({ targetRole: v })} placeholder={t("about.rolePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("about.status")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: false, icon: Briefcase, label: t("about.experienced") },
                    { v: true, icon: GraduationCap, label: t("about.fresher") },
                  ].map(({ v, icon: Icon, label }) => (
                    <button key={String(v)} type="button" aria-pressed={draft.fresher === v} onClick={() => patch({ fresher: v })}
                      className={cn("flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 text-start text-sm font-medium transition-colors",
                        draft.fresher === v ? "border-blue-600 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-700 hover:border-blue-300")}>
                      <Icon className="h-4 w-4 shrink-0" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              {!draft.fresher && (
                <div className="space-y-2">
                  <Label htmlFor="cvw-exp-years">{t("about.totalExp")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={draft.experienceYears} onValueChange={(v) => patch({ experienceYears: v })}>
                      <SelectTrigger id="cvw-exp-years" className="h-11"><SelectValue placeholder={t("about.years")} /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {Array.from({ length: 41 }, (_, n) => String(n)).map((n) => <SelectItem key={n} value={n}>{t("about.yearsN", { n: Number(n) })}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={draft.experienceMonths} onValueChange={(v) => patch({ experienceMonths: v })}>
                      <SelectTrigger aria-label={t("about.months")} className="h-11"><SelectValue placeholder={t("about.months")} /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {Array.from({ length: 12 }, (_, n) => String(n)).map((n) => <SelectItem key={n} value={n}>{t("about.monthsN", { n: Number(n) })}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("about.location")}</Label>
                <SeekerAreaField value={area} onChange={onAreaChange} showHint={false} container={container} modal />
              </div>
            </>
          )}

          {key === "work" && entryList("jobs")}
          {key === "projects" && entryList("projects")}
          {key === "education" && <EducationStep education={draft.education} onChange={(education) => patch({ education })} />}

          {key === "skills" && (
            <>
              <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800"><Sparkles className="h-4 w-4 text-blue-600" /> {t("skills.ideas")}</p>
                  <div className="flex items-center gap-3">
                    {!skillsLoading && freshIdeas.length > 0 && (
                      <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={addAllIdeas}>{t("skills.addAll")}</button>
                    )}
                    <button type="button" onClick={() => void loadSkillIdeas()} disabled={skillsLoading} className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">{t("skills.more")}</button>
                  </div>
                </div>
                {skillsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> {t("skills.loading")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {freshIdeas.map((s) => (
                      <button key={s} type="button" onClick={() => patch({ skills: [...draft.skills, s].slice(0, 30) })}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-100">
                        <Plus className="h-3.5 w-3.5" /> {s}
                      </button>
                    ))}
                    {!freshIdeas.length && <p className="text-sm text-gray-500">{t("skills.none")}</p>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvw-skills">{t("skills.yours")}</Label>
                <TagAutocomplete id="cvw-skills" type="skills" value={draft.skills} onChange={(skills) => patch({ skills })} max={30} placeholder={t("skills.placeholder")} />
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-semibold text-gray-900">{t("languages.title")}</p>
                <CvBuilderLanguages languages={draft.languages} onChange={(languages) => patch({ languages })} />
              </div>
            </>
          )}

          {key === "extras" && (
            <ExtrasStep certificates={draft.certificates} onCertificatesChange={(certificates) => patch({ certificates })}
              linkedin={draft.linkedin} portfolio={draft.portfolio} otherLinks={draft.otherLinks} onLinksChange={patch} />
          )}

          {key === "review" && (
            <>
              <ReviewStep draft={draft} identity={identity} summaryLoading={summaryLoading}
                onSummaryChange={(summary) => patch({ summary })} onRewriteSummary={() => void loadSummary()}
                onTemplateChange={(templateId) => patch({ templateId })} />
            </>
          )}
        </div>

        {saveError && key === "review" && (
          <p role="alert" className="border-t bg-red-50 px-5 sm:px-6 py-2 text-sm text-red-700">{saveError}</p>
        )}
        {key !== "quick" && (
          <div className="flex items-center justify-between gap-2 border-t px-5 sm:px-6 py-4">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setStepIndex((s) => s - 1)}>{t("back")}</Button>
            <div className="flex items-center gap-2">
              {optional && <Button type="button" variant="ghost" disabled={busy} onClick={() => setStepIndex((s) => s + 1)}>{t("skip")}</Button>}
              {key === "review" ? (
                <Button type="button" disabled={busy} onClick={() => void save()} className="min-h-11 gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("saveCv")}
                </Button>
              ) : (
                <Button type="button" disabled={!canNext || busy} onClick={() => { setAiError(""); setStepIndex((s) => s + 1); }} className="min-h-11">
                  {t("next")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
