"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Check, ChevronRight, Loader2, X, Upload, Briefcase, GraduationCap, Sparkles, CheckCircle, LogOut, Linkedin, Mail, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Step0Data {
  name: string;
  phone: string;
  countryCode: string;
  workStatus: "experienced" | "fresher" | "";
  resumeFile: File | null;
  marketingConsent: boolean;
}

interface Step1Data {
  isCurrentlyEmployed: boolean | null;
  experienceYears: string;
  experienceMonths: string;
  companyName: string;
  jobTitle: string;
  currentCity: string;
  startMonth: string;
  startYear: string;
  annualSalary: string;
  salaryCurrency: string;
  noticePeriod: string;
  skills: string[];
  skillInput: string;
  industry: string;
  department: string;
  roleCategory: string;
  jobRole: string;
}

interface Step2Data {
  qualification: string;
  course: string;
  courseType: string;
  specialization: string;
  university: string;
  startYear: string;
  passingYear: string;
}

interface Step3Data {
  headline: string;
  preferredLocations: string[];
  locationInput: string;
  preferredSalary: string;
  salaryCurrency: string;
  gender: string;
}

// ── Static data ───────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+974", country: "QA", flag: "🇶🇦" },
  { code: "+968", country: "OM", flag: "🇴🇲" },
  { code: "+965", country: "KW", flag: "🇰🇼" },
  { code: "+973", country: "BH", flag: "🇧🇭" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+44", country: "GB", flag: "🇬🇧" },
  { code: "+92", country: "PK", flag: "🇵🇰" },
  { code: "+63", country: "PH", flag: "🇵🇭" },
  { code: "+880", country: "BD", flag: "🇧🇩" },
  { code: "+20", country: "EG", flag: "🇪🇬" },
  { code: "+249", country: "SD", flag: "🇸🇩" },
];

const NOTICE_PERIODS = ["15 Days", "1 Month", "2 Months", "3 Months", "More than 3 Months", "Serving Notice Period"];

const SKILL_SUGGESTIONS = [
  "JavaScript", "React", "Node.js", "Python", "Java", "SQL", "Excel",
  "Project Management", "AutoCAD", "Accounting", "Customer Service", "Sales",
  "HR", "Logistics", "Data Analysis", "Power BI", "Laravel", "PHP",
];

const INDUSTRY_OPTIONS = [
  "IT Services & Consulting", "Analytics / KPO / Research", "BPM / BPO",
  "Banking / Financial Services", "Healthcare / Pharma", "E-commerce",
  "Manufacturing", "Education / Training", "Retail", "Logistics", "Oil & Gas",
  "Construction", "Hospitality", "Media / Entertainment",
];

const QUALIFICATION_OPTIONS = [
  { value: "doctorate", label: "Doctorate/PhD" },
  { value: "masters", label: "Masters/Post-Graduation" },
  { value: "graduation", label: "Graduation/Diploma" },
  { value: "12th", label: "12th" },
  { value: "10th", label: "10th" },
  { value: "below_10th", label: "Below 10th" },
];

const COURSE_SUGGESTIONS: Record<string, string[]> = {
  graduation: ["B.Tech/B.E.", "B.A", "BCA", "B.B.A/B.M.S", "B.Com", "B.Ed", "B.Pharma", "B.Sc", "LLB", "Diploma"],
  masters: ["M.Tech/M.E.", "MBA/PGDM", "MCA", "M.A", "M.Sc", "M.Com", "LLM"],
  doctorate: ["Ph.D", "M.Phil"],
};

const COURSE_TYPES = ["Full Time", "Part Time", "Distance Learning"];

const SPEC_SUGGESTIONS = [
  "Computer Science and Engineering (CSE)", "Electronics and Communication",
  "Mechanical Engineering", "Civil Engineering", "Information Technology",
  "Electrical Engineering", "Chemical Engineering", "Data Science",
  "Finance", "Marketing", "Human Resources",
];

const LOCATION_SUGGESTIONS = [
  "Dubai", "Abu Dhabi", "Riyadh", "Jeddah", "Doha", "Kuwait City",
  "Muscat", "Manama", "Mumbai", "Bengaluru", "Delhi / NCR", "Hyderabad",
  "Chennai", "Pune", "Kolkata", "Ahmedabad", "Remote",
];

const GENDERS = ["Male", "Female", "Transgender"];

const YEARS_RANGE = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() - i));

// ── Step sidebar config ───────────────────────────────────────────────────────
const STEPS = [
  { label: "Basic details", subtitle: "Your basic information" },
  { label: "Employment", subtitle: "Your experience is your success story, talk about it" },
  { label: "Education", subtitle: "Employers prefer to know about your Education" },
  { label: "Last step", subtitle: "Add headline & preferences" },
] as const;

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function ChipButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm transition-all ${
        selected
          ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
          : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
      }`}
    >
      {selected && <span className="mr-1">×</span>}
      {label}
    </button>
  );
}

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-sm text-gray-700">
      {label}
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-gray-700 ml-1">×</button>
    </span>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1 rounded-full border border-gray-300 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all"
    >
      {label} +
    </button>
  );
}

// ── Notice period → days mapping ──────────────────────────────────────────────
const NOTICE_PERIOD_DAYS: Record<string, number> = {
  "15 Days": 15,
  "1 Month": 30,
  "2 Months": 60,
  "3 Months": 90,
  "More than 3 Months": 120,
  "Serving Notice Period": 0,
};

// ── Main component ────────────────────────────────────────────────────────────
export default function JobSeekerOnboardingPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { data: session, status, update: updateSession } = useSession();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [industryOpen, setIndustryOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const industryRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const userName = (session?.user?.name as string | undefined) ?? "";
  const userEmail = (session?.user?.email as string | undefined) ?? "";
  const userImage = (session?.user?.image as string | undefined) ?? "";
  const isLinkedIn = (session?.user as unknown as { provider?: string })?.provider === "linkedin";
  const [linkedInPrefilled, setLinkedInPrefilled] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiImported, setAiImported] = useState(false);
  const [aiImportError, setAiImportError] = useState("");

  const [step0, setStep0] = useState<Step0Data>({
    name: userName,
    phone: "",
    countryCode: "+971",
    workStatus: "",
    resumeFile: null,
    marketingConsent: false,
  });

  // Guard: redirect already-onboarded users away from this page
  useEffect(() => {
    if (status !== "authenticated") return;
    if ((session?.user as unknown as { isOnboarded?: boolean })?.isOnboarded === true) {
      router.replace(`/${locale ?? "en"}/job-seeker`);
    }
  }, [status, session, locale, router]);

  // Pre-fill from session name + fetch existing profile for OAuth users
  useEffect(() => {
    if (!session?.user) return;

    // Always sync session name
    if (userName && !step0.name) {
      setStep0((p) => ({ ...p, name: userName }));
    }

    // Fetch existing profile (created during OAuth sign-in) to pre-fill
    if (!profileLoaded) {
      setProfileLoaded(true);
      fetch("/api/job-seekers/profile")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.profile) return;
          const p = data.profile;

          // Pre-fill step0
          setStep0((prev) => ({
            ...prev,
            name: p.fullName || prev.name || userName,
            phone: p.phone ?? prev.phone,
            workStatus: p.workStatus || prev.workStatus,
            marketingConsent: p.marketingConsent ?? prev.marketingConsent,
          }));

          if (isLinkedIn && (p.fullName || userName)) {
            setLinkedInPrefilled(true);
          }

          // Pre-fill step1 from LinkedIn extras (headline used as job title hint, location)
          if (isLinkedIn && p.currentLocation) {
            setStep1((prev) => ({
              ...prev,
              currentCity: p.currentLocation || prev.currentCity,
            }));
          }

          // Pre-fill step3 from LinkedIn extras (headline, preferred locations)
          if (isLinkedIn) {
            setStep3((prev) => ({
              ...prev,
              headline: p.headline || prev.headline,
              preferredLocations: p.currentLocation && !prev.preferredLocations.length
                ? [p.currentLocation]
                : prev.preferredLocations,
            }));
          }

          // Auto-focus phone if name is already filled
          if ((p.fullName || userName) && !p.phone) {
            setTimeout(() => phoneRef.current?.focus(), 300);
          }
        })
        .catch(() => {
          // Profile not found — that's fine for credentials users
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userName]);

  // ── Auto-trigger AI import for LinkedIn users ────────────────────────────
  const aiImportTriggered = useRef(false);
  useEffect(() => {
    if (
      isLinkedIn &&
      profileLoaded &&
      !aiImported &&
      !aiImporting &&
      !aiImportTriggered.current &&
      status === "authenticated"
    ) {
      aiImportTriggered.current = true;
      handleAiImport();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLinkedIn, profileLoaded, aiImported, aiImporting, status]);

  // ── AI-powered LinkedIn profile import ──────────────────────────────────
  const handleAiImport = useCallback(async () => {
    setAiImporting(true);
    setAiImportError("");
    try {
      const res = await fetch("/api/linkedin/import-profile", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Import failed");
      }
      const { imported } = await res.json() as {
        imported: {
          name?: string;
          headline?: string;
          location?: string;
          summary?: string;
          industry?: string;
          skills?: string[];
          languages?: string[];
          certifications?: string[];
          experience?: {
            jobTitle: string;
            company: string;
            location?: string;
            startDate?: string;
            endDate?: string;
            isCurrent?: boolean;
          }[];
          education?: {
            degree: string;
            institution: string;
            field?: string;
            startYear?: number;
            endYear?: number;
          }[];
        };
      };

      // Pre-fill Step 0
      if (imported.name) {
        setStep0((p) => ({ ...p, name: imported.name || p.name }));
      }

      // Pre-fill Step 1 (Employment)
      const firstExp = imported.experience?.[0];
      if (firstExp) {
        setStep0((p) => ({ ...p, workStatus: p.workStatus || "experienced" }));
        setStep1((p) => ({
          ...p,
          isCurrentlyEmployed: firstExp.isCurrent ?? p.isCurrentlyEmployed,
          companyName: firstExp.company || p.companyName,
          jobTitle: firstExp.jobTitle || p.jobTitle,
          currentCity: imported.location || firstExp.location || p.currentCity,
          skills: imported.skills?.length ? imported.skills.slice(0, 15) : p.skills,
          industry: imported.industry || p.industry,
        }));
      } else if (imported.location) {
        setStep1((p) => ({ ...p, currentCity: imported.location || p.currentCity }));
      }

      // Pre-fill Step 2 (Education)
      const firstEdu = imported.education?.[0];
      if (firstEdu) {
        setStep2((p) => ({
          ...p,
          qualification: firstEdu.degree || p.qualification,
          university: firstEdu.institution || p.university,
          specialization: firstEdu.field || p.specialization,
          startYear: firstEdu.startYear?.toString() || p.startYear,
          passingYear: firstEdu.endYear?.toString() || p.passingYear,
        }));
      }

      // Pre-fill Step 3 (Headline & Preferences)
      setStep3((p) => ({
        ...p,
        headline: imported.headline || imported.summary || p.headline,
        preferredLocations: imported.location && !p.preferredLocations.length
          ? [imported.location]
          : p.preferredLocations,
      }));

      setAiImported(true);
      setLinkedInPrefilled(true);
    } catch (err) {
      setAiImportError((err as Error).message);
    } finally {
      setAiImporting(false);
    }
  }, []);

  const [step1, setStep1] = useState<Step1Data>({
    isCurrentlyEmployed: null,
    experienceYears: "",
    experienceMonths: "",
    companyName: "",
    jobTitle: "",
    currentCity: "",
    startMonth: "",
    startYear: "",
    annualSalary: "",
    salaryCurrency: "AED",
    noticePeriod: "",
    skills: [],
    skillInput: "",
    industry: "",
    department: "",
    roleCategory: "",
    jobRole: "",
  });

  const [step2, setStep2] = useState<Step2Data>({
    qualification: "",
    course: "",
    courseType: "",
    specialization: "",
    university: "",
    startYear: "",
    passingYear: "",
  });

  const [step3, setStep3] = useState<Step3Data>({
    headline: "",
    preferredLocations: [],
    locationInput: "",
    preferredSalary: "",
    salaryCurrency: "AED",
    gender: "",
  });

  // Scroll to top whenever step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Close industry dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (industryRef.current && !industryRef.current.contains(e.target as Node)) {
        setIndustryOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Step validation ──────────────────────────────────────────────────────
  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return !!step0.name.trim() && !!step0.phone.trim() && !!step0.workStatus;
      case 1: return step0.workStatus === "fresher" || (step1.isCurrentlyEmployed !== null && !!step1.experienceYears);
      case 2: return !!step2.qualification;
      case 3: return !!step3.headline.trim();
      default: return true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, step0, step1, step2, step3]);

  // ── Save helpers ─────────────────────────────────────────────────────────
  const saveStep = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/job-seekers/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? "Failed to save");
    }
    return res.json();
  };

  const handleNext = async () => {
    setSaveError("");

    // Step-specific save
    setSaving(true);
    try {
      if (step === 0) {
        await saveStep({
          name: step0.name,
          phone: `${step0.countryCode}${step0.phone}`,
          workStatus: step0.workStatus,
          marketingConsent: step0.marketingConsent,
        });
      } else if (step === 1) {
        const payload: Record<string, unknown> = {
          totalExperienceYears: parseInt(step1.experienceYears) || 0,
          totalExperienceMonths: parseInt(step1.experienceMonths) || 0,
          skills: step1.skills,
          industry: step1.industry,
          noticePeriod: step1.noticePeriod ? NOTICE_PERIOD_DAYS[step1.noticePeriod] : undefined,
        };
        if (step1.companyName && step1.jobTitle) {
          payload.experience = [{
            jobTitle: step1.jobTitle,
            company: step1.companyName,
            startDate: step1.startYear ? `${step1.startYear}-${step1.startMonth || "01"}-01` : undefined,
            isCurrent: step1.isCurrentlyEmployed ?? false,
            country: step1.currentCity,
            annualSalary: step1.annualSalary ? parseFloat(step1.annualSalary) : undefined,
            salaryCurrency: step1.salaryCurrency,
          }];
        }
        await saveStep(payload);
      } else if (step === 2) {
        await saveStep({
          education: [{
            degree: step2.qualification,
            institution: step2.university || "",
            field: step2.specialization || step2.course,
            startYear: step2.startYear ? parseInt(step2.startYear) : undefined,
            passingYear: step2.passingYear ? parseInt(step2.passingYear) : undefined,
            courseType: step2.courseType,
          }],
        });
      }
      setStep((s) => s + 1);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!step3.headline.trim()) {
      setSaveError("Please enter a resume headline.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await saveStep({
        headline: step3.headline,
        preferredLocations: step3.preferredLocations,
        preferredSalary: step3.preferredSalary
          ? { min: parseFloat(step3.preferredSalary), max: 0, currency: step3.salaryCurrency }
          : undefined,
        gender: step3.gender,
        onboardingComplete: true,
      });
      // Refresh the JWT so middleware sees isOnboarded: true
      await updateSession({ isOnboarded: true });
      router.push(`/${locale ?? "en"}/job-seeker`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addSkill = (skill: string) => {
    const s = skill.trim();
    if (s && !step1.skills.includes(s) && step1.skills.length < 30) {
      setStep1((p) => ({ ...p, skills: [...p.skills, s], skillInput: "" }));
    }
  };

  const addLocation = (loc: string) => {
    const l = loc.trim();
    if (l && !step3.preferredLocations.includes(l) && step3.preferredLocations.length < 10) {
      setStep3((p) => ({ ...p, preferredLocations: [...p.preferredLocations, l], locationInput: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Mployedin" width={140} height={36} className="h-9 w-auto object-contain" style={{ width: "auto" }} />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium text-gray-600">App theme</p>
            <p className="text-[11px] text-gray-400">Applies after onboarding</p>
          </div>
          <ThemeToggle />
          {userName && (
            <span className="text-sm text-gray-600">Welcome, {userName}</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
            className="group ml-1 h-10 rounded-full border-slate-200/80 bg-white/90 px-3.5 text-slate-600 shadow-sm shadow-slate-200/60 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-slate-950/60 dark:hover:border-red-900 dark:hover:bg-red-950/60 dark:hover:text-red-300"
            title="Sign out"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-red-100 group-hover:text-red-500 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-red-950 dark:group-hover:text-red-300">
              <LogOut className="h-3.5 w-3.5" />
            </span>
            <span className="hidden sm:inline">Sign out</span>
            <span className="sr-only sm:hidden">Sign out</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 max-w-5xl mx-auto w-full px-4 py-10 gap-8">
        {/* ── Left Sidebar Stepper ── */}
        <aside className="w-56 shrink-0 hidden md:block">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-4 top-5 bottom-5 w-px bg-gray-200" />
            <div className="space-y-8">
              {STEPS.map(({ label, subtitle }, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <div key={i} className="relative flex items-start gap-3">
                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                      done
                        ? "bg-green-500 border-green-500 text-white"
                        : active
                        ? "bg-white border-blue-600 text-blue-600"
                        : "bg-white border-gray-300 text-gray-400"
                    }`}>
                      {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <span className="text-xs font-bold">{i + 1}</span>}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-semibold ${active ? "text-gray-900" : done ? "text-green-700" : "text-gray-400"}`}>{label}</p>
                      <p className="text-xs text-gray-400 leading-snug mt-0.5">{subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Main Card ── */}
        <div className="flex-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {/* Mobile step indicator */}
            <div className="md:hidden mb-6 flex items-center gap-2">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-gray-200"}`} />
              ))}
            </div>

            {/* ══ Step 0: Basic details ══════════════════════════════════════ */}
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-4">
                    {linkedInPrefilled && userImage ? (
                      <Image
                        src={userImage}
                        alt={step0.name || "Profile"}
                        width={56}
                        height={56}
                        className="rounded-full border-2 border-blue-200 shrink-0"
                      />
                    ) : null}
                    <h2 className="text-2xl font-bold text-gray-900">Welcome, {step0.name.split(" ")[0] || "there"} !</h2>
                  </div>
                  {linkedInPrefilled && (
                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                      <Linkedin className="w-4 h-4 text-[#0A66C2] shrink-0" />
                      We imported your info from LinkedIn. Please verify and complete the remaining fields.
                    </div>
                  )}
                  {/* AI Import from LinkedIn — auto-triggered */}
                  {isLinkedIn && !aiImported && aiImporting && (
                    <div className="mt-3">
                      <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium shadow-md">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing your LinkedIn profile with AI — please wait...
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5 text-center">
                        AI is analyzing your LinkedIn profile to fill experience, education, skills &amp; more
                      </p>
                    </div>
                  )}
                  {isLinkedIn && !aiImported && !aiImporting && aiImportError && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                        <X className="w-4 h-4 shrink-0" />
                        Auto-import failed: {aiImportError}
                      </div>
                      <button
                        type="button"
                        onClick={handleAiImport}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium shadow-md transition-all"
                      >
                        <Wand2 className="w-4 h-4" />
                        Retry auto-fill from LinkedIn
                      </button>
                    </div>
                  )}
                  {aiImported && (
                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-800">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                      Your profile has been auto-filled from LinkedIn! Please verify the details below and edit if needed.
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    Your account is created successfully. Let&rsquo;s get started!
                  </div>
                  <p className="text-sm text-blue-600 mt-2">Search &amp; apply to jobs from the Gulf&rsquo;s No.1 Job Site</p>
                </div>

                {/* Full name */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-gray-800">Full name <span className="text-red-500">*</span></Label>
                    {linkedInPrefilled && step0.name.trim() && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> From LinkedIn
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      value={step0.name}
                      onChange={(e) => setStep0((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Your full name"
                      className="h-11 pr-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20"
                    />
                    {step0.name.trim().length > 1 && (
                      <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />
                    )}
                  </div>
                </div>

                {/* Email (read-only for LinkedIn users) */}
                {linkedInPrefilled && userEmail && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium text-gray-800">Email</Label>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> From LinkedIn
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        value={userEmail}
                        readOnly
                        className="h-11 pr-10 border-gray-300 bg-gray-50 text-gray-600 cursor-default"
                      />
                      <Mail className="absolute right-3 top-3 w-5 h-5 text-green-500" />
                    </div>
                  </div>
                )}

                {/* Mobile number */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-800">Mobile number <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <select
                      value={step0.countryCode}
                      onChange={(e) => setStep0((p) => ({ ...p, countryCode: e.target.value }))}
                      className="h-11 px-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus:border-blue-500 shrink-0"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code + c.country} value={c.code}>{c.flag} {c.code}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Input
                        ref={phoneRef}
                        type="tel"
                        value={step0.phone}
                        onChange={(e) => setStep0((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "") }))}
                        placeholder="Enter your mobile number"
                        className={`h-11 border-gray-300 focus:border-blue-500 pr-10 ${!step0.phone && "border-red-400"}`}
                      />
                      {step0.phone.length >= 7 && (
                        <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </div>
                  {!step0.phone && <p className="text-xs text-red-500">Please enter your mobile number</p>}
                  {step0.phone.length >= 7 && <p className="text-xs text-gray-500">Recruiters will contact you on this number</p>}
                </div>

                {/* Work status */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">Work status <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "experienced", icon: <Briefcase className="w-8 h-8 text-gray-400" />, title: "I'm experienced", sub: "I have work experience (excluding internships)" },
                      { value: "fresher", icon: <GraduationCap className="w-8 h-8 text-gray-400" />, title: "I'm a fresher", sub: "I am a student/ Haven't worked after graduation" },
                    ].map(({ value, icon, title, sub }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStep0((p) => ({ ...p, workStatus: value as "experienced" | "fresher" }))}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all ${
                          step0.workStatus === value
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        <div>
                          <p className={`font-semibold text-sm ${step0.workStatus === value ? "text-blue-700" : "text-gray-800"}`}>{title}</p>
                          <p className="text-xs text-gray-500 mt-1 leading-snug">{sub}</p>
                        </div>
                        <div className="shrink-0 ml-2">{icon}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resume upload (shown after work status chosen) */}
                {step0.workStatus && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-800">Resume</Label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.rtf"
                          className="sr-only"
                          onChange={(e) => setStep0((p) => ({ ...p, resumeFile: e.target.files?.[0] ?? null }))}
                        />
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
                          <Upload className="w-4 h-4" />
                          {step0.resumeFile ? step0.resumeFile.name.slice(0, 20) + "…" : "Upload Resume"}
                        </span>
                      </label>
                      <span className="text-xs text-gray-500">DOC, DOCx, PDF, RTF | Max: 2 MB</span>
                    </div>
                    <p className="text-xs text-gray-500">Recruiters prefer candidates who have a resume on their profile</p>
                  </div>
                )}

                {/* Marketing consent */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step0.marketingConsent}
                    onChange={(e) => setStep0((p) => ({ ...p, marketingConsent: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-gray-400 accent-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    Send me important updates &amp; promotions via SMS, email, and WhatsApp
                  </span>
                </label>

                <p className="text-xs text-gray-400">
                  By clicking Save and continue, you agree to the{" "}
                  <span className="text-blue-600 cursor-pointer">Terms and Conditions</span> &amp;{" "}
                  <span className="text-blue-600 cursor-pointer">Privacy Policy</span> of mployedin.
                </p>
              </div>
            )}

            {/* ══ Step 1: Employment ══════════════════════════════════════════ */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Employment details</h2>
                  <p className="text-sm text-gray-500 mt-1">These details help recruiters identify your professional experience</p>
                </div>

                {step0.workStatus === "fresher" ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <GraduationCap className="w-16 h-16 text-gray-300" />
                    <div>
                      <p className="font-semibold text-gray-700">You haven&rsquo;t worked yet — that&rsquo;s fine!</p>
                      <p className="text-sm text-gray-500 mt-1">You can skip this step and add internship details later from your profile.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Currently employed */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">Are you currently employed? <span className="text-red-500">*</span></Label>
                      <div className="flex gap-3">
                        {["Yes", "No"].map((opt) => (
                          <ChipButton
                            key={opt}
                            label={opt}
                            selected={step1.isCurrentlyEmployed === (opt === "Yes")}
                            onClick={() => setStep1((p) => ({ ...p, isCurrentlyEmployed: opt === "Yes" }))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Total experience */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">Total work experience <span className="text-red-500">*</span></Label>
                      <div className="flex gap-3">
                        <select
                          value={step1.experienceYears}
                          onChange={(e) => setStep1((p) => ({ ...p, experienceYears: e.target.value }))}
                          className="flex-1 h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select year</option>
                          {Array.from({ length: 31 }, (_, i) => (
                            <option key={i} value={String(i)}>{i === 0 ? "0 Years" : `${i} Year${i > 1 ? "s" : ""}`}</option>
                          ))}
                        </select>
                        <select
                          value={step1.experienceMonths}
                          onChange={(e) => setStep1((p) => ({ ...p, experienceMonths: e.target.value }))}
                          className="flex-1 h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select month</option>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={String(i)}>{i} Month{i !== 1 ? "s" : ""}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Company name */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Company name <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input
                          value={step1.companyName}
                          onChange={(e) => setStep1((p) => ({ ...p, companyName: e.target.value }))}
                          placeholder="Eg. Amazon"
                          className="h-11 border-gray-300 focus:border-blue-500 pr-10"
                        />
                        {step1.companyName.trim() && <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />}
                      </div>
                    </div>

                    {/* Job title */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Current job title <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.jobTitle}
                        onChange={(e) => setStep1((p) => ({ ...p, jobTitle: e.target.value }))}
                        placeholder="Eg. Software Developer"
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                    </div>

                    {/* Current city */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-800">Current city <span className="text-red-500">*</span></Label>
                        {linkedInPrefilled && step1.currentCity.trim() && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                            <Linkedin className="w-3 h-3" /> From LinkedIn
                          </span>
                        )}
                      </div>
                      <Input
                        value={step1.currentCity}
                        onChange={(e) => setStep1((p) => ({ ...p, currentCity: e.target.value }))}
                        placeholder="Eg. Dubai, Mumbai"
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500">This helps recruiters know your location preferences</p>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Duration <span className="text-red-500">*</span></Label>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2 flex-1">
                          <select
                            value={step1.startMonth}
                            onChange={(e) => setStep1((p) => ({ ...p, startMonth: e.target.value }))}
                            className="flex-1 h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Month</option>
                            {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <select
                            value={step1.startYear}
                            onChange={(e) => setStep1((p) => ({ ...p, startYear: e.target.value }))}
                            className="flex-1 h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Year</option>
                            {YEARS_RANGE.map((y) => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                        <span className="text-sm text-gray-500 shrink-0">To</span>
                        <div className="flex-1 h-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center px-3 text-sm text-gray-500">
                          {step1.isCurrentlyEmployed ? "Present" : "End date"}
                        </div>
                      </div>
                    </div>

                    {/* Annual salary */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Annual salary <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <select
                          value={step1.salaryCurrency}
                          onChange={(e) => setStep1((p) => ({ ...p, salaryCurrency: e.target.value }))}
                          className="h-11 px-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus:border-blue-500 w-20 shrink-0"
                        >
                          {["AED", "SAR", "USD", "EUR", "GBP", "INR", "QAR", "KWD", "OMR", "BHD"].map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min="0"
                          value={step1.annualSalary}
                          onChange={(e) => setStep1((p) => ({ ...p, annualSalary: e.target.value }))}
                          placeholder="Eg. 60,000"
                          className="flex-1 h-11 border-gray-300 focus:border-blue-500"
                        />
                      </div>
                      {step1.annualSalary && parseFloat(step1.annualSalary) < 1000 && (
                        <p className="text-xs text-orange-500">Please make sure you&rsquo;ve entered correct salary</p>
                      )}
                    </div>

                    {/* Notice period */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">Notice period <span className="text-red-500">*</span></Label>
                      <div className="flex flex-wrap gap-2">
                        {NOTICE_PERIODS.map((np) => (
                          <ChipButton
                            key={np}
                            label={np}
                            selected={step1.noticePeriod === np}
                            onClick={() => setStep1((p) => ({ ...p, noticePeriod: p.noticePeriod === np ? "" : np }))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Key skills */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">Key skills <span className="text-red-500">*</span></Label>
                      <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-blue-400 bg-blue-50/30 min-h-[44px]">
                        {step1.skills.map((s) => (
                          <TagChip key={s} label={s} onRemove={() => setStep1((p) => ({ ...p, skills: p.skills.filter((x) => x !== s) }))} />
                        ))}
                        <input
                          value={step1.skillInput}
                          onChange={(e) => setStep1((p) => ({ ...p, skillInput: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              addSkill(step1.skillInput);
                            }
                          }}
                          placeholder={step1.skills.length === 0 ? "Type a skill and press Enter" : "Add more…"}
                          className="outline-none text-sm flex-1 min-w-[150px] bg-transparent"
                        />
                      </div>
                      <p className="text-xs text-gray-500">Recruiters look for candidates with specific key skills</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-gray-500">Suggestions:</span>
                        {SKILL_SUGGESTIONS.filter((s) => !step1.skills.includes(s)).slice(0, 8).map((s) => (
                          <SuggestionChip key={s} label={s} onClick={() => addSkill(s)} />
                        ))}
                      </div>
                    </div>

                    {/* Industry */}
                    <div className="space-y-1.5" ref={industryRef}>
                      <Label className="text-sm font-medium text-gray-800">Industry <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        {step1.industry ? (
                          <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px]">
                            <TagChip label={step1.industry} onRemove={() => setStep1((p) => ({ ...p, industry: "" }))} />
                          </div>
                        ) : (
                          <Input
                            value={industrySearch}
                            onChange={(e) => { setIndustrySearch(e.target.value); setIndustryOpen(true); }}
                            onFocus={() => setIndustryOpen(true)}
                            placeholder="Eg. IT Services & Consulting"
                            className={`h-11 border-gray-300 focus:border-blue-500 ${!step1.industry ? "border-red-300" : ""}`}
                          />
                        )}
                        {industryOpen && !step1.industry && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                            {INDUSTRY_OPTIONS.filter((i) => i.toLowerCase().includes(industrySearch.toLowerCase())).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => { setStep1((p) => ({ ...p, industry: opt })); setIndustryOpen(false); setIndustrySearch(""); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Department</Label>
                      <Input
                        value={step1.department}
                        onChange={(e) => setStep1((p) => ({ ...p, department: e.target.value }))}
                        placeholder="Select your department / area of expertise"
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-gray-500">Suggestions:</span>
                        {["Engineering - Software & QA", "UX, Design & Architecture", "Finance & Accounting"].filter((d) => d !== step1.department).map((d) => (
                          <SuggestionChip key={d} label={d} onClick={() => setStep1((p) => ({ ...p, department: d }))} />
                        ))}
                      </div>
                    </div>

                    {/* Role category */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Role category <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.roleCategory}
                        onChange={(e) => setStep1((p) => ({ ...p, roleCategory: e.target.value }))}
                        placeholder="Eg. Software Development"
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                    </div>

                    {/* Job role */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">Job role <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.jobRole}
                        onChange={(e) => setStep1((p) => ({ ...p, jobRole: e.target.value }))}
                        placeholder="Eg. Backend Developer"
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══ Step 2: Education ══════════════════════════════════════════ */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Education details</h2>
                  <p className="text-sm text-gray-500 mt-1">These details help recruiters identify your background</p>
                </div>

                {/* Highest qualification */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">Highest qualification <span className="text-red-500">*</span></Label>
                  {step2.qualification ? (
                    <div className="flex flex-wrap gap-2">
                      <TagChip
                        label={QUALIFICATION_OPTIONS.find((q) => q.value === step2.qualification)?.label ?? step2.qualification}
                        onRemove={() => setStep2((p) => ({ ...p, qualification: "", course: "", courseType: "", specialization: "" }))}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {QUALIFICATION_OPTIONS.map(({ value, label }) => (
                        <ChipButton
                          key={value}
                          label={label}
                          selected={step2.qualification === value}
                          onClick={() => setStep2((p) => ({ ...p, qualification: value }))}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Course — shown when qualification is graduation or above */}
                {["graduation", "masters", "doctorate"].includes(step2.qualification) && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">Course <span className="text-red-500">*</span></Label>
                      {step2.course ? (
                        <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px]">
                          <TagChip label={step2.course} onRemove={() => setStep2((p) => ({ ...p, course: "" }))} />
                        </div>
                      ) : (
                        <>
                          <Input
                            value={step2.course}
                            onChange={(e) => setStep2((p) => ({ ...p, course: e.target.value }))}
                            placeholder="Eg. B.Tech"
                            className="h-11 border-gray-300 focus:border-blue-500"
                          />
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-gray-500">Suggestions</span>
                            {(COURSE_SUGGESTIONS[step2.qualification] ?? []).map((c) => (
                              <SuggestionChip key={c} label={c} onClick={() => setStep2((p) => ({ ...p, course: c }))} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Course type */}
                    {step2.course && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-800">Course type <span className="text-red-500">*</span></Label>
                        <div className="flex flex-wrap gap-2">
                          {COURSE_TYPES.map((ct) => (
                            step2.courseType === ct ? (
                              <TagChip key={ct} label={ct} onRemove={() => setStep2((p) => ({ ...p, courseType: "" }))} />
                            ) : (
                              <ChipButton key={ct} label={ct} selected={false} onClick={() => setStep2((p) => ({ ...p, courseType: ct }))} />
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Specialization */}
                    {step2.courseType && (
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-800">Specialization <span className="text-red-500">*</span></Label>
                        {step2.specialization ? (
                          <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px]">
                            <TagChip label={step2.specialization} onRemove={() => setStep2((p) => ({ ...p, specialization: "" }))} />
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              value={step2.specialization}
                              onChange={(e) => setStep2((p) => ({ ...p, specialization: e.target.value }))}
                              placeholder="Eg. Data Analytics"
                              className="h-11 border-gray-300 focus:border-blue-500"
                              list="spec-suggestions"
                            />
                            <datalist id="spec-suggestions">
                              {SPEC_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                            </datalist>
                          </div>
                        )}
                      </div>
                    )}

                    {/* University */}
                    {step2.specialization && (
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-800">University / Institute <span className="text-red-500">*</span></Label>
                        <Input
                          value={step2.university}
                          onChange={(e) => setStep2((p) => ({ ...p, university: e.target.value }))}
                          placeholder="Your university or institute"
                          className="h-11 border-gray-300 focus:border-blue-500"
                        />
                      </div>
                    )}

                    {/* Start + passing year */}
                    {step2.university && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-gray-800">Starting year <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              type="number"
                              value={step2.startYear}
                              onChange={(e) => setStep2((p) => ({ ...p, startYear: e.target.value }))}
                              placeholder="YYYY"
                              min="1950"
                              max={new Date().getFullYear()}
                              className="h-11 border-gray-300 focus:border-blue-500 pr-10"
                            />
                            {step2.startYear.length === 4 && <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-gray-800">Passing year <span className="text-red-500">*</span></Label>
                          <div className="relative">
                            <Input
                              type="number"
                              value={step2.passingYear}
                              onChange={(e) => setStep2((p) => ({ ...p, passingYear: e.target.value }))}
                              placeholder="YYYY"
                              min="1950"
                              max={new Date().getFullYear() + 6}
                              className="h-11 border-gray-300 focus:border-blue-500 pr-10"
                            />
                            {step2.passingYear.length === 4 && <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ══ Step 3: Headline & Preferences ══════════════════════════════ */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Add headline &amp; preferences</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <p className="text-sm text-gray-500">Make your profile stronger to get more relevant job recommendations</p>
                  </div>
                </div>

                {/* Resume headline */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-gray-800">Resume headline</Label>
                    {linkedInPrefilled && step3.headline.trim() && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> From LinkedIn
                      </span>
                    )}
                  </div>
                  <textarea
                    value={step3.headline}
                    onChange={(e) => setStep3((p) => ({ ...p, headline: e.target.value }))}
                    rows={3}
                    maxLength={500}
                    placeholder="Eg. Senior MERN Stack Developer with 5 years of experience..."
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-800 focus:outline-none focus:border-blue-500 resize-none"
                  />
                  {/* Suggestion */}
                  {(step1.jobTitle || step2.course) && !step3.headline && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Suggestions:</p>
                      {[
                        `${step1.jobTitle || "Professional"}${step2.course ? ` with ${step2.course}` : ""}${step2.specialization ? ` in ${step2.specialization}` : ""}`,
                      ].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStep3((p) => ({ ...p, headline: s }))}
                          className="w-full text-left p-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Preferred work locations */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">Preferred work locations <span className="text-gray-400 font-normal">(Maximum 10)</span></Label>
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px] focus-within:border-blue-500">
                    {step3.preferredLocations.map((l) => (
                      <TagChip key={l} label={l} onRemove={() => setStep3((p) => ({ ...p, preferredLocations: p.preferredLocations.filter((x) => x !== l) }))} />
                    ))}
                    {step3.preferredLocations.length < 10 && (
                      <input
                        value={step3.locationInput}
                        onChange={(e) => setStep3((p) => ({ ...p, locationInput: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addLocation(step3.locationInput);
                          }
                        }}
                        placeholder="Eg. Dubai, Riyadh, Mumbai"
                        className="outline-none text-sm flex-1 min-w-[150px] bg-transparent"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500">Suggestions:</span>
                    {LOCATION_SUGGESTIONS.filter((l) => !step3.preferredLocations.includes(l)).slice(0, 8).map((l) => (
                      <SuggestionChip key={l} label={l} onClick={() => addLocation(l)} />
                    ))}
                  </div>
                </div>

                {/* Preferred salary */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-800">Preferred salary</Label>
                  <div className="flex items-center gap-2">
                    <select
                      value={step3.salaryCurrency}
                      onChange={(e) => setStep3((p) => ({ ...p, salaryCurrency: e.target.value }))}
                      className="h-11 px-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus:border-blue-500 w-20 shrink-0"
                    >
                      {["AED", "SAR", "USD", "EUR", "GBP", "INR", "QAR", "KWD"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0"
                      value={step3.preferredSalary}
                      onChange={(e) => setStep3((p) => ({ ...p, preferredSalary: e.target.value }))}
                      placeholder="Eg. 120,000"
                      className="flex-1 h-11 border-gray-300 focus:border-blue-500"
                    />
                    <span className="text-sm text-gray-500 shrink-0">per year</span>
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">Gender</Label>
                  <div className="flex flex-wrap gap-2">
                    {GENDERS.map((g) => (
                      <ChipButton
                        key={g}
                        label={g}
                        selected={step3.gender === g}
                        onClick={() => setStep3((p) => ({ ...p, gender: p.gender === g ? "" : g }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {saveError && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                {saveError}
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="mt-8 flex items-center justify-between">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => { setStep((s) => s - 1); setSaveError(""); }}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ← Back
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                {/* Skip button for fresher Employment step */}
                {step === 1 && step0.workStatus === "fresher" && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Skip
                  </button>
                )}
                {step < 3 ? (
                  <Button
                    onClick={handleNext}
                    disabled={saving || !canAdvance()}
                    className="rounded-full px-8 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save and continue
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinish}
                    disabled={saving}
                    className="rounded-full px-8 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Submit
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

