"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession, signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp, Upload, Plus, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";

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
  const { data: session, status, update } = useSession();
  const router = useRouter();

  // ── Anonymous CV-first flow (shared-link visitors) ──────────────────────────
  const [anonCvFile, setAnonCvFile] = useState<File | null>(null);
  const [anonPhase, setAnonPhase] = useState<"idle" | "auth" | "extract">("idle");
  const [anonError, setAnonError] = useState("");
  const anonCvInputRef = useRef<HTMLInputElement>(null);

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
      <Button size="lg" disabled className="w-full rounded-2xl text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("loading")}
      </Button>
    );
  }

  // CV-first quick apply: pick a CV (kept in memory — Google auth is a popup, so
  // the page never unloads), sign in with Google, then the CV is extracted into
  // the fresh profile and onboarding is skipped. Reduces drop-off from shared links.
  async function handleAnonGoogleApply() {
    setAnonError("");
    setAnonPhase("auth");
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await result.user.getIdToken();
      const res = await signIn("firebase", { idToken, redirect: false });
      if (res?.error) {
        setAnonError(t("googleSignInFailed"));
        return;
      }

      const fresh = await getSession();
      const freshRole = (fresh?.user as { role?: string } | undefined)?.role;
      if (freshRole !== "job_seeker") {
        // Existing employer/agent account — surface the normal restriction.
        await update();
        return;
      }

      if (anonCvFile) {
        setAnonPhase("extract");
        try {
          const fd = new FormData();
          fd.append("cv", anonCvFile);
          await csrfFetch("/api/ai/cv-extract", { method: "POST", body: fd });
        } catch {
          // Extraction is best-effort — the user can still apply with a bare profile.
        }
        // Profile came from the CV — don't bounce this user through onboarding.
        await csrfFetch("/api/job-seekers/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingComplete: true }),
        }).catch(() => {});
      }

      // Refresh the JWT/session so the component re-renders into the apply form.
      await update();
    } catch {
      setAnonError(t("googleSignInFailed"));
    } finally {
      setAnonPhase("idle");
    }
  }

  if (!session) {
    return (
      <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/10 card-pad">
        <p className="text-sm font-semibold text-foreground">{t("quickApplyTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("quickApplyHint")}</p>

        <input
          ref={anonCvInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            setAnonCvFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button size="lg"
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl text-sm"
          onClick={() => anonCvInputRef.current?.click()}
          disabled={anonPhase !== "idle"}
        >
          {anonCvFile ? <FileText className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
          <span className="truncate">{anonCvFile ? anonCvFile.name : t("uploadYourCv")}</span>
        </Button>

        <Button size="lg"
          className="w-full rounded-2xl text-base font-medium gap-2"
          onClick={handleAnonGoogleApply}
          disabled={anonPhase !== "idle"}
        >
          {anonPhase !== "idle" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          {anonPhase === "extract" ? t("settingUpProfile") : t("continueWithGoogle")}
        </Button>

        {anonError && <p className="text-center text-xs text-destructive">{anonError}</p>}

        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() =>
            router.push(`/${locale}/login?callbackUrl=/${locale}/jobs/${jobId}`)
          }
        >
          {t("signInApply")}
        </button>
      </div>
    );
  }

  if (!isJobSeeker) {
    return (
      <Button size="lg" variant="outline" className="w-full rounded-2xl text-base" disabled>
        {t("jobSeekersOnly")}
      </Button>
    );
  }

  if (applied) {
    return (
      <div className="w-full rounded-3xl border border-green-500/30 bg-green-500/10 text-center card-pad">
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
        <div className="space-y-2 rounded-3xl border border-border/70 bg-muted/20 shadow-[0_12px_28px_rgba(15,23,42,0.04)] card-pad">
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
        <div className="space-y-2 rounded-3xl border border-border/70 bg-muted/10 card-pad">
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
        <div className="space-y-2 rounded-3xl border border-border/70 bg-muted/10 card-pad">
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

          <div className="field pt-1">
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
        <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/10 card-pad">
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
                  className="textarea-field min-h-[80px] w-full rounded-xl border border-border bg-background text-sm chip-pad"
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
                <DateTimePicker
                  mode="date"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e)}
                />
              )}

              {q.type === "select" && (
                <Select
                  value={(answers[q.id] as string) ?? ""}
                  onValueChange={(e) => setAnswer(q.id, e)}
                >
                  <SelectTrigger className="h-9 w-full rounded-xl">
                    <SelectValue placeholder={q.placeholder || "Select an option"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(q.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            className="textarea-field mt-2 min-h-[132px] rounded-3xl border-border/70 bg-background px-4 py-3 text-sm shadow-none"
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

      <Button size="lg"
        onClick={handleApply}
        disabled={loading}
        className="w-full rounded-2xl text-base font-medium gap-2"
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
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-600">
          {t("skillsUpdated", { count: answeredCount })}
        </p>
      </div>
    );
  }

  const remaining = skills.length - index;

  return (
    <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/20 shadow-[0_12px_28px_rgba(15,23,42,0.04)] card-pad">
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
          className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
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
