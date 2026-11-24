"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSignupConsentPrompt } from "@/components/features/auth/SignupConsentDialog";
import { CONSENT_REQUIRED_CODE, signupConsentCredentials } from "@/lib/auth/signupConsent";
import { useSession, signIn, getSession } from "next-auth/react";
import Link from "next/link";
import { getGoogleIdToken, preloadGoogleSignIn } from "@/lib/firebase/googleSignIn";
import { GooglePopupBlockedError } from "@/lib/firebase/googlePopupBlocked";
import { GoogleWindowNotice, GOOGLE_WINDOW_NOTICE_ID } from "@/components/features/auth/GoogleWindowNotice";
import { navigateWithPageLoad } from "@/lib/browser/navigateWithPageLoad";
import { tabStorage } from "@/lib/consent/tabStorage";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  BUILT_CV_KEY,
  CV_UPLOAD_ACCEPT,
  PROFILE_CV_KEY,
  defaultCvKey,
  isAcceptedCvFile,
  uploadedResumes,
} from "@/lib/applications/cvChoice";
import { useCvPdfLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels";
import { isInAppBrowser, inAppBrowserName } from "@/lib/browser/inAppBrowser";
import { getCaptchaToken } from "@/lib/browser/captcha";
import { CaptchaNotice } from "@/components/shared/CaptchaNotice";
import { CvOwnerCheckDialog } from "@/components/shared/CvOwnerCheckDialog";
import type { CvOwnerMismatch } from "@/lib/cv/cvOwnerCheck";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp, Upload, Plus, Link2, Check, Mail, Sparkles, ChevronRight, UserRound, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { applyErrorKey } from "@/lib/applications/applyErrors";
import { useJobShareReferral } from "@/lib/referrals/useJobShareReferral";
import { clearPendingReferral } from "@/lib/referrals/pendingReferral";
import type { SeekerAreaValue } from "@/components/features/job-seeker/SeekerAreaField";
import { areaFromProfileLocation } from "@/components/features/job-seeker/SeekerAreaPrompt";
import dynamic from "next/dynamic";
import type { CvReadSummary, CvReviewValues } from "./CvReviewDialog";
import { cvDesignFor, cvEditsBody } from "./cvReviewEdits";
import type { SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";

// The review window carries the CV templates: loaded only once a CV was read.
const CvReviewDialog = dynamic(() => import("./CvReviewDialog"), { ssr: false });
import { ApplyLoginNextTime } from "@/components/features/public/ApplyLoginNextTime";

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
  /** Set on the stored copy of the CV built on Mployedin. */
  builtHash?: string;
}

interface JobSeekerProfile {
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  documents?: ProfileDocument[];
  cvUrl?: string | null;
  /** The profile CV's file name, when its upload was recorded. */
  cvFileName?: string | null;
  /** The seeker saved a CV in the builder, so it can be sent from here. */
  hasBuiltCv?: boolean;
  socialLinks?: { label: string; url: string }[];
}

interface ExtractedProfileData {
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  currentLocation?: string;
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

const HEADLINE_MAX = 120;

/**
 * A one-line headline for the confirm step: the account's own headline when it
 * has one (an existing account must not lose it), else an AI suggestion from
 * the CV's latest job and skills. Never the CV summary paragraph.
 */
async function shortHeadline(cv: ExtractedProfileData): Promise<string> {
  try {
    const res = await fetch("/api/job-seeker/profile");
    const own = res.ok ? ((await res.json()) as { headline?: string }).headline?.trim() : "";
    if (own && own.length <= HEADLINE_MAX) return own;
  } catch { /* fall through to a suggestion */ }
  const jobTitle = ((cv.experience?.[0] ?? {}) as { jobTitle?: string }).jobTitle?.slice(0, 120) ?? "";
  // The reader usually returns {name}, sometimes a bare string.
  const skills = (cv.skills ?? [])
    .map((s: unknown) => (typeof s === "string" ? s : (s as { name?: string } | null)?.name ?? "").slice(0, 60))
    .filter(Boolean)
    .slice(0, 15);
  if (!jobTitle && !skills.length) return "";
  try {
    const res = await csrfFetch("/api/ai/headline-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle, skills }),
    });
    const data = res.ok ? ((await res.json()) as { headlines?: string[] }) : null;
    const first = data?.headlines?.[0]?.trim();
    if (first) return first.slice(0, HEADLINE_MAX);
  } catch { /* the seeker can type one */ }
  return "";
}

/** What the CV reader found, in the few figures the confirm step lists. */
function summarizeCvRead(cv: ExtractedProfileData): CvReadSummary {
  const skills = (cv.skills ?? [])
    .map((s: unknown) => (typeof s === "string" ? s : (s as { name?: string } | null)?.name ?? "").trim())
    .filter(Boolean);
  const roles = (cv.experience ?? [])
    .map((e) => {
      const job = (e ?? {}) as { jobTitle?: string; company?: string };
      const title = job.jobTitle?.trim() ?? "";
      const company = job.company?.trim() ?? "";
      return title && company ? `${title} · ${company}` : title || company;
    })
    .filter(Boolean);
  return {
    skills,
    roles,
    educationCount: cv.education?.length ?? 0,
    languageCount: cv.languages?.length ?? 0,
    certificationCount: cv.certifications?.length ?? 0,
    projectCount: cv.projects?.length ?? 0,
  };
}

/** The latest one or two job titles on the CV, as the roles to look for. */
function rolesFromCv(cv: ExtractedProfileData): string[] {
  const titles = (cv.experience ?? [])
    .map((e) => ((e ?? {}) as { jobTitle?: string }).jobTitle?.trim() ?? "")
    .filter((title) => title && title.length <= 100);
  return [...new Set(titles)].slice(0, 2);
}

/** Currency a salary is usually stated in, by the country the seeker lives in. */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: "INR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", OM: "OMR", BH: "BHD", GB: "GBP",
  DE: "EUR", FR: "EUR", IE: "EUR", NL: "EUR", ES: "EUR", IT: "EUR",
};

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function listOf(text: string, max: number): string[] {
  return [...new Set(text.split(",").map((v) => v.trim()).filter((v) => v && v.length <= 100))].slice(0, max);
}

/** The Job Preferences save from the review window; null when there is nothing to save. */
function preferencesBody(v: { roles: string; countries: string; salary: string; currency: string; noticeDays: string }): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  const roles = listOf(v.roles, 5);
  const countries = listOf(v.countries, 5);
  const salary = Number(v.salary);
  if (roles.length) body.preferredRoles = roles;
  if (countries.length) body.preferredCountries = countries;
  if (Number.isFinite(salary) && salary > 0) body.preferredSalary = { min: Math.round(salary), currency: v.currency };
  if (v.noticeDays !== "") body.noticePeriod = Number(v.noticeDays);
  return Object.keys(body).length ? body : null;
}

// Sentinel keys for the CV selector
const NO_CV_KEY = "__none__";
/**
 * Set (to the job id) when a visitor picks "Apply without CV". Session storage,
 * because a Google sign-in reloads the page. Once signed in, a seeker with no
 * CV who has not given their details yet is taken to onboarding, which brings
 * them back here; the Mployedin CV made from those details is then sent.
 */
const AUTO_CV_FLAG = "mployedin:apply-auto-cv";

/**
 * Set (`job id|document id|time`) when someone who already has an account picks
 * a CV on the signed-out card and signs in. That CV is kept as one of their
 * documents and preselected on the apply form; it is never read into the
 * profile, which would replace their name, experience and skills with the
 * file's. An empty document id means the upload failed. Session storage,
 * because a Google sign-in reloads the page.
 */
const RETURNING_CV_FLAG = "mployedin:apply-returning-cv";
const RETURNING_CV_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Whether the account that just signed in existed before this sign-in. Only an
 * account this sign-in created has the picked CV read into its profile.
 *
 * The provider says so (`isNewAccount`, set by the Google and e-mail-code
 * sign-ins), and that answer is final: an existing account with an empty
 * profile is still existing. Only a session without the flag (a token minted
 * before it existed) falls back to what the profile holds.
 */
async function accountAlreadyInUse(fresh: { user?: unknown } | null): Promise<boolean> {
  const user = fresh?.user as { isNewAccount?: boolean; isOnboarded?: boolean } | undefined;
  if (typeof user?.isNewAccount === "boolean") return !user.isNewAccount;
  if (user?.isOnboarded === true) return true;
  try {
    const res = await fetch("/api/job-seeker/me");
    if (!res.ok) return false;
    const js = (await res.json())?.jobSeeker as
      | { cvUrl?: string | null; hasBuiltCv?: boolean; documents?: ProfileDocument[] }
      | null
      | undefined;
    if (!js) return false;
    return Boolean(js.cvUrl) || js.hasBuiltCv === true || uploadedResumes(js.documents ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * The consent dialog sits outside the flow below, which returns a different
 * card for every step: a new account from Google or an e-mail code is only
 * made once the Terms & Privacy box is ticked (lib/auth/signupConsent.ts).
 */
export default function EasyApply(props: EasyApplyProps) {
  const { ask, dialog } = useSignupConsentPrompt(props.locale);
  return (
    <>
      {dialog}
      <EasyApplyFlow {...props} askSignupConsent={ask} />
    </>
  );
}

function EasyApplyFlow({
  jobId,
  jobTitle,
  locale,
  screeningQuestions = [],
  askSignupConsent,
}: EasyApplyProps & { askSignupConsent: () => Promise<boolean> }) {
  const t = useTranslations("easyApply");
  const { data: session, status, update } = useSession();
  const cvPdfLabels = useCvPdfLabels();
  // A job an agent shared carries ?ref=: applying here as a new seeker
  // credits that agent, like a /register?ref= sign-up.
  const referralCredentials = useJobShareReferral();

  // ── Anonymous CV-first flow (shared-link visitors) ──────────────────────────
  const [anonCvFile, setAnonCvFile] = useState<File | null>(null);
  const [anonPhase, setAnonPhase] = useState<"idle" | "auth" | "extract" | "confirm">("idle");
  const [anonError, setAnonError] = useState("");
  // The browser blocked the Google window (Safari, slow connection): said inline
  // under the button until the next click.
  const [googleWindowBlocked, setGoogleWindowBlocked] = useState(false);
  const anonCvInputRef = useRef<HTMLInputElement>(null);
  // Signed in through Google in this page. Firebase's popup resolver leaves a hidden
  // Google iframe and window.gapi in the document, so these visitors leave through a
  // page load once nothing needs to stay in memory (see leaveForSignedInPage).
  const signedInWithGoogle = useRef(false);
  // The page load has been started: the confirm step shows it, instead of going idle.
  const [leavingPage, setLeavingPage] = useState(false);

  // Email OTP flow for anonymous users
  const [anonAuthMethod, setAnonAuthMethod] = useState<"google" | "email" | null>(null);
  const [anonEmail, setAnonEmail] = useState("");
  const [anonName, setAnonName] = useState("");
  const [anonOtpCode, setAnonOtpCode] = useState("");
  const [anonOtpSent, setAnonOtpSent] = useState(false);
  const [anonOtpResendCountdown, setAnonOtpResendCountdown] = useState(0);
  // Google / e-mail sign-in opens in a dialog on the first Apply click.
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  // The Terms prompt replaces the sign-in dialog while it is up instead of
  // stacking on top of it; the sign-in dialog comes back if it is cancelled.
  const [consentAsking, setConsentAsking] = useState(false);
  const askConsentInPlace = async () => {
    setConsentAsking(true);
    try {
      return await askSignupConsent();
    } finally {
      setConsentAsking(false);
    }
  };
  const [dialogStep, setDialogStep] = useState<"cv" | "auth">("auth");

  // Profile confirmation after extraction. Only the three editable fields and the
  // completeness figure are rendered, so the rest of the extracted payload is not
  // held in state — it is already persisted server-side by /api/ai/cv-extract.
  const [profileCompleteness, setProfileCompleteness] = useState<number | null>(null);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [confirmHeadline, setConfirmHeadline] = useState("");
  // What the CV gave the new profile, shown on the confirm step so the seeker
  // sees how much was read, not only the three fields they can edit.
  const [cvReadSummary, setCvReadSummary] = useState<CvReadSummary | null>(null);
  // Where they live, asked here with the rest so the seeker app does not ask
  // again on the next page ("Where are you based?"). Pre-picked from the CV.
  // The jobs they want next, pre-filled from the latest job on the CV and
  // saved as their Job Preferences roles (what Home recommends from).
  const [confirmRoles, setConfirmRoles] = useState("");
  const [confirmArea, setConfirmArea] = useState<SeekerAreaValue>({ countryCode: "", city: null, region: null });
  // Preferences the CV implies (countries) and what no CV says (salary, notice).
  const [confirmCountries, setConfirmCountries] = useState("");
  const [confirmSalary, setConfirmSalary] = useState("");
  const [confirmCurrency, setConfirmCurrency] = useState("USD");
  const [confirmNotice, setConfirmNotice] = useState("");
  const [confirmDiscoverable, setConfirmDiscoverable] = useState(false);
  // The profile as stored after the read: what the CV preview is made from.
  const [reviewProfile, setReviewProfile] = useState<SeekerProfileData | null>(null);
  // The same, with the seeker's edits from the window's "Edit details" view.
  const [reviewDraft, setReviewDraft] = useState<SeekerProfileData | null>(null);
  const [cvReading, setCvReading] = useState(false);
  // The CV names someone else: the read waits for "It's my CV" or another file.
  const [cvOwnerCheck, setCvOwnerCheck] = useState<{ mismatch: CvOwnerMismatch; file: File } | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const reviewValues: CvReviewValues = {
    name: confirmName, phone: confirmPhone, headline: confirmHeadline, roles: confirmRoles,
    countries: confirmCountries, area: confirmArea, salary: confirmSalary, currency: confirmCurrency, noticeDays: confirmNotice,
    discoverable: confirmDiscoverable,
  };
  // Fields the seeker has changed in the window: the CV read leaves those alone.
  // (Not "non-empty": the name starts as the Google account's, which the CV's replaces.)
  const touchedReview = useRef(new Set<keyof CvReviewValues>());
  // The design of the Mployedin CV, chosen in the window and saved with it.
  const [reviewTemplate, setReviewTemplate] = useState("classic");
  const changeReview = (next: Partial<CvReviewValues>) => {
    for (const key of Object.keys(next) as (keyof CvReviewValues)[]) touchedReview.current.add(key);
    if (next.name !== undefined) setConfirmName(next.name);
    if (next.phone !== undefined) setConfirmPhone(next.phone);
    if (next.headline !== undefined) setConfirmHeadline(next.headline);
    if (next.roles !== undefined) setConfirmRoles(next.roles);
    if (next.countries !== undefined) setConfirmCountries(next.countries);
    if (next.area !== undefined) setConfirmArea(next.area);
    if (next.salary !== undefined) setConfirmSalary(next.salary);
    if (next.currency !== undefined) setConfirmCurrency(next.currency);
    if (next.noticeDays !== undefined) setConfirmNotice(next.noticeDays);
    if (next.discoverable !== undefined) setConfirmDiscoverable(next.discoverable);
  };

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
  // Easy Apply pressed with no CV: every application carries one, so the CV
  // field is marked and brought into view instead of sending it.
  const [cvMissing, setCvMissing] = useState(false);
  // An existing account signed in from the card with a CV (RETURNING_CV_FLAG).
  // "lost": the upload of that CV failed, so they pick or upload one again.
  const [welcomeBack, setWelcomeBack] = useState<"kept" | "lost" | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const cvCardRef = useRef<HTMLDivElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);

  const role = (session?.user as { role?: string })?.role;
  const isJobSeeker = role === "job_seeker";
  // Onboarding done: the profile holds enough to make a Mployedin CV from.
  const isOnboarded = (session?.user as { isOnboarded?: boolean } | undefined)?.isOnboarded === true;
  // Read by the profile load, which is not re-run when the session changes.
  const isOnboardedRef = useRef(isOnboarded);
  isOnboardedRef.current = isOnboarded;

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
            cvFileName: js.cvFileName ?? null,
            hasBuiltCv: js.hasBuiltCv === true,
            socialLinks: js.socialLinks ?? [],
          });
          setDocuments(docs);
          // An existing account that just signed in with a CV picked on this
          // card: that CV goes with this application. Read once, then cleared.
          const [flagJob, flagDoc, flagAt] = (tabStorage.get(RETURNING_CV_FLAG) ?? "").split("|");
          const returning = flagJob === jobId && Date.now() - Number(flagAt || 0) < RETURNING_CV_MAX_AGE_MS;
          if (flagJob) tabStorage.set(RETURNING_CV_FLAG, "");
          const returningDoc =
            returning && (docs.some((d) => d.id === flagDoc) || (flagDoc === PROFILE_CV_KEY && !!js.cvUrl)) ? flagDoc : null;
          if (returning) setWelcomeBack(returningDoc ? "kept" : "lost");
          // The same CV is preselected on every apply screen (cvChoice.ts).
          setSelectedCvKey(
            returningDoc
              || defaultCvKey({ documents: docs, hasProfileCv: !!js.cvUrl, hasBuiltCv: js.hasBuiltCv === true, preferredId: js.preferredCvId })
              // No CV of their own: the Mployedin CV made from their details (offerAutoCv).
              || (isOnboardedRef.current ? BUILT_CV_KEY : NO_CV_KEY),
          );
          // Pre-fill portfolio from social links if present
          const portfolio = (js.socialLinks ?? []).find((l: { label: string; url: string }) =>
            /portfolio|website|behance|dribbble|github/i.test(l.label)
          );
          if (portfolio?.url) setPortfolioUrl(portfolio.url);
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setFetchingProfile(false));
  }, [isJobSeeker, profile, session?.user?.email, session?.user?.name, jobId]);

  // Signed in, CV already read, but the review window was never saved (the
  // page was reloaded or left mid-way): open it again. Otherwise the half-made
  // account sat on the apply form, and its CV link led to onboarding.
  // Not for an existing account back from the card: its profile is its own.
  const resumedReview = useRef(false);
  useEffect(() => {
    if (resumedReview.current || welcomeBack || !isJobSeeker || isOnboarded || !profile?.cvUrl || anonPhase !== "idle") return;
    resumedReview.current = true;
    void resumeReview();
  }, [isJobSeeker, isOnboarded, profile?.cvUrl, anonPhase, welcomeBack]);

  // A seeker with no CV of their own still applies with one: the Mployedin CV,
  // made from the details they gave in onboarding (rendered on submit).
  const ownCvCount = (profile?.cvUrl ? 1 : 0) + (profile?.hasBuiltCv ? 1 : 0) + uploadedResumes(documents).length;
  const offerAutoCv = !!profile && ownCvCount === 0 && isOnboarded;
  useEffect(() => {
    if (offerAutoCv) setSelectedCvKey((key) => (key === NO_CV_KEY ? BUILT_CV_KEY : key));
  }, [offerAutoCv]);

  // Onboarding, then back to this job. A full page load, so the server sees
  // the session as it is now.
  // `buildCv`: they chose "Apply without CV", so onboarding opens the AI CV
  // builder straight away instead of leaving them to find it.
  const goToOnboarding = useCallback((buildCv = false) => {
    const back = window.location.pathname + window.location.search;
    navigateWithPageLoad(`/${locale}/onboarding?callbackUrl=${encodeURIComponent(back)}${buildCv ? "&cv=build" : ""}`);
  }, [locale]);

  // Signed in through "Apply without CV": with no CV and no details yet, go
  // straight to the questions that make one. Read once, then cleared, so
  // "Complete later" lands back on this form instead of looping.
  useEffect(() => {
    if (!profile) return;
    // Blocked storage reads as unflagged: the form offers the same step.
    // Only a fresh flag counts: one left by an earlier "Apply without CV" that
    // was abandoned must not send a later, ordinary sign-in off to onboarding.
    // Wait for the session too, so "onboarded" is known, not just not-loaded-yet.
    if (status !== "authenticated") return;
    const [flagJob, flagAt] = (tabStorage.get(AUTO_CV_FLAG) ?? "").split("|");
    const flagged = flagJob === jobId && Date.now() - Number(flagAt || 0) < 30 * 60 * 1000;
    tabStorage.set(AUTO_CV_FLAG, "");
    if (flagged && !isOnboarded && ownCvCount === 0) goToOnboarding(true);
  }, [profile, status, isOnboarded, ownCvCount, jobId, goToOnboarding]);

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

  // Scroll confirmation message into view when application is submitted
  useEffect(() => {
    if (applied && confirmationRef.current) {
      confirmationRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      confirmationRef.current.focus();
    }
  }, [applied]);

  if (status === "loading" || fetchingProfile || (isJobSeeker && checkingApplied && !applied)) {
    return (
      <Button size="lg" disabled className="w-full rounded-2xl text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("loading")}
      </Button>
    );
  }

  // Loads this job page again, now signed in. A full load (not a state update) is
  // what drops the hidden Google iframe and window.gapi that Firebase's popup
  // resolver added; the session cookie is already set, so the page comes back
  // showing the signed-in apply form, the same thing update() re-renders into.
  function leaveForSignedInPage() {
    setLeavingPage(true);
    navigateWithPageLoad(window.location.pathname + window.location.search);
  }

  // Finish the anonymous sign-in and extract CV if present
  async function finishAnonSignIn() {
    // Signed in (Google with a CV in hand, or the e-mail code): the referral code was sent with it.
    clearPendingReferral();
    try {
      const fresh = await getSession();
      const freshRole = (fresh?.user as { role?: string } | undefined)?.role;
      if (freshRole !== "job_seeker") {
        // Existing employer/agent account — surface the normal restriction.
        if (signedInWithGoogle.current) {
          leaveForSignedInPage();
          return;
        }
        await update();
        return;
      }

      if (anonCvFile && (await accountAlreadyInUse(fresh))) {
        await keepCvForThisApplication(anonCvFile);
        return;
      }

      if (anonCvFile) {
        // The review window opens now; the CV is read meanwhile (about half a
        // minute), so the seeker answers what a CV never says instead of waiting.
        setConfirmName((v) => v || fresh?.user?.name || "");
        setCvReading(true);
        setAnonPhase("confirm");
        void readCvInBackground(anonCvFile);
      } else {
        // No CV file — go straight to applying
        await update();
      }
    } catch {
      setAnonError(t("errors.applyFailed"));
      setAnonPhase("idle");
    }
  }

  // An existing account: the CV they picked is stored as one of their
  // documents (the profile is left as it is) and preselected on the apply form.
  // Written as "not kept" first: a refresh mid-upload then lands on the form
  // with the message to pick or upload again, not silently on another CV.
  // The same file twice (a retry, a second go) reuses the one already held.
  async function keepCvForThisApplication(file: File) {
    tabStorage.set(RETURNING_CV_FLAG, `${jobId}||${Date.now()}`);
    const docId = await uploadDocumentForAnon(file, { reuseSame: true });
    tabStorage.set(RETURNING_CV_FLAG, `${jobId}|${docId}|${Date.now()}`);
    if (signedInWithGoogle.current) {
      leaveForSignedInPage();
      return;
    }
    setAnonPhase("idle");
    await update();
  }

  // Reads the CV into the new profile while the review window is open. What
  // it finds fills only the fields the seeker has not typed into yet.
  async function readCvInBackground(file: File, opts: { confirmOwner?: boolean } = {}) {
    const keep = (field: keyof CvReviewValues, found: string) => (current: string) =>
      (touchedReview.current.has(field) || !found ? current : found);
    let heldForOwner = false;
    try {
      const fd = new FormData();
      fd.append("cv", file);
      if (opts.confirmOwner) fd.append("confirmOwner", "1");
      const extractRes = await csrfFetch("/api/ai/cv-extract", { method: "POST", body: fd });
      if (extractRes.status === 409) {
        const held = (await extractRes.json().catch(() => null)) as { code?: string; ownerMismatch?: CvOwnerMismatch } | null;
        // Another person's name on the CV: nothing was saved; ask first.
        if (held?.code === "cv_owner_mismatch" && held.ownerMismatch) {
          heldForOwner = true;
          setCvOwnerCheck({ mismatch: held.ownerMismatch, file });
          return;
        }
      }
      const extractData = extractRes.ok ? ((await extractRes.json()) as CvExtractResponse) : null;
      if (!extractData?.success) throw new Error("not read");
      const cv = extractData.extracted;
      setProfileCompleteness(extractData.profileCompleteness);
      // A CV vouched for despite another name keeps the account's name.
      if (!opts.confirmOwner) setConfirmName(keep("name", cv.fullName ?? ""));
      setConfirmPhone(keep("phone", cv.phone ?? ""));
      setCvReadSummary(summarizeCvRead(cv));
      setConfirmRoles(keep("roles", rolesFromCv(cv).join(", ")));
      // The city lookup and the headline suggestion (an AI call) fill in when
      // they arrive; the window unlocks as soon as the CV and profile are in.
      void areaFromProfileLocation(cv.currentLocation, cv.phone)
        .then((area) => {
          if (!area) return;
          setConfirmArea((current) => (touchedReview.current.has("area") ? current : area));
          // Where they live is where they look, unless they say otherwise.
          if (area.countryCode) {
            setConfirmCountries(keep("countries", countryName(area.countryCode)));
            setConfirmCurrency(CURRENCY_BY_COUNTRY[area.countryCode] ?? "USD");
          }
        })
        .catch(() => { /* the seeker picks it */ });
      // The reader's "headline" is the CV's 1-2 sentence summary, already
      // saved as the profile summary. The headline is one short line: keep
      // the one the account has, else suggest one from the CV.
      void shortHeadline(cv)
        .then((headline) => setConfirmHeadline(keep("headline", headline)))
        .catch(() => { /* the seeker can type one */ });
      await loadReviewProfile();
    } catch {
      setExtractionFailed(true);
      // Still keep the file, as a document on the profile.
      await uploadDocumentForAnon(file);
    } finally {
      // Still "reading" while the owner question is open.
      if (!heldForOwner) setCvReading(false);
    }
  }

  function retryCvRead(file: File, opts: { confirmOwner?: boolean } = {}) {
    setCvOwnerCheck(null);
    setAnonCvFile(file);
    setCvReading(true);
    void readCvInBackground(file, opts);
  }

  // The review window again, filled from what the CV read stored.
  async function resumeReview() {
    try {
      const res = await fetch("/api/job-seeker/profile");
      if (!res.ok) return;
      const p = (await res.json()) as SeekerProfileData & {
        fullName?: string; profileCompleteness?: number; preferredRoles?: string[]; preferredCountries?: string[];
      };
      setReviewProfile(p);
      setReviewDraft(p);
      setProfileCompleteness(p.profileCompleteness ?? null);
      setConfirmName(p.fullName || session?.user?.name || "");
      setConfirmPhone(p.phone || "");
      setConfirmHeadline(p.headline || "");
      const read = { skills: p.skills, experience: p.experience, education: p.education, languages: p.languages, certifications: p.certifications, projects: p.projects } as ExtractedProfileData;
      setCvReadSummary(summarizeCvRead(read));
      if (!p.headline) void shortHeadline(read).then((h) => setConfirmHeadline((typed) => typed || h));
      setConfirmRoles((p.preferredRoles?.length ? p.preferredRoles : rolesFromCv(read)).join(", "));
      const area = await areaFromProfileLocation(p.currentLocation ?? undefined, p.phone ?? undefined).catch(() => null);
      if (area) setConfirmArea(area);
      const code = area?.countryCode;
      const saved = (p.preferredCountries ?? []).map((c) => (c.length === 2 ? countryName(c.toUpperCase()) : c));
      setConfirmCountries(saved.length ? saved.join(", ") : code ? countryName(code) : "");
      if (code) setConfirmCurrency(CURRENCY_BY_COUNTRY[code] ?? "USD");
      setAnonPhase("confirm");
    } catch { /* the apply form stays; onboarding is still one click away */ }
  }

  // The stored profile, for the CV preview in the review window.
  async function loadReviewProfile() {
    try {
      const res = await fetch("/api/job-seeker/profile");
      if (res.ok) {
        const stored = (await res.json()) as SeekerProfileData;
        setReviewProfile(stored);
        setReviewDraft(stored);
      }
    } catch { /* the preview keeps its placeholder; the form still works */ }
  }

  // Upload CV file as a document for anonymous users. The stored document's
  // id (PROFILE_CV_KEY when `reuseSame` found it is their Profile CV), or ""
  // when the upload failed.
  async function uploadDocumentForAnon(file: File, opts: { reuseSame?: boolean } = {}): Promise<string> {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "resume");
      if (opts.reuseSame) fd.append("reuseSame", "1");
      const res = await fetch("/api/job-seeker/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.profileCv === true) return PROFILE_CV_KEY;
      return res.ok && data?.document?.id ? String(data.document.id) : "";
    } catch {
      // Best-effort — if it fails, continue anyway
      return "";
    }
  }

  // Handle profile confirmation and profile PATCH
  async function handleAnonProfileConfirm() {
    setAnonError("");
    setReviewSaving(true);
    try {
      // Visibility is always written: the schema default is "visible", so an
      // unanswered profile would be findable without the seeker having said yes.
      const patchBody: Record<string, unknown> = {
        onboardingComplete: true,
        profileVisibility: confirmDiscoverable ? "visible" : "hidden",
      };
      if (confirmName && confirmName.trim().length > 0) {
        patchBody.name = confirmName.trim();
      }
      if (confirmPhone && confirmPhone.trim().length >= 7) {
        patchBody.phone = confirmPhone.trim();
      }
      if (confirmHeadline && confirmHeadline.trim().length > 0) {
        patchBody.headline = confirmHeadline.trim();
      }
      if (confirmArea.city) patchBody.cityId = confirmArea.city.id;
      else if (confirmArea.region) patchBody.stateId = confirmArea.region.id;

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

      // Job Preferences live on the other profile endpoint. Best-effort: the
      // seeker can set them in Job Preferences if this one save fails.
      // The CV's own content, when they fixed it in the window, goes with them.
      const prefs = preferencesBody({ roles: confirmRoles, countries: confirmCountries, salary: confirmSalary, currency: confirmCurrency, noticeDays: confirmNotice });
      const cvEdits = cvEditsBody(reviewDraft, reviewProfile);
      // The design they picked for the Mployedin CV (only once the CV was read).
      const design = reviewProfile ? { cvDesign: cvDesignFor(reviewTemplate) } : null;
      if (prefs || cvEdits || design) {
        let saved = false;
        try {
          const prefsRes = await csrfFetch("/api/job-seeker/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...prefs, ...cvEdits, ...design }),
          });
          saved = prefsRes.ok;
        } catch { /* judged below */ }
        // Fixes they made to the CV must not be dropped silently; preferences
        // alone can be set again in Job Preferences.
        if (!saved && cvEdits) {
          setAnonError(t("errors.cvEditsNotSaved"));
          return;
        }
      }

      // Drop the cached profile so the apply form re-reads it. Without this the
      // CV panel still shows the pre-sign-in snapshot and claims "No CV on file"
      // even though the parse (or the fallback upload) just stored one.
      setProfile(null);

      // The save above marked the profile onboarded; the session must hear it,
      // or the form keeps treating the seeker as new and never offers the
      // Mployedin CV made from what the CV gave. The server re-reads the flag.
      await update({ isOnboarded: true });

      // Now a signed-up, onboarded seeker: this job opens inside the seeker app
      // (their menu, home, applications), not the public site. Everything is
      // saved, so a page load loses nothing; after a Google sign-in it also drops
      // Firebase's hidden Google iframe and window.gapi. Only after the save
      // succeeded: a failure above keeps the form.
      setLeavingPage(true);
      navigateWithPageLoad(`/${locale}/job-seeker/jobs/${encodeURIComponent(jobId)}`);
      return;
    } catch {
      setAnonError(t("errors.applyFailed"));
    } finally {
      // A failed save keeps the window open with its message, answers intact.
      setReviewSaving(false);
    }
  }

  // CV-first quick apply: pick a CV (kept in memory — Google auth is a popup, so
  // the page does not unload while it runs), sign in with Google, then the CV is
  // extracted into the fresh profile and onboarding is skipped. Reduces drop-off
  // from shared links.
  async function handleAnonGoogleApply() {
    setAnonError("");
    setGoogleWindowBlocked(false);
    signedInWithGoogle.current = false;
    setAnonPhase("auth");
    try {
      // Firebase loads here, on the click, and is disposed once the token is read.
      const idToken = await getGoogleIdToken();
      let res = await signIn("firebase", { idToken, ...referralCredentials(), redirect: false });
      if ((res as { code?: string } | undefined)?.code === CONSENT_REQUIRED_CODE) {
        if (!(await askConsentInPlace())) {
          setAnonError(t("signupConsentNeeded"));
          setAnonPhase("idle");
          return;
        }
        res = await signIn("firebase", { idToken, ...referralCredentials(), ...signupConsentCredentials(), redirect: false });
      }
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

      // Firebase's popup resolver leaves a hidden Google iframe and window.gapi in
      // this document, and only leaving it drops them, so load the job page again
      // (signed in) rather than re-render it. With no CV held in memory that is
      // now; with a CV the visitor picked, a reload would discard the file, so the
      // page stays until the confirm step has saved it (handleAnonProfileConfirm).
      signedInWithGoogle.current = true;
      if (!anonCvFile) {
        leaveForSignedInPage();
        return;
      }

      await finishAnonSignIn();
    } catch (err) {
      if (err instanceof GooglePopupBlockedError) {
        // Not a failure to log: the Google handshake is done (and cached for the
        // page), so pressing the button again opens the window at once.
        setGoogleWindowBlocked(true);
        setAnonPhase("idle");
        return;
      }
      const code = (err as { code?: string } | null)?.code;
      // Closing the Google window (or starting another sign-in over it) is a
      // choice, not an error: no message, the card is simply usable again.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setAnonPhase("idle");
        return;
      }
      // The retry on the kept instance was blocked too: the browser really blocks
      // pop-ups (the helper hands back the Firebase error), so say so.
      setAnonError(code === "auth/popup-blocked" ? t("errors.popupBlocked") : t("googleSignInFailed"));
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
    if (!anonName || !anonName.trim()) {
      setAnonError(t("errors.nameRequired"));
      return;
    }

    try {
      // Invisible captcha (reCAPTCHA v3 today, behind lib/browser/captcha).
      // Resolves to null when no site key is configured, in which case the
      // server skips the check too.
      const captchaToken = await getCaptchaToken("quick_apply");

      const res = await csrfFetch("/api/auth/apply-otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: anonEmail, name: anonName.trim(), ...(captchaToken ? { captchaToken } : {}) }),
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
      let res = await signIn("email-otp", {
        email: anonEmail,
        otp: anonOtpCode,
        ...referralCredentials(),
        redirect: false,
      });
      // A code that would make a new account waits for the Terms & Privacy
      // tick; the same code is sent again once it is given.
      if ((res as { code?: string } | undefined)?.code === CONSENT_REQUIRED_CODE) {
        if (!(await askConsentInPlace())) {
          setAnonError(t("signupConsentNeeded"));
          setAnonPhase("idle");
          return;
        }
        res = await signIn("email-otp", { email: anonEmail, otp: anonOtpCode, ...referralCredentials(), ...signupConsentCredentials(), redirect: false });
      }

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
      <>
        {/* Behind the review window: where things stand, if it is moved aside. */}
        <div role="status" className="flex flex-col items-center gap-2 rounded-3xl border border-border/70 bg-muted/10 card-pad text-center">
          <Check className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">{t("reviewPanelNote")}</p>
        </div>
        <CvReviewDialog
          open
          fileName={anonCvFile?.name ?? profile?.cvFileName ?? undefined}
          email={anonEmail || undefined}
          profile={reviewDraft}
          onProfileChange={setReviewDraft}
          reading={cvReading}
          templateId={reviewTemplate}
          onTemplateChange={setReviewTemplate}
          summary={extractionFailed ? null : cvReadSummary}
          extractionFailed={extractionFailed}
          completeness={profileCompleteness}
          values={reviewValues}
          onChange={changeReview}
          headlineMax={HEADLINE_MAX}
          error={anonError}
          saving={reviewSaving || leavingPage}
          emailNote={anonOtpSent ? t("emailConfirmMsg", { email: anonEmail }) : undefined}
          onConfirm={handleAnonProfileConfirm}
        />
        <CvOwnerCheckDialog
          mismatch={cvOwnerCheck?.mismatch ?? null}
          accept={CV_UPLOAD_ACCEPT}
          onConfirm={() => { if (cvOwnerCheck) retryCvRead(cvOwnerCheck.file, { confirmOwner: true }); }}
          onPickAnother={(next) => retryCvRead(next)}
        />
      </>
    );
  }

  if (!session) {
    const inAppBrwsr = isInAppBrowser();
    const inAppName = inAppBrowserName();
    const busy = anonPhase !== "idle";

    // Apply with CV: the dialog asks for the CV, its Apply moves on to log-in.
    function openCvDialog() {
      setAnonError("");
      setDialogStep("cv");
      setAuthDialogOpen(true);
    }

    // Apply without CV: log in, then a few questions make the Mployedin CV the
    // application carries (AUTO_CV_FLAG). A CV picked earlier is dropped.
    function openAuthWithoutCv() {
      setAnonCvFile(null);
      setAnonError("");
      tabStorage.set(AUTO_CV_FLAG, `${jobId}|${Date.now()}`);
      setDialogStep("auth");
      setAuthDialogOpen(true);
    }

    const cvStep = (
      <>
        <DialogHeader>
          <DialogTitle>{t("cvDialogTitle")}</DialogTitle>
          <DialogDescription>{t("cvDialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {anonCvFile ? (
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground"><bdi>{anonCvFile.name}</bdi></span>
              <button
                type="button"
                onClick={() => anonCvInputRef.current?.click()}
                className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {t("changeCv")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => anonCvInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{t("uploadYourCv")}</span>
              <span className="text-xs text-muted-foreground">{t("cvFormats")}</span>
            </button>
          )}
          {anonCvFile && (
            <Button
              size="lg"
              className="w-full rounded-2xl text-base font-medium gap-2"
              onClick={() => setDialogStep("auth")}
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              {t("applyNow")}
            </Button>
          )}
        </div>
      </>
    );

    function resetEmailStep() {
      setAnonAuthMethod(null);
      setAnonOtpSent(false);
      setAnonEmail("");
      setAnonName("");
      setAnonOtpCode("");
    }

    const googleButton = (
      <>
        <Button
          size="lg"
          variant={inAppBrwsr ? "outline" : "default"}
          className="w-full rounded-2xl text-base font-medium gap-2"
          onClick={handleAnonGoogleApply}
          onPointerEnter={preloadGoogleSignIn}
          onFocus={preloadGoogleSignIn}
          onTouchStart={preloadGoogleSignIn}
          aria-describedby={GOOGLE_WINDOW_NOTICE_ID}
          disabled={busy}
        >
          {busy && anonAuthMethod !== "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
          {anonPhase === "extract" ? t("settingUpProfile") : t("continueWithGoogle")}
        </Button>
        <GoogleWindowNotice
          notice={t("googleWindowNotice")}
          blockedMessage={t("googleWindowBlocked")}
          blocked={googleWindowBlocked}
          className="-mt-2"
        />
      </>
    );

    // E-mail step: name + address → 6-digit code → verify.
    const emailStep = anonOtpSent ? (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("codeSentTo", { email: anonEmail })}</p>
        <Input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          aria-label={t("enterCode")}
          value={anonOtpCode}
          onChange={(e) => setAnonOtpCode(e.target.value.replace(/\D/g, ""))}
          className="rounded-xl text-center tracking-widest text-lg"
          autoComplete="one-time-code"
        />
        <Button
          size="lg"
          onClick={handleAnonEmailOtpSubmit}
          disabled={busy || anonOtpCode.length !== 6}
          className="w-full rounded-2xl text-base font-medium gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {anonPhase === "extract" ? t("settingUpProfile") : t("verify")}
        </Button>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={resetEmailStep}
            disabled={busy}
            className="flex-1 text-center text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("useDifferentEmail")}
          </button>
          <button
            type="button"
            onClick={handleAnonEmailOtpStart}
            disabled={busy || anonOtpResendCountdown > 0}
            className="flex-1 text-center text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            {anonOtpResendCountdown > 0 ? t("resendIn", { seconds: anonOtpResendCountdown }) : t("resend")}
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <div className="field">
          <Label htmlFor="anon-name" className="text-xs font-medium text-foreground">
            {t("fullName")} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="anon-name"
            type="text"
            value={anonName}
            onChange={(e) => setAnonName(e.target.value)}
            placeholder={t("enterFullName")}
            className="rounded-xl"
            autoComplete="name"
            maxLength={200}
          />
        </div>
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
            autoComplete="email"
          />
        </div>
        <Button
          size="lg"
          onClick={handleAnonEmailOtpStart}
          disabled={busy || !anonEmail || !anonName.trim()}
          className="w-full rounded-2xl text-base font-medium gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("sendCode")}
        </Button>
        <CaptchaNotice className="-mt-1.5" />
      </div>
    );

    return (
      <>
        <div className="space-y-3">
          {/* Header: what this is, plus a small CV-and-sparkle mark. */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-4">
            <div className="flex items-start gap-2.5 pe-12">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 fill-primary text-primary" aria-hidden="true" />
              <div>
                <p className="text-lg font-semibold leading-tight text-foreground">{t("quickApplyTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("chooseHowToApply")}</p>
              </div>
            </div>
            <div className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rotate-6 rounded-xl border border-primary/15 bg-background/90 p-2 shadow-sm" aria-hidden="true">
              <FileText className="h-6 w-6 text-primary/70" />
              <Sparkles className="absolute -end-1.5 -top-1.5 h-4 w-4 fill-primary text-primary" />
            </div>
          </div>

          <input
            ref={anonCvInputRef}
            type="file"
            accept={CV_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              setAnonCvFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />

          {/* Login sits in the site header, so the card offers only the two ways to apply.
              The AI part is said on the option itself: a hint above it goes unread. */}
          <button
            type="button"
            onClick={openCvDialog}
            className="group relative flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-blue-800 p-4 pt-5 text-start text-primary-foreground shadow-md shadow-primary/20 transition hover:shadow-lg hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="absolute top-0 end-4 -translate-y-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-950 shadow-sm">
              {t("recommended")}
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25" aria-hidden="true">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-base font-semibold">{t("applyWithCv")}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none">{t("aiBadge")}</span>
              </span>
              <span className="mt-1 block text-xs text-primary-foreground/85">{t("applyWithCvDesc")}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={openAuthWithoutCv}
            className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-start transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <UserRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">{t("applyWithoutCv")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t("applyWithoutCvDesc")}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>

        <Dialog
          open={authDialogOpen && !consentAsking}
          onOpenChange={(open) => {
            // Mid sign-in the dialog stays: closing it would hide the progress.
            if (!open && busy) return;
            setAuthDialogOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-md">
            {dialogStep === "cv" ? cvStep : (<>
            <DialogHeader>
              <DialogTitle>{t("authDialogTitle")}</DialogTitle>
              <DialogDescription>
                {anonCvFile ? t("authDialogHintCv", { file: anonCvFile.name }) : t("authDialogHint")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {inAppBrwsr && (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <p>{t("inAppBrowserHint", { app: inAppName || "this app" })}</p>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                  >
                    <Link2 className="h-3 w-3" aria-hidden="true" />
                    {t("copyLink")}
                  </button>
                </div>
              )}

              {/* In-app browsers block the Google window, so e-mail leads there. */}
              {inAppBrwsr ? (
                <>
                  {emailStep}
                  {!anonOtpSent && (
                    <>
                      <OrDivider label={t("orDivider")} />
                      {googleButton}
                    </>
                  )}
                </>
              ) : (
                <>
                  {anonAuthMethod !== "email" && googleButton}
                  {anonAuthMethod === "email" ? (
                    <>
                      {emailStep}
                      {!anonOtpSent && (
                        <button
                          type="button"
                          onClick={resetEmailStep}
                          disabled={busy}
                          className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {t("backToOptions")}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <OrDivider label={t("orDivider")} />
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => setAnonAuthMethod("email")}
                        disabled={busy}
                        className="w-full rounded-2xl text-base font-medium gap-2"
                      >
                        <Mail className="h-4 w-4" aria-hidden="true" />
                        {t("continueWithEmail")}
                      </Button>
                      {/* People with an account (password or code) sign in on the
                          login page and land back on this job to apply (rollout row 40). */}
                      <p className="text-center text-xs text-muted-foreground">
                        {t("haveAccount")}{" "}
                        <Link
                          href={`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/jobs/${jobId}`)}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {t("logInToApply")}
                        </Link>
                      </p>
                    </>
                  )}
                </>
              )}

              {anonError && <p className="text-center text-xs text-destructive" role="alert">{anonError}</p>}
            </div>
            </>)}
          </DialogContent>
        </Dialog>
      </>
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
      <div className="w-full space-y-3">
      <div
        ref={confirmationRef}
        className="space-y-3 w-full rounded-3xl border border-green-500/30 bg-green-500/10 card-pad"
        tabIndex={-1}
        aria-live="polite"
        role="status"
      >
        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600"><Check className="h-4 w-4" aria-hidden="true" />{t("applicationSubmitted")}</p>
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

      {/* An account made by an e-mail code has no password: say how to get
          back in, and offer to set one. A sibling of the status card, not a
          child: a form inside a live region is read out on every keystroke. */}
      {session.user?.email && <ApplyLoginNextTime email={session.user.email} />}
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
    // The formats the server takes, said before an upload it would refuse.
    if (!isAcceptedCvFile(file)) {
      setError(t("errors.unsupportedFile"));
      return null;
    }
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
      if (doc) {
        setSelectedCvKey(doc.id);
        setCvMissing(false);
      }
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

    // No CV: every application carries one. Mark the CV field and bring it
    // into view, where the upload is one tap away.
    if (selectedCvKey === NO_CV_KEY) {
      setCvMissing(true);
      cvCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

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
      if (selectedCvKey === BUILT_CV_KEY) {
        // The CV built on Mployedin, made from the profile as it is now; its
        // stored copy is reused while nothing changed. Loaded only here, so
        // the page does not carry the PDF renderer. No CV, no application:
        // the seeker chose to send this one.
        const { BuiltCvError, ensureBuiltCvDocument } = await import("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv");
        try {
          const built = await ensureBuiltCvDocument({
            identity: { fullName: profile?.name ?? "", email: profile?.email ?? "", photo: session?.user?.image ?? "" },
            labels: cvPdfLabels,
            documents,
          });
          setDocuments((prev) => [...prev.filter((d) => !d.builtHash), built]);
          docIdSet.add(built.id);
        } catch (err) {
          setError((err instanceof BuiltCvError && err.message) || t("errors.builtCvFailed"));
          return;
        }
      } else if (selectedCvKey !== PROFILE_CV_KEY && selectedCvKey !== NO_CV_KEY) {
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
        // Plan quotas and a closed job get the dialog's own copy, as in EasyApplyFlowDialog.
        const known = applyErrorKey(data);
        setError(
          known === "planLimitReached" ? t("errors.planLimitReached")
            : known === "jobClosed" ? t("errors.jobClosed")
              : known === "documentNotFound" ? t("errors.documentNotFound")
                : known === "cvRequired" ? t("errors.cvRequired")
                  : data?.error ?? t("errors.applyFailed"),
        );
        // The chosen CV was deleted or replaced since the page loaded: reload
        // the seeker's CVs (the profile effect runs again) so the list and the
        // preselected one are what is there now.
        if (known === "documentNotFound") setProfile(null);
        if (known === "cvRequired") setCvMissing(true);
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
  // The stored copy of the built CV is not listed as a file of its own: "CV
  // built on Mployedin" stands for it and always sends the current one.
  const resumeDocs = uploadedResumes(documents);
  const otherDocs = documents.filter((d) => d.category !== "resume");
  const hasProfileCv = !!profile?.cvUrl;
  const hasBuiltCv = profile?.hasBuiltCv === true;
  const hasAnyCv = hasProfileCv || hasBuiltCv || resumeDocs.length > 0 || offerAutoCv;

  return (
    <div className="space-y-4">
      {welcomeBack && (
        <div role="status" className="space-y-1.5 rounded-3xl border border-primary/30 bg-primary/5 card-pad">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {t("welcomeBackTitle")}
          </p>
          <p className="text-xs text-muted-foreground">{t("welcomeBackBody")}</p>
          {welcomeBack === "lost" && (
            <p role="alert" className="text-xs text-destructive">{t("errors.returningCvNotKept")}</p>
          )}
          {/* A new tab, so this form and its answers stay put. */}
          <Link
            href={`/${locale}/job-seeker/documents`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("welcomeBackUpdateProfile")}
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      )}
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

      {/* CV / Resume — required: every application carries one. Shown even
          when the profile could not be loaded, so the CV can still be added. */}
      <div
        ref={cvCardRef}
        className={`space-y-2 rounded-3xl border bg-muted/10 card-pad ${cvMissing ? "border-destructive/60" : "border-border/70"}`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("profileCv")} <span className="text-destructive" aria-hidden="true">*</span>
        </p>
        {hasAnyCv ? (
          <>
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
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">
                    <bdi>{profile?.cvFileName || t("profileCvLabel")}</bdi>
                  </span>
                  {/* A new tab, so this form and its answers stay put. */}
                  <a
                    href="/api/job-seeker/cv"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("viewCv")}
                  </a>
                </label>
              )}
              {(hasBuiltCv || offerAutoCv || isOnboarded) && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="cv-choice"
                    checked={selectedCvKey === BUILT_CV_KEY}
                    onChange={() => setSelectedCvKey(BUILT_CV_KEY)}
                    className="mt-0.5 accent-primary"
                  />
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {hasBuiltCv ? t("builtCv") : t("autoCv")}
                    <span className="block text-xs text-muted-foreground">{hasBuiltCv ? t("builtCvHint") : t("autoCvHint")}</span>
                    {!hasBuiltCv && (
                      // A new tab, so this form and its answers stay put.
                      <a
                        href={`/${locale}/job-seeker/cv`}
                        target="_blank"
                        rel="noopener"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("previewCv")}
                      </a>
                    )}
                  </span>
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
                  <span className="truncate"><bdi>{d.name}</bdi></span>
                </label>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingCv}
              onClick={() => cvInputRef.current?.click()}
              className="h-8 gap-1.5 rounded-xl text-xs"
            >
              {uploadingCv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingCv ? t("uploading") : offerAutoCv ? t("uploadOwnCv") : t("uploadDifferentCv")}
            </Button>
          </>
        ) : (
          <>
            {/* No CV yet: the upload is the field itself, not a small button. */}
            <button
              type="button"
              disabled={uploadingCv}
              onClick={() => cvInputRef.current?.click()}
              aria-describedby={cvMissing ? "easy-apply-cv-required" : undefined}
              className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {uploadingCv
                ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                : <Upload className="h-5 w-5 text-primary" aria-hidden="true" />}
              <span className="text-sm font-semibold text-foreground">{uploadingCv ? t("uploading") : t("uploadCvToApply")}</span>
              <span className="text-xs text-muted-foreground">{t("cvFormats")}</span>
            </button>
            {/* Or the details onboarding asks for, which make the Mployedin CV. */}
            <button
              type="button"
              onClick={() => goToOnboarding(true)}
              className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("addDetailsForCv")}
            </button>
          </>
        )}
        {cvMissing && (
          <p id="easy-apply-cv-required" role="alert" className="text-xs text-destructive">
            {t("errors.cvRequired")}
          </p>
        )}
      </div>

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
                  <span className="truncate"><bdi>{d.name}</bdi></span>
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
            accept={CV_UPLOAD_ACCEPT}
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
              <Label htmlFor={`sq-${q.id}`} className="text-sm font-medium text-foreground">
                {q.label}
                {q.required && <span className="ml-1 text-destructive">*</span>}
              </Label>

              {q.type === "text" && (
                <Input
                  id={`sq-${q.id}`}
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                  maxLength={500}
                />
              )}

              {q.type === "textarea" && (
                <textarea
                  id={`sq-${q.id}`}
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
                  id={`sq-${q.id}`}
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
        onClick={() => void handleApply()}
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

      {/* Opened from the CV field, which shows even without a loaded profile. */}
      <input
        ref={cvInputRef}
        type="file"
        accept={CV_UPLOAD_ACCEPT}
        className="hidden"
        onChange={handleCvUpload}
      />

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
        <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-600">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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

// Google's own multi-colour "G" (brand asset, so not a lucide icon).
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

