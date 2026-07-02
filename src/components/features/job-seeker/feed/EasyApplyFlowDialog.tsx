"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileDocument {
  id: string;
  name: string;
  category: string;
  url: string;
}

interface ScreeningQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";
  required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

type StepId = "cv" | "skills" | "questions" | "review";

interface EasyApplyFlowDialogProps {
  jobId: string;
  jobTitle: string;
  companyName?: string;
  /** Skills required by the job (fallback before skill-gaps loads). */
  skills?: string[];
  matchScore?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful application (or 409 already-applied). */
  onApplied: (jobId: string) => void;
}

const PROFILE_CV_KEY = "__profile_cv__";

export function EasyApplyFlowDialog({
  jobId,
  jobTitle,
  companyName,
  matchScore,
  open,
  onOpenChange,
  onApplied,
}: EasyApplyFlowDialogProps) {
  const t = useTranslations("jobFeed.applyFlow");
  const company = companyName?.trim() || t("theEmployer");

  // ── Loading / global ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── CV step ──────────────────────────────────────────────────────────────────
  const [resumeDocs, setResumeDocs] = useState<ProfileDocument[]>([]);
  const [hasProfileCv, setHasProfileCv] = useState(false);
  const [selectedCvKey, setSelectedCvKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Skills step ───────────────────────────────────────────────────────────────
  const [matchedSkills, setMatchedSkills] = useState<string[]>([]);
  const [unansweredSkills, setUnansweredSkills] = useState<string[]>([]);
  const [confirmedSkills, setConfirmedSkills] = useState<Set<string>>(new Set());

  // ── Questions step ──────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // ── Load everything when the dialog opens ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Reset state on each open so re-applying a different job starts fresh.
    setError("");
    setStepIndex(0);
    setSuccess(false);
    setSubmitting(false);
    setConfirmedSkills(new Set());
    setAnswers({});
    setLoading(true);

    Promise.all([
      // ponytail: Graceful degradation — fetch failures return null, allowing partial load.
      // If profile fetch fails, CVs/documents are unavailable but skills/questions can still load.
      // If skill-gaps fetch fails, skills step is skipped but CV/questions proceed.
      // If job data fetch fails, screening questions are unavailable but CV/skills can still load.
      fetch("/api/job-seeker/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/job-seeker/skill-gaps?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([meData, gapData, jobData]) => {
        if (cancelled) return;

        // CVs
        const js = meData?.jobSeeker;
        const docs: ProfileDocument[] = Array.isArray(js?.documents) ? js.documents : [];
        const resumes = docs.filter((d) => d.category === "resume");
        setResumeDocs(resumes);
        setHasProfileCv(!!js?.cvUrl);
        if (resumes.length > 0) setSelectedCvKey(resumes[resumes.length - 1].id);
        else if (js?.cvUrl) setSelectedCvKey(PROFILE_CV_KEY);
        else setSelectedCvKey("");

        // Skills
        setMatchedSkills(Array.isArray(gapData?.matchedSkills) ? gapData.matchedSkills : []);
        setUnansweredSkills(
          Array.isArray(gapData?.unansweredSkills) ? gapData.unansweredSkills : [],
        );

        // Screening questions
        const qs: ScreeningQuestion[] = Array.isArray(jobData?.job?.screeningQuestions)
          ? jobData.job.screeningQuestions
          : [];
        setQuestions([...qs].sort((a, b) => a.order - b.order));
      })
      .catch(() => {
        if (!cancelled) setError(t("errors.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, jobId, t]);

  // ── Derived step list ─────────────────────────────────────────────────────────
  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = ["cv"];
    if (unansweredSkills.length > 0 || matchedSkills.length > 0) list.push("skills");
    if (questions.length > 0) list.push("questions");
    list.push("review");
    return list;
  }, [unansweredSkills.length, matchedSkills.length, questions.length]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;
  const progress =
    steps.length > 1 ? Math.round((stepIndex / (steps.length - 1)) * 100) : 100;

  // ── CV upload ──────────────────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "resume");
      const res = await csrfFetch("/api/job-seeker/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.document) {
        setError(data?.error ?? t("errors.uploadFailed"));
        return;
      }
      const doc: ProfileDocument = {
        id: data.document.id,
        name: data.document.name,
        category: data.document.category,
        url: data.document.url,
      };
      setResumeDocs((prev) => [...prev, doc]);
      setSelectedCvKey(doc.id);
    } catch {
      setError(t("errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  // ── Skill confirm (fire-and-forget, additive, non-destructive) ─────────────────
  function toggleSkill(skill: string) {
    const next = new Set(confirmedSkills);
    const isConfirming = !next.has(skill);
    if (isConfirming) next.add(skill);
    else next.delete(skill);
    setConfirmedSkills(next);

    // Persist in the background — never block the apply flow.
    csrfFetch("/api/job-seeker/skill-confirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skill,
        status: isConfirming ? "confirmed" : "skipped",
        source: "apply_flow",
        jobId,
      }),
    }).catch(() => {
      /* best-effort */
    });
  }

  // ── Question helpers ───────────────────────────────────────────────────────────
  function setAnswer(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, opt: string) {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      return {
        ...prev,
        [id]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt],
      };
    });
  }

  function validateQuestions(): boolean {
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id];
      const empty = a == null || a === "" || (Array.isArray(a) && a.length === 0);
      if (empty) {
        setError(t("errors.requiredQuestion", { label: q.label }));
        return false;
      }
    }
    return true;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────────
  function goNext() {
    setError("");
    if (currentStep === "cv" && !selectedCvKey) {
      setError(t("errors.selectCv"));
      return;
    }
    if (currentStep === "questions" && !validateQuestions()) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    setError("");
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");
    if (!validateQuestions()) {
      // Jump back to the questions step so the user can fix it.
      const qIdx = steps.indexOf("questions");
      if (qIdx >= 0) setStepIndex(qIdx);
      return;
    }
    setSubmitting(true);
    try {
      const includeProfileCv = selectedCvKey === PROFILE_CV_KEY;
      const screeningAnswers =
        questions.length > 0
          ? questions.map((q) => ({
              questionId: q.id,
              questionLabel: q.label,
              answer: answers[q.id] ?? (q.type === "checkbox" ? [] : ""),
            }))
          : undefined;

      const res = await csrfFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          easyApply: true,
          documentIds: includeProfileCv || !selectedCvKey ? undefined : [selectedCvKey],
          includeProfileCv: includeProfileCv || undefined,
          screeningAnswers,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) {
        onApplied(jobId);
        setSuccess(true);
        return;
      }
      if (!res.ok) {
        setError(data?.error ?? t("errors.applyFailed"));
        return;
      }
      onApplied(jobId);
      setSuccess(true);
    } catch {
      setError(t("errors.applyFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCvName =
    selectedCvKey === PROFILE_CV_KEY
      ? t("profileCv")
      : resumeDocs.find((d) => d.id === selectedCvKey)?.name;

  const busy = submitting || uploading;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {/* ── Success state ── */}
        {success ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.2} />
              </span>
            </div>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {t("success.title")}
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-sm text-sm text-muted-foreground">
              {t("success.subtitle", { jobTitle, company })}
            </DialogDescription>

            {typeof matchScore === "number" && (
              <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                {t("success.matchBadge", { score: matchScore })}
              </div>
            )}

            <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl"
              >
                {t("success.done")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header + progress ── */}
            <DialogHeader className="space-y-3 px-6 pb-2 pt-6">
              <div>
                <DialogTitle className="text-base font-semibold">
                  {t("title", { company })}
                </DialogTitle>
                <DialogDescription className="line-clamp-1">{jobTitle}</DialogDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {progress}%
                </span>
              </div>
            </DialogHeader>

            {/* ── Body ── */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {currentStep === "cv" && (
                    <CvStep
                      resumeDocs={resumeDocs}
                      hasProfileCv={hasProfileCv}
                      selectedCvKey={selectedCvKey}
                      onSelect={setSelectedCvKey}
                      uploading={uploading}
                      onUploadClick={() => fileInputRef.current?.click()}
                      fileInputRef={fileInputRef}
                      onUpload={handleUpload}
                      t={t}
                    />
                  )}

                  {currentStep === "skills" && (
                    <SkillsStep
                      matchedSkills={matchedSkills}
                      unansweredSkills={unansweredSkills}
                      confirmedSkills={confirmedSkills}
                      onToggle={toggleSkill}
                      t={t}
                    />
                  )}

                  {currentStep === "questions" && (
                    <QuestionsStep
                      questions={questions}
                      answers={answers}
                      onSet={setAnswer}
                      onToggleCheckbox={toggleCheckbox}
                      t={t}
                    />
                  )}

                  {currentStep === "review" && (
                    <ReviewStep
                      jobTitle={jobTitle}
                      company={company}
                      matchScore={matchScore}
                      selectedCvName={selectedCvName}
                      confirmedSkills={confirmedSkills}
                      matchedSkills={matchedSkills}
                      questionCount={questions.length}
                      t={t}
                    />
                  )}
                </>
              )}

              {error && (
                <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

            {/* ── Footer nav ── */}
            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                disabled={busy || stepIndex === 0}
                onClick={goBack}
                className="rounded-xl"
              >
                {t("back")}
              </Button>

              {isLastStep ? (
                <Button
                  type="button"
                  disabled={busy || loading || !selectedCvKey}
                  onClick={handleSubmit}
                  className="gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {submitting ? t("submitting") : t("submit")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy || loading}
                  onClick={goNext}
                  className="gap-1.5 rounded-xl"
                >
                  {t("next")}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Step: CV ────────────────────────────────────────────────────────────────────

type Tx = ReturnType<typeof useTranslations>;

function CvStep({
  resumeDocs,
  hasProfileCv,
  selectedCvKey,
  onSelect,
  uploading,
  onUploadClick,
  fileInputRef,
  onUpload,
  t,
}: {
  resumeDocs: ProfileDocument[];
  hasProfileCv: boolean;
  selectedCvKey: string;
  onSelect: (key: string) => void;
  uploading: boolean;
  onUploadClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: Tx;
}) {
  const noCv = !hasProfileCv && resumeDocs.length === 0;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("cv.heading")}</h3>
        <p className="text-xs text-muted-foreground">{t("cv.subtitle")}</p>
      </div>

      <div className="space-y-2">
        {hasProfileCv && (
          <CvOption
            label={t("profileCv")}
            selected={selectedCvKey === PROFILE_CV_KEY}
            onSelect={() => onSelect(PROFILE_CV_KEY)}
          />
        )}
        {resumeDocs.map((d) => (
          <CvOption
            key={d.id}
            label={d.name}
            selected={selectedCvKey === d.id}
            onSelect={() => onSelect(d.id)}
          />
        ))}
        {noCv && <p className="text-xs text-muted-foreground/70">{t("cv.noCv")}</p>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={onUpload}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={onUploadClick}
        className="h-8 gap-1.5 rounded-xl text-xs"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {uploading ? t("cv.uploading") : t("cv.uploadCv")}
      </Button>
    </div>
  );
}

function CvOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/[0.06]"
          : "border-border/70 bg-muted/10 hover:bg-muted/20"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {label}
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-primary bg-primary text-white" : "border-border"
        }`}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

// ── Step: Skills ──────────────────────────────────────────────────────────────

function SkillsStep({
  matchedSkills,
  unansweredSkills,
  confirmedSkills,
  onToggle,
  t,
}: {
  matchedSkills: string[];
  unansweredSkills: string[];
  confirmedSkills: Set<string>;
  onToggle: (skill: string) => void;
  t: Tx;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("skills.heading")}</h3>
        <p className="text-xs text-muted-foreground">{t("skills.subtitle")}</p>
      </div>

      {unansweredSkills.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("skills.tapPrompt")}
          </p>
          <div className="flex flex-wrap gap-2">
            {unansweredSkills.map((skill) => {
              const on = confirmedSkills.has(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => onToggle(skill)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    on
                      ? "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "border-dashed border-border bg-secondary/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {on ? <Check className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" />}
                  {skill}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {matchedSkills.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("skills.alreadyHave")}
          </p>
          <div className="flex flex-wrap gap-2">
            {matchedSkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70">{t("skills.optionalNote")}</p>
    </div>
  );
}

// ── Step: Questions ───────────────────────────────────────────────────────────

function QuestionsStep({
  questions,
  answers,
  onSet,
  onToggleCheckbox,
  t,
}: {
  questions: ScreeningQuestion[];
  answers: Record<string, string | string[]>;
  onSet: (id: string, value: string | string[]) => void;
  onToggleCheckbox: (id: string, opt: string) => void;
  t: Tx;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("questions.heading")}</h3>
        <p className="text-xs text-muted-foreground">{t("questions.subtitle")}</p>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <Label className="text-sm font-medium text-foreground">
            {q.label}
            {q.required && <span className="ml-1 text-destructive">*</span>}
          </Label>

          {q.type === "text" && (
            <Input
              placeholder={q.placeholder || ""}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => onSet(q.id, e.target.value)}
              className="rounded-xl"
              maxLength={500}
            />
          )}

          {q.type === "textarea" && (
            <textarea
              className="textarea-field min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={q.placeholder || ""}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => onSet(q.id, e.target.value)}
              maxLength={2000}
              rows={3}
            />
          )}

          {q.type === "number" && (
            <Input
              type="number"
              placeholder={q.placeholder || ""}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => onSet(q.id, e.target.value)}
              className="rounded-xl"
            />
          )}

          {q.type === "date" && (
            <Input
              type="date"
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => onSet(q.id, e.target.value)}
              className="rounded-xl"
            />
          )}

          {q.type === "select" && (
            <select
              className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => onSet(q.id, e.target.value)}
            >
              <option value="">{q.placeholder || t("questions.selectOption")}</option>
              {(q.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {q.type === "radio" && (
            <div className="space-y-1.5">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`sq-${q.id}`}
                    value={opt}
                    checked={(answers[q.id] as string) === opt}
                    onChange={() => onSet(q.id, opt)}
                    className="accent-primary"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.type === "checkbox" && (
            <div className="space-y-1.5">
              {(q.options ?? []).length > 0 ? (
                (q.options ?? []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={((answers[q.id] as string[]) ?? []).includes(opt)}
                      onChange={() => onToggleCheckbox(q.id, opt)}
                      className="accent-primary"
                    />
                    {opt}
                  </label>
                ))
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!answers[q.id]}
                    onChange={(e) => onSet(q.id, e.target.checked ? "yes" : "")}
                    className="accent-primary"
                  />
                  {t("questions.yes")}
                </label>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step: Review ──────────────────────────────────────────────────────────────

function ReviewStep({
  jobTitle,
  company,
  matchScore,
  selectedCvName,
  confirmedSkills,
  matchedSkills,
  questionCount,
  t,
}: {
  jobTitle: string;
  company: string;
  matchScore?: number;
  selectedCvName?: string;
  confirmedSkills: Set<string>;
  matchedSkills: string[];
  questionCount: number;
  t: Tx;
}) {
  const totalSkills = confirmedSkills.size + matchedSkills.length;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("review.heading")}</h3>
        {typeof matchScore === "number" && (
          <p className="text-xs text-muted-foreground">
            {t("review.matchSummary", { score: matchScore })}
          </p>
        )}
      </div>

      <div className="space-y-2.5 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm">
        <ReviewRow label={t("review.position")} value={jobTitle} />
        <ReviewRow label={t("review.company")} value={company} />
        <ReviewRow label={t("review.cv")} value={selectedCvName ?? t("review.noCv")} />
        {totalSkills > 0 && (
          <ReviewRow label={t("review.skills")} value={t("review.skillsValue", { count: totalSkills })} />
        )}
        {questionCount > 0 && (
          <ReviewRow
            label={t("review.questions")}
            value={t("review.questionsValue", { count: questionCount })}
          />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        {t("review.dataNotice", { company })}
      </p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
