"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession, signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { csrfFetch } from "@/lib/security/csrf-client";
import { isInAppBrowser, inAppBrowserName } from "@/lib/browser/inAppBrowser";
import { getRecaptchaToken } from "@/lib/browser/recaptcha";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp, Upload, Plus, Link2, Check } from "lucide-react";
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

interface ExtractedProfileData {
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  skills?: Array<{ name: string; level?: string; yearsOfExperience?: number }>;
  experience?: unknown[];
  education?: unknown[];
  languages?: unknown[];
  certifications?: unknown[];
  projects?: unknown[];
  socialLinks?: unknown[];
}

interface CvExtractResponse {
  success: true;
  extracted: ExtractedProfileData;
  profileCompleteness: number;
  cvUrl: string | null;
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
  const [anonPhase, setAnonPhase] = useState<"idle" | "auth" | "extract" | "confirm">("idle");
  const [anonError, setAnonError] = useState("");
  const anonCvInputRef = useRef<HTMLInputElement>(null);

  // Email OTP flow for anonymous users
  const [anonAuthMethod, setAnonAuthMethod] = useState<"google" | "email" | null>(null);
  const [anonEmail, setAnonEmail] = useState("");
  const [anonOtpCode, setAnonOtpCode] = useState("");
  const [anonOtpSent, setAnonOtpSent] = useState(false);
  const [anonOtpResendCountdown, setAnonOtpResendCountdown] = useState(0);

  // Profile confirmation after extraction. Only the three editable fields and the
  // completeness figure are rendered, so the rest of the extracted payload is not
  // held in state — it is already persisted server-side by /api/ai/cv-extract.
  const [profileCompleteness, setProfileCompleteness] = useState<number | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [confirmHeadline, setConfirmHeadline] = useState("");

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

  // Copy the current job URL — offered when an in-app browser blocks Google sign-in
  // so the visitor can paste the link into a real browser.
  // NOTE: every hook must sit above the early returns below. React counts hooks per
  // render, and a hook declared after a conditional return crashes the component
  // ("Rendered more hooks than during the previous render") the moment the early
  // return stops firing — which took the whole apply card down behind the error boundary.
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = window.location.href;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, []);

  // OTP resend countdown
  useEffect(() => {
    if (anonOtpResendCountdown <= 0) return;
    const timer = setTimeout(() => {
      setAnonOtpResendCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [anonOtpResendCountdown]);

  if (status === "loading" || fetchingProfile || (isJobSeeker && checkingApplied && !applied)) {
    return (
      <Button size="lg" disabled className="w-full rounded-2xl text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("loading")}
      </Button>
    );
  }

  // Finish the anonymous sign-in and extract CV if present
  async function finishAnonSignIn() {
    try {
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
          const extractRes = await csrfFetch("/api/ai/cv-extract", { method: "POST", body: fd });
          if (!extractRes.ok) {
            // Extraction failed
            setExtractionFailed(true);
            // Still upload the CV as a document
            await uploadDocumentForAnon(anonCvFile);
            setAnonPhase("confirm");
            return;
          }
          const extractData: CvExtractResponse = await extractRes.json();
          if (extractData.success) {
            setProfileCompleteness(extractData.profileCompleteness);
            setConfirmName(extractData.extracted.fullName ?? "");
            setConfirmPhone(extractData.extracted.phone ?? "");
            setConfirmHeadline(extractData.extracted.headline ?? "");
            setAnonPhase("confirm");
          } else {
            setExtractionFailed(true);
            await uploadDocumentForAnon(anonCvFile);
            setAnonPhase("confirm");
          }
        } catch {
          // Extraction failed
          setExtractionFailed(true);
          await uploadDocumentForAnon(anonCvFile);
          setAnonPhase("confirm");
        }
      } else {
        // No CV file — go straight to applying
        await update();
      }
    } catch {
      setAnonError(t("errors.applyFailed"));
      setAnonPhase("idle");
    }
  }

  // Upload CV file as a document for anonymous users
  async function uploadDocumentForAnon(file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "resume");
      await fetch("/api/job-seeker/documents", { method: "POST", body: fd });
    } catch {
      // Best-effort — if it fails, continue anyway
    }
  }

  // Handle profile confirmation and profile PATCH
  async function handleAnonProfileConfirm() {
    setAnonError("");
    try {
      const patchBody: Record<string, unknown> = { onboardingComplete: true };
      if (confirmName && confirmName.trim().length > 0) {
        patchBody.name = confirmName.trim();
      }
      if (confirmPhone && confirmPhone.trim().length >= 7) {
        patchBody.phone = confirmPhone.trim();
      }
      if (confirmHeadline && confirmHeadline.trim().length > 0) {
        patchBody.headline = confirmHeadline.trim();
      }

      const res = await csrfFetch("/api/job-seekers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAnonError(data?.error ?? t("errors.applyFailed"));
        return;
      }

      // Drop the cached profile so the apply form re-reads it. Without this the
      // CV panel still shows the pre-sign-in snapshot and claims "No CV on file"
      // even though the parse (or the fallback upload) just stored one.
      setProfile(null);

      // Refresh the JWT/session so the component re-renders into the apply form.
      await update();
    } catch {
      setAnonError(t("errors.applyFailed"));
    } finally {
      setAnonPhase("idle");
    }
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
        if ((res as { code?: string }).code === "account_inactive") {
          setAnonError(t("accountInactive"));
          setAnonPhase("idle");
          return;
        }
        // Check if it's a popup block error
        if (res.error.includes("disallowed") || res.error.includes("popup")) {
          setAnonError(t("errors.popupBlocked"));
        } else {
          setAnonError(t("googleSignInFailed"));
        }
        setAnonPhase("idle");
        return;
      }

      await finishAnonSignIn();
    } catch (err) {
      // Check if it's a popup block error
      const errorMsg = String(err);
      if (errorMsg.includes("disallowed") || errorMsg.includes("popup") || errorMsg.includes("blocked")) {
        setAnonError(t("errors.popupBlocked"));
      } else {
        setAnonError(t("googleSignInFailed"));
      }
      setAnonPhase("idle");
    }
  }

  // Handle email OTP flow start
  async function handleAnonEmailOtpStart() {
    setAnonError("");
    if (!anonEmail || !anonEmail.includes("@")) {
      setAnonError(t("errors.invalidEmail"));
      return;
    }

    try {
      // Invisible reCAPTCHA v3. Resolves to null when no site key is configured,
      // in which case the server skips the check too.
      const captchaToken = await getRecaptchaToken("quick_apply");

      const res = await csrfFetch("/api/auth/apply-otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: anonEmail, ...(captchaToken ? { captchaToken } : {}) }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "INVALID_EMAIL") {
          setAnonError(t("errors.invalidEmail"));
        } else if (data?.error === "RATE_LIMITED") {
          setAnonError(t("errors.rateLimited"));
        } else if (data?.error === "EMAIL_FAILED") {
          setAnonError(t("errors.emailFailed"));
        } else if (data?.error === "CAPTCHA_FAILED" || data?.error === "CAPTCHA_REQUIRED") {
          setAnonError(t("errors.captchaFailed"));
        } else if (data?.error === "CAPTCHA_UNAVAILABLE") {
          setAnonError(t("errors.captchaUnavailable"));
        } else {
          setAnonError(t("errors.applyFailed"));
        }
        return;
      }

      setAnonOtpSent(true);
      setAnonOtpResendCountdown(30);
    } catch {
      setAnonError(t("errors.networkError"));
    }
  }

  // Handle email OTP submission
  async function handleAnonEmailOtpSubmit() {
    setAnonError("");
    if (!anonOtpCode || anonOtpCode.length !== 6) {
      setAnonError(t("errors.invalidCode"));
      return;
    }

    setAnonPhase("auth");
    try {
      const res = await signIn("email-otp", {
        email: anonEmail,
        otp: anonOtpCode,
        redirect: false,
      });

      if (res?.error) {
        if (res.error.includes("expired")) {
          setAnonError(t("errors.codeExpired"));
        } else {
          setAnonError(t("errors.codeInvalid"));
        }
        setAnonPhase("idle");
        return;
      }

      await finishAnonSignIn();
    } catch {
      setAnonError(t("errors.applyFailed"));
      setAnonPhase("idle");
    }
  }

  // Profile confirmation step.
  //
  // This must sit OUTSIDE the `!session` branch below. It is only ever reached
  // after a successful sign-in, so by the time it runs the session already
  // exists — nesting it under `!session` meant it could never render and the
  // visitor was dropped straight onto the apply form, never seeing what was
  // parsed from their CV nor the message explaining that parsing had failed.
  if (anonPhase === "confirm") {
    return (
        <div className="space-y-4 rounded-3xl border border-border/70 bg-muted/10 card-pad">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {extractionFailed
                ? t("errors.couldNotExtract")
                : t("foundYourDetails")}
            </p>
            {!extractionFailed && profileCompleteness && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("profileComplete", { percent: Math.round(profileCompleteness) })}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {anonOtpSent && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs text-blue-900">{t("emailConfirmMsg", { email: anonEmail })}</p>
              </div>
            )}

            <div className="field">
              <Label htmlFor="confirm-name" className="text-xs font-medium text-foreground">
                {t("name")}
              </Label>
              <Input
                id="confirm-name"
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={t("enterName")}
                className="rounded-xl"
                maxLength={200}
              />
            </div>

            <div className="field">
              <Label htmlFor="confirm-phone" className="text-xs font-medium text-foreground">
                {t("phone")}
              </Label>
              <Input
                id="confirm-phone"
                type="tel"
                value={confirmPhone}
                onChange={(e) => setConfirmPhone(e.target.value)}
                placeholder={t("enterPhone")}
                className="rounded-xl"
                maxLength={25}
              />
            </div>

            <div className="field">
              <Label htmlFor="confirm-headline" className="text-xs font-medium text-foreground">
                {t("headline")}
              </Label>
              <textarea
                id="confirm-headline"
                value={confirmHeadline}
                onChange={(e) => setConfirmHeadline(e.target.value)}
                placeholder={t("enterHeadline")}
                className="textarea-field min-h-[80px] w-full rounded-xl border border-border bg-background text-sm chip-pad"
                maxLength={500}
                rows={3}
              />
            </div>
          </div>

          {anonError && <p className="text-center text-xs text-destructive">{anonError}</p>}

          <Button
            size="lg"
            onClick={handleAnonProfileConfirm}
            disabled={anonPhase !== "confirm"}
            className="w-full rounded-2xl text-base font-medium gap-2"
          >
            {anonPhase !== "confirm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("looksGood")}
          </Button>
      </div>
    );
  }

  if (!session) {
    const inAppBrwsr = isInAppBrowser();
    const inAppName = inAppBrowserName();
    const showEmailFirst = inAppBrwsr && anonAuthMethod === null;

    // Email input form (before OTP is sent)
    if (anonAuthMethod === "email" && !anonOtpSent) {
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

          <Button
            size="lg"
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 rounded-xl text-sm"
            onClick={() => anonCvInputRef.current?.click()}
            disabled={anonPhase !== "idle"}
          >
            {anonCvFile ? <FileText className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
            <span className="truncate">{anonCvFile ? anonCvFile.name : t("uploadYourCv")}</span>
          </Button>

          <div className="field">
            <Label htmlFor="anon-email" className="text-xs font-medium text-foreground">
              {t("email")}
            </Label>
            <Input
              id="anon-email"
              type="email"
              value={anonEmail}
              onChange={(e) => setAnonEmail(e.target.value)}
              placeholder={t("enterEmail")}
              className="rounded-xl"
            />
          </div>

          <Button
            size="lg"
            onClick={handleAnonEmailOtpStart}
            disabled={anonPhase !== "idle" || !anonEmail}
            className="w-full rounded-2xl text-base font-medium gap-2"
          >
            {anonPhase !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("sendCode")}
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={handleAnonGoogleApply}
            disabled={anonPhase !== "idle"}
            className="w-full rounded-2xl text-base font-medium gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("continueWithGoogle")}
          </Button>

          {anonError && <p className="text-center text-xs text-destructive">{anonError}</p>}

          <button
            type="button"
            onClick={() => {
              setAnonAuthMethod(null);
              setAnonEmail("");
            }}
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("signInApply")}
          </button>
        </div>
      );
    }

    // Email OTP code entry
    if (anonOtpSent && anonAuthMethod === "email") {
      return (
        <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/10 card-pad">
          <p className="text-sm font-semibold text-foreground">{t("enterCode")}</p>
          <p className="text-xs text-muted-foreground">
            {t("codeSentTo", { email: anonEmail })}
          </p>

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

          <Button
            size="lg"
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 rounded-xl text-sm"
            onClick={() => anonCvInputRef.current?.click()}
            disabled={anonPhase !== "idle" || anonOtpResendCountdown > 0}
          >
            {anonCvFile ? <FileText className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
            <span className="truncate">{anonCvFile ? anonCvFile.name : t("uploadYourCv")}</span>
          </Button>

          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={anonOtpCode}
            onChange={(e) => setAnonOtpCode(e.target.value.replace(/\D/g, ""))}
            className="rounded-xl text-center tracking-widest text-lg"
            autoComplete="one-time-code"
          />

          <Button
            size="lg"
            onClick={handleAnonEmailOtpSubmit}
            disabled={anonPhase !== "idle" || anonOtpCode.length !== 6}
            className="w-full rounded-2xl text-base font-medium gap-2"
          >
            {anonPhase !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("verify")}
          </Button>

          {anonError && <p className="text-center text-xs text-destructive">{anonError}</p>}

          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setAnonAuthMethod(null);
                setAnonOtpSent(false);
                setAnonEmail("");
                setAnonOtpCode("");
              }}
              className="flex-1 text-center text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("useDifferentEmail")}
            </button>
            <button
              type="button"
              onClick={handleAnonEmailOtpStart}
              disabled={anonOtpResendCountdown > 0}
              className="flex-1 text-center text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              {anonOtpResendCountdown > 0 ? t("resendIn", { seconds: anonOtpResendCountdown }) : t("resend")}
            </button>
          </div>

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

    // Main anonymous card - initial state
    return (
      <div className="space-y-3 rounded-3xl border border-border/70 bg-muted/10 card-pad">
        <p className="text-sm font-semibold text-foreground">{t("quickApplyTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("quickApplyHint")}</p>

        {inAppBrwsr && (
          <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900">
            {t("inAppBrowserHint", { app: inAppName || "this app" })}
          </p>
        )}

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
        <Button
          size="lg"
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl text-sm"
          onClick={() => anonCvInputRef.current?.click()}
          disabled={anonPhase !== "idle"}
        >
          {anonCvFile ? <FileText className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4" />}
          <span className="truncate">{anonCvFile ? anonCvFile.name : t("uploadYourCv")}</span>
        </Button>

        {showEmailFirst ? (
          <>
            <div className="field">
              <Label htmlFor="anon-email" className="text-xs font-medium text-foreground">
                {t("email")}
              </Label>
              <Input
                id="anon-email"
                type="email"
                value={anonEmail}
                onChange={(e) => setAnonEmail(e.target.value)}
                placeholder={t("enterEmail")}
                className="rounded-xl"
                disabled={anonOtpSent}
              />
            </div>

            <Button
              size="lg"
              onClick={handleAnonEmailOtpStart}
              disabled={anonPhase !== "idle" || !anonEmail}
              className="w-full rounded-2xl text-base font-medium gap-2"
            >
              {anonPhase !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("sendCode")}
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={handleAnonGoogleApply}
              disabled={anonPhase !== "idle"}
              className="w-full rounded-2xl text-base font-medium gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {t("continueWithGoogle")}
            </Button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline flex items-center justify-center gap-1"
            >
              <Link2 className="h-3 w-3" />
              {t("copyLink")}
            </button>
          </>
        ) : (
          <>
            <Button
              size="lg"
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

            <Button
              size="lg"
              variant="outline"
              onClick={() => setAnonAuthMethod("email")}
              disabled={anonPhase !== "idle"}
              className="w-full rounded-2xl text-base font-medium gap-2"
            >
              {t("continueWithEmail")}
            </Button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline flex items-center justify-center gap-1"
            >
              <Link2 className="h-3 w-3" />
              {t("copyLink")}
            </button>
          </>
        )}

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
      <div className="space-y-3 w-full rounded-3xl border border-green-500/30 bg-green-500/10 card-pad">
        <div className="text-center">
          <p className="text-sm font-semibold text-green-600">✓ {t("applicationSubmitted")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("sentProfile")}
          </p>
          {profileCompleteness !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("profileComplete", { percent: Math.round(profileCompleteness) })}
            </p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <Link
            href={`/${locale}/onboarding`}
            className="block w-full text-center px-4 py-2.5 rounded-2xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            {t("completeProfile")}
          </Link>
          <Link
            href={`/${locale}/jobs`}
            className="block w-full text-center px-4 py-2.5 rounded-2xl border border-border bg-secondary/80 text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            {t("browseMoreJobs")}
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t("profileCompletionOptional")}
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
        // Map plan-quota errors to friendly messages like in EasyApplyFlowDialog
        if (data?.error === "LIMIT_EXCEEDED" || data?.error === "SUBSCRIPTION_REQUIRED") {
          setError(t("errors.planLimitReached"));
        } else {
          setError(data?.error ?? t("errors.applyFailed"));
        }
        return;
      }
      setApplied(true);
    } catch {
      setError(t("errors.networkError"));
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
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                >
                  {s}
                </span>
              ))}
              {profile.skills.length > 4 && (
                <span className="text-[11px] text-muted-foreground">
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
