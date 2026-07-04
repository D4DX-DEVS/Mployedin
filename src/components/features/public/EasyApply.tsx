"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp, Upload, Plus, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EasyApplyScreeningQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";
  required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

interface EasyApplyProps {
  jobId: string;
  jobTitle: string;
  locale: string;
  screeningQuestions?: EasyApplyScreeningQuestion[];
}

interface ProfileDocument {
  id: string;
  name: string;
  category: string;
  url: string;
}

interface JobSeekerProfile {
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  documents?: ProfileDocument[];
  cvUrl?: string | null;
  socialLinks?: { label: string; url: string }[];
}

// Sentinel keys for the CV selector
const PROFILE_CV_KEY = "__profile_cv__";
const NO_CV_KEY = "__none__";

export default function EasyApply({ jobId, jobTitle, locale, screeningQuestions = [] }: EasyApplyProps) {
  const t = useTranslations("easyApply");
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<JobSeekerProfile | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [checkingApplied, setCheckingApplied] = useState(true);
  const [error, setError] = useState("");
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({});

  // C1 / C3 state
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [selectedCvKey, setSelectedCvKey] = useState<string>(NO_CV_KEY);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const role = (session?.user as { role?: string })?.role;
  const isJobSeeker = role === "job_seeker";

  const sortedQuestions = [...screeningQuestions].sort((a, b) => a.order - b.order);
  const hasQuestions = sortedQuestions.length > 0;

  // Check for an existing application on mount so the panel shows the
  // "already applied" state instead of the form (the POST endpoint 409s on
  // any existing application for this job, including withdrawn ones).
  useEffect(() => {
    if (status === "loading") return;
    if (!isJobSeeker) {
      setCheckingApplied(false);
      return;
    }
    let cancelled = false;
    setCheckingApplied(true);
    fetch(`/api/applications?jobId=${encodeURIComponent(jobId)}&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Withdrawn applications don't count — the server allows re-applying.
        const apps = Array.isArray(data?.applications) ? data.applications : [];
        if (!cancelled && apps.some((a: { status?: string }) => a.status !== "withdrawn")) {
          setApplied(true);
        }
      })
      .catch(() => {/* fail open — server still rejects duplicates with 409 */})
      .finally(() => {
        if (!cancelled) setCheckingApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, isJobSeeker, jobId]);

  // Load profile to auto-fill
  useEffect(() => {
    if (!isJobSeeker || profile) return;
    setFetchingProfile(true);
    fetch("/api/job-seeker/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.jobSeeker) {
          const js = data.jobSeeker;
          const docs: ProfileDocument[] = Array.isArray(js.documents) ? js.documents : [];
          setProfile({
            name: js.name ?? session?.user?.name ?? "",
            email: session?.user?.email ?? "",
            phone: js.phone ?? "",
            skills: js.skills ?? [],
            documents: docs,
            cvUrl: js.cvUrl ?? null,
            socialLinks: js.socialLinks ?? [],
          });
          setDocuments(docs);
          // Default-select a CV: parsed profile CV first, else a resume document
          const resumeDoc = docs.find((d) => d.category === "resume");
          if (js.cvUrl) setSelectedCvKey(PROFILE_CV_KEY);
          else if (resumeDoc) setSelectedCvKey(resumeDoc.id);
          else setSelectedCvKey(NO_CV_KEY);
          // Pre-fill portfolio from social links if present
          const portfolio = (js.socialLinks ?? []).find((l: { label: string; url: string }) =>
            /portfolio|website|behance|dribbble|github/i.test(l.label)
          );
          if (portfolio?.url) setPortfolioUrl(portfolio.url);
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setFetchingProfile(false));
  }, [isJobSeeker, profile, session?.user?.email, session?.user?.name]);

  if (status === "loading" || fetchingProfile || (isJobSeeker && checkingApplied && !applied)) {
    return (
      <Button disabled className="h-12 w-full rounded-2xl text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("loading")}
      </Button>
    );
  }

  if (!session) {
    return (
      <Button
        className="h-12 w-full rounded-2xl text-base font-medium"
        onClick={() =>
          router.push(`/${locale}/login?callbackUrl=/${locale}/jobs/${jobId}`)
        }
      >
        {t("signInApply")}
      </Button>
    );
  }

  if (!isJobSeeker) {
    return (
      <Button variant="outline" className="h-12 w-full rounded-2xl text-base" disabled>
        {t("jobSeekersOnly")}
      </Button>
    );
  }

  if (applied) {
    return (
      <div className="w-full rounded-[22px] border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
        <p className="text-sm font-semibold text-green-600">✓ {t("applicationSubmitted")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("sentProfile")}
        </p>
      </div>
    );
  }

  function setAnswer(questionId: string, value: string | string[] | boolean) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleCheckboxOption(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }

  function validateAnswers(): boolean {
    for (const q of sortedQuestions) {
      if (!q.required) continue;
      const val = answers[q.id];
      if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
        setError(t("answerRequired", { label: q.label }));
        return false;
      }
    }
    return true;
  }

  function toggleDocument(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function uploadDocument(file: File, category: "resume" | "other"): Promise<ProfileDocument | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    const res = await fetch("/api/job-seeker/documents", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.document) {
      setError(data?.error ?? "Upload failed. Please try again.");
      return null;
    }
    const doc: ProfileDocument = {
      id: data.document.id,
      name: data.document.name,
      category: data.document.category,
      url: data.document.url,
    };
    setDocuments((prev) => [...prev, doc]);
    return doc;
  }

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingCv(true);
    try {
      const doc = await uploadDocument(file, "resume");
      if (doc) setSelectedCvKey(doc.id);
    } finally {
      setUploadingCv(false);
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingDoc(true);
    try {
      const doc = await uploadDocument(file, "other");
      if (doc) setSelectedDocIds((prev) => [...prev, doc.id]);
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleApply() {
    setError("");

    if (hasQuestions && !validateAnswers()) return;

    setLoading(true);
    try {
      const screeningAnswerPayload = sortedQuestions.map((q) => ({
        questionId: q.id,
        questionLabel: q.label,
        answer: answers[q.id] ?? (q.type === "checkbox" ? [] : ""),
      }));

      // Collect document ids: any selected additional docs + a selected CV document
      const docIdSet = new Set(selectedDocIds);
      if (selectedCvKey !== PROFILE_CV_KEY && selectedCvKey !== NO_CV_KEY) {
        docIdSet.add(selectedCvKey);
      }
      const documentIds = Array.from(docIdSet);
      const includeProfileCv = selectedCvKey === PROFILE_CV_KEY;
      const trimmedPortfolio = portfolioUrl.trim();

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          easyApply: true,
          coverLetter: coverLetter.trim() || undefined,
          screeningAnswers: hasQuestions ? screeningAnswerPayload : undefined,
          documentIds: documentIds.length > 0 ? documentIds : undefined,
          includeProfileCv: includeProfileCv || undefined,
          portfolioUrl: trimmedPortfolio || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setApplied(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to apply. Please try again.");
        return;
      }
      setApplied(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // CV options: parsed profile CV + any resume-category documents
  const resumeDocs = documents.filter((d) => d.category === "resume");
  const otherDocs = documents.filter((d) => d.category !== "resume");
  const hasProfileCv = !!profile?.cvUrl;

  return (
    <div className="space-y-4">
      {profile && (
        <div className="space-y-2 rounded-[22px] border border-border/70 bg-muted/20 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("applyingAs")}
          </p>
          {profile.name && (
            <p className="text-sm font-semibold text-foreground">{profile.name}</p>
          )}
          {profile.email && (
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.skills.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                >
                  {s}
                </span>
              ))}
              {profile.skills.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{profile.skills.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* CV / Resume — choose saved or upload a modified version */}
      {profile && (
        <div className="space-y-2 rounded-[22px] border border-border/70 bg-muted/10 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("profileCv")}
          </p>
          <div className="space-y-1.5">
            {hasProfileCv && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="cv-choice"
                  checked={selectedCvKey === PROFILE_CV_KEY}
                  onChange={() => setSelectedCvKey(PROFILE_CV_KEY)}
                  className="accent-primary"
                />
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {t("profileCvLabel")}
              </label>
            )}
            {resumeDocs.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="cv-choice"
                  checked={selectedCvKey === d.id}
                  onChange={() => setSelectedCvKey(d.id)}
                  className="accent-primary"
                />
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
            {!hasProfileCv && resumeDocs.length === 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <FileText className="h-3 w-3" /> {t("noCvOnFile")}
              </p>
            )}
          </div>
          <input
            ref={cvInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={handleCvUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingCv}
            onClick={() => cvInputRef.current?.click()}
            className="h-8 gap-1.5 rounded-xl text-xs"
          >
            {uploadingCv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploadingCv ? t("uploading") : t("uploadDifferentCv")}
          </Button>
        </div>
      )}

      {/* Additional documents (certificates, portfolio files, etc.) */}
      {profile && (
        <div className="space-y-2 rounded-[22px] border border-border/70 bg-muted/10 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("additionalDocuments")}
          </p>
          {otherDocs.length > 0 ? (
            <div className="space-y-1.5">
              {otherDocs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    onChange={() => toggleDocument(d.id)}
                    className="accent-primary"
                  />
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70">
              {t("attachDocumentsOptional")}
            </p>
          )}
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleDocUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingDoc}
            onClick={() => docInputRef.current?.click()}
            className="h-8 gap-1.5 rounded-xl text-xs"
          >
            {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {uploadingDoc ? t("uploading") : t("addDocument")}
          </Button>

          <div className="space-y-1.5 pt-1">
            <Label htmlFor="portfolio-url" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              {t("portfolioLink")}
            </Label>
            <Input
              id="portfolio-url"
              type="url"
              inputMode="url"
              placeholder="https://your-portfolio.com"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className="rounded-xl"
              maxLength={500}
            />
          </div>
        </div>
      )}

      {/* Screening Questions */}
      {hasQuestions && (
        <div className="space-y-3 rounded-[22px] border border-border/70 bg-muted/10 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("screeningQuestions")}
          </p>
          {sortedQuestions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                {q.label}
                {q.required && <span className="ml-1 text-destructive">*</span>}
              </Label>

              {q.type === "text" && (
                <Input
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                  maxLength={500}
                />
              )}

              {q.type === "textarea" && (
                <textarea
                  className="textarea-field min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              )}

              {q.type === "number" && (
                <Input
                  type="number"
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                />
              )}

              {q.type === "date" && (
                <Input
                  type="date"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                />
              )}

              {q.type === "select" && (
                <select
                  className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                >
                  <option value="">{q.placeholder || "Select an option"}</option>
                  {(q.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
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
                        onChange={() => setAnswer(q.id, opt)}
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
                          onChange={() => toggleCheckboxOption(q.id, opt)}
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
                        onChange={(e) => setAnswer(q.id, e.target.checked)}
                        className="accent-primary"
                      />
                      Yes
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Skill confirmation — asked before applying, saved to the profile */}
      <EasyApplySkillConfirm jobId={jobId} />

      <div>
        <button
          type="button"
          onClick={() => setShowCoverLetter((v) => !v)}
          aria-label={showCoverLetter ? t("hideCoverLetter") : t("addCoverLetter")}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {showCoverLetter ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {showCoverLetter ? t("hide") : t("add")} {t("coverLetterOptional")}
        </button>
        {showCoverLetter && (
          <textarea
            className="textarea-field mt-2 min-h-[132px] rounded-[22px] border-border/70 bg-background px-4 py-3 text-sm shadow-none"
            rows={4}
            maxLength={2000}
            placeholder={`Why are you a great fit for ${jobTitle}?`}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
          />
        )}
        {showCoverLetter && (
          <p className="text-xs text-muted-foreground text-right mt-1">
            {coverLetter.length}/2000
          </p>
        )}
      </div>

      <Button
        onClick={handleApply}
        disabled={loading}
        className="h-12 w-full rounded-2xl text-base font-medium gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {loading ? t("submitting") : t("easyApply")}
      </Button>

      {error && (
        <p className="text-center text-xs text-destructive">{error}</p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {t("profileAutoAttached")}
      </p>
    </div>
  );
}

// ── Inline skill confirmation ─────────────────────────────────────────────────
// Asks the seeker to confirm the job's required skills before applying and saves
// the answers to their profile. EasyApply can render on public pages that have no
// react-query provider, so this uses plain fetch instead of the
// useSkillConfirmations hooks.
function EasyApplySkillConfirm({ jobId }: { jobId: string }) {
  const t = useTranslations("easyApply");
  const [skills, setSkills] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/job-seeker/skill-gaps?jobId=${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setSkills(Array.isArray(data?.unansweredSkills) ? data.unansweredSkills : []);
        }
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const currentSkill = skills?.[index];

  async function answer(status: "confirmed" | "denied" | "skipped") {
    if (!currentSkill || saving) return;
    setSaving(true);
    try {
      await fetch("/api/job-seeker/skill-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: currentSkill, status, source: "job_view", jobId }),
      });
    } catch {
      /* best-effort — answering skills must never block the application */
    } finally {
      setAnsweredCount((c) => c + 1);
      setIndex((i) => i + 1);
      setSaving(false);
    }
  }

  // Still loading or no skills to confirm.
  if (!skills || skills.length === 0) return null;

  // All questions answered.
  if (!currentSkill || index >= skills.length) {
    if (answeredCount === 0) return null;
    return (
      <div className="rounded-[22px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-600">
          {t("skillsUpdated", { count: answeredCount })}
        </p>
      </div>
    );
  }

  const remaining = skills.length - index;

  return (
    <div className="space-y-3 rounded-[22px] border border-border/70 bg-muted/20 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("confirmSkills")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("experienceQuestion", { skill: currentSkill })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => answer("confirmed")}
          disabled={saving}
          className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        >
          {t("yes")}
        </button>
        <button
          type="button"
          onClick={() => answer("denied")}
          disabled={saving}
          className="inline-flex items-center rounded-xl border border-border bg-secondary/80 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {t("no")}
        </button>
        <button
          type="button"
          onClick={() => answer("skipped")}
          disabled={saving}
          className="inline-flex items-center rounded-xl border border-border bg-secondary/80 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {t("skip")}
        </button>
      </div>
      {remaining > 1 && (
        <p className="text-[11px] text-muted-foreground/70">
          {t("moreSkillQuestions", { count: remaining - 1 })}
        </p>
      )}
    </div>
  );
}
