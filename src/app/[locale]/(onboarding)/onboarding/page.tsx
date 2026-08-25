"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, ChevronDown, Search, Loader2, X, Upload, Briefcase, GraduationCap, Sparkles, CheckCircle, LogOut, Linkedin, Mail, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagAutocomplete, Autocomplete } from "@/components/ui/tag-autocomplete";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  { code: "+971", country: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+966", country: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+974", country: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "+968", country: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "+965", country: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "+973", country: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "+91", country: "IN", name: "India", flag: "🇮🇳" },
  { code: "+1", country: "US", name: "United States", flag: "🇺🇸" },
  { code: "+44", country: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+92", country: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "+63", country: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "+880", country: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "+20", country: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "+249", country: "SD", name: "Sudan", flag: "🇸🇩" },
  { code: "+93", country: "AF", name: "Afghanistan", flag: "🇦🇫" },
  { code: "+355", country: "AL", name: "Albania", flag: "🇦🇱" },
  { code: "+213", country: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "+54", country: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "+374", country: "AM", name: "Armenia", flag: "🇦🇲" },
  { code: "+61", country: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "+43", country: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "+994", country: "AZ", name: "Azerbaijan", flag: "🇦🇿" },
  { code: "+32", country: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "+975", country: "BT", name: "Bhutan", flag: "🇧🇹" },
  { code: "+55", country: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "+359", country: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "+855", country: "KH", name: "Cambodia", flag: "🇰🇭" },
  { code: "+237", country: "CM", name: "Cameroon", flag: "🇨🇲" },
  { code: "+1", country: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "+56", country: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "+86", country: "CN", name: "China", flag: "🇨🇳" },
  { code: "+57", country: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "+506", country: "CR", name: "Costa Rica", flag: "🇨🇷" },
  { code: "+385", country: "HR", name: "Croatia", flag: "🇭🇷" },
  { code: "+357", country: "CY", name: "Cyprus", flag: "🇨🇾" },
  { code: "+420", country: "CZ", name: "Czech Republic", flag: "🇨🇿" },
  { code: "+45", country: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "+593", country: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "+251", country: "ET", name: "Ethiopia", flag: "🇪🇹" },
  { code: "+358", country: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "+33", country: "FR", name: "France", flag: "🇫🇷" },
  { code: "+995", country: "GE", name: "Georgia", flag: "🇬🇪" },
  { code: "+49", country: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "+233", country: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "+30", country: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "+852", country: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "+36", country: "HU", name: "Hungary", flag: "🇭🇺" },
  { code: "+62", country: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "+98", country: "IR", name: "Iran", flag: "🇮🇷" },
  { code: "+964", country: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "+353", country: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "+972", country: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "+39", country: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "+81", country: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "+962", country: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "+254", country: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "+961", country: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "+218", country: "LY", name: "Libya", flag: "🇱🇾" },
  { code: "+60", country: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "+960", country: "MV", name: "Maldives", flag: "🇲🇻" },
  { code: "+356", country: "MT", name: "Malta", flag: "🇲🇹" },
  { code: "+52", country: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "+212", country: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "+95", country: "MM", name: "Myanmar", flag: "🇲🇲" },
  { code: "+977", country: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "+31", country: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "+64", country: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "+234", country: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "+47", country: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "+507", country: "PA", name: "Panama", flag: "🇵🇦" },
  { code: "+51", country: "PE", name: "Peru", flag: "🇵🇪" },
  { code: "+48", country: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "+351", country: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "+40", country: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "+7", country: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "+250", country: "RW", name: "Rwanda", flag: "🇷🇼" },
  { code: "+221", country: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "+381", country: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "+65", country: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "+421", country: "SK", name: "Slovakia", flag: "🇸🇰" },
  { code: "+27", country: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "+82", country: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "+34", country: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "+94", country: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "+46", country: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "+41", country: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "+963", country: "SY", name: "Syria", flag: "🇸🇾" },
  { code: "+886", country: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "+255", country: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "+66", country: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "+216", country: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "+90", country: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "+256", country: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "+380", country: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "+598", country: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "+998", country: "UZ", name: "Uzbekistan", flag: "🇺🇿" },
  { code: "+58", country: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "+84", country: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "+967", country: "YE", name: "Yemen", flag: "🇾🇪" },
  { code: "+260", country: "ZM", name: "Zambia", flag: "🇿🇲" },
  { code: "+263", country: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
];

const NOTICE_PERIODS = ["15 Days", "1 Month", "2 Months", "3 Months", "More than 3 Months", "Serving Notice Period"];

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

const GENDERS = ["Male", "Female", "Transgender"];

const YEARS_RANGE = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() - i));

// ── Step sidebar config ───────────────────────────────────────────────────────
// Note: STEPS labels/subtitles are translated dynamically inside the component

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function CountryCodeSelect({ value, onChange, t }: { value: string; onChange: (code: string) => void; t: ReturnType<typeof useTranslations> }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_CODES.filter((c) => c.code.includes(q) || c.country.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    : COUNTRY_CODES;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-700 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="font-medium">{selected.code}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchCountryPlaceholder")}
              className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">{t("noMatches")}</li>
            )}
            {filtered.map((c) => (
              <li key={c.code + c.country}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${
                    c.code === value ? "bg-blue-50/60 text-blue-700" : "text-gray-700"
                  }`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="flex-1 truncate font-medium">{c.name}</span>
                  <span className="text-gray-400">{c.code}</span>
                  {c.code === value && <Check className="ml-1 h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { data: session, status, update: updateSession } = useSession();

  // Construct STEPS array with translations
  const STEPS = [
    { label: t("stepBasicDetails"), subtitle: t("stepBasicDetailsSubtitle") },
    { label: t("stepEmployment"), subtitle: t("stepEmploymentSubtitle") },
    { label: t("stepEducation"), subtitle: t("stepEducationSubtitle") },
    { label: t("stepLastStep"), subtitle: t("stepLastStepSubtitle") },
  ] as const;

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
  const [cvParsing, setCvParsing] = useState(false);
  const [cvParsed, setCvParsed] = useState(false);
  const [cvParseError, setCvParseError] = useState("");

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

          if (isLinkedIn) {
            if (p.fullName || userName) setLinkedInPrefilled(true);
            // A LinkedIn-authenticated user is a professional — default the
            // work status to "experienced" so it's pre-selected on Step 0.
            setStep0((prev) => ({ ...prev, workStatus: prev.workStatus || "experienced" }));
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

      // LinkedIn users have a professional profile — default the work status
      // to "experienced". Don't gate this on a parsed experience entry, since
      // scraping experience behind LinkedIn's auth wall is unreliable.
      setStep0((p) => ({ ...p, workStatus: p.workStatus || "experienced" }));

      // Pre-fill Step 1 (Employment)
      const firstExp = imported.experience?.[0];
      if (firstExp) {
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

  // ── AI-powered CV/Resume parsing ──────────────────────────────────────────
  const handleCvParse = useCallback(async (file: File) => {
    if (!file || file.size > 10 * 1024 * 1024) {
      setCvParseError(file.size > 10 * 1024 * 1024 ? t("fileSizeTooLarge") : t("noFileSelected"));
      return;
    }
    setCvParsing(true);
    setCvParseError("");
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await csrfFetch("/api/ai/cv-extract", { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? t("cvParsingFailed"));
      }
      const { extracted } = await res.json() as {
        extracted: {
          fullName?: string;
          phone?: string;
          headline?: string;
          nationality?: string;
          currentLocation?: string;
          skills?: ({ name: string } | string)[];
          experience?: { jobTitle?: string; company?: string; location?: string; from?: string; to?: string; current?: boolean }[];
          education?: { degree?: string; field?: string; institution?: string; from?: string; to?: string }[];
          languages?: { language?: string; level?: string }[];
          socialLinks?: { label?: string; url?: string }[];
        } | null;
      };

      if (!extracted) {
        throw new Error(t("couldNotExtractCV"));
      }

      // Pre-fill Step 0
      if (extracted.fullName) {
        setStep0((p) => ({ ...p, name: extracted.fullName || p.name }));
      }
      if (extracted.phone) {
        setStep0((p) => ({ ...p, phone: extracted.phone || p.phone }));
      }

      // Pre-fill Step 1 (Employment)
      const firstExp = extracted.experience?.[0];
      if (firstExp) {
        setStep0((p) => ({ ...p, workStatus: p.workStatus || "experienced" }));
        const skills = extracted.skills?.map((s) => typeof s === "string" ? s : s.name).filter(Boolean) ?? [];

        // Calculate experience duration from start date
        let expYears = "";
        let expMonths = "";
        let startMonth = "";
        let startYear = "";
        if (firstExp.from) {
          const parts = firstExp.from.split("-");
          startYear = parts[0] || "";
          startMonth = parts[1] || "";
          const startDate = new Date(firstExp.from.length === 7 ? `${firstExp.from}-01` : firstExp.from);
          const endDate = firstExp.to && firstExp.to !== "present"
            ? new Date(firstExp.to.length === 7 ? `${firstExp.to}-01` : firstExp.to)
            : new Date();
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
            expYears = String(Math.floor(Math.max(0, totalMonths) / 12));
            expMonths = String(Math.max(0, totalMonths) % 12);
          }
        }

        setStep1((p) => ({
          ...p,
          isCurrentlyEmployed: firstExp.current ?? p.isCurrentlyEmployed,
          companyName: firstExp.company || p.companyName,
          jobTitle: firstExp.jobTitle || p.jobTitle,
          currentCity: firstExp.location || p.currentCity,
          skills: skills.length ? skills.slice(0, 15) : p.skills,
          ...(startMonth && { startMonth }),
          ...(startYear && { startYear }),
          ...(expYears && { experienceYears: expYears }),
          ...(expMonths && { experienceMonths: expMonths }),
        }));
      }

      // Pre-fill Step 2 (Education)
      const firstEdu = extracted.education?.[0];
      if (firstEdu) {
        setStep2((p) => ({
          ...p,
          qualification: firstEdu.degree || p.qualification,
          university: firstEdu.institution || p.university,
          specialization: firstEdu.field || p.specialization,
          startYear: firstEdu.from?.slice(0, 4) || p.startYear,
          passingYear: firstEdu.to?.slice(0, 4) || p.passingYear,
        }));
      }

      // Pre-fill Step 3 (Headline)
      if (extracted.headline) {
        setStep3((p) => ({ ...p, headline: extracted.headline || p.headline }));
      }

      setCvParsed(true);
    } catch (err) {
      setCvParseError((err as Error).message);
    } finally {
      setCvParsing(false);
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
  const [courseConfirmed, setCourseConfirmed] = useState(false);
  const [specConfirmed, setSpecConfirmed] = useState(false);

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
        // Sync session JWT with the (possibly CV-parsed) name
        if (step0.name && step0.name !== session?.user?.name) {
          await updateSession({ name: step0.name });
        }
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
      setSaveError(t("enterHeadline"));
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
      // Refresh the JWT so middleware sees isOnboarded: true + updated name
      await updateSession({ isOnboarded: true, name: step0.name });
      router.push(`/${locale ?? "en"}/job-seeker`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="h-auto w-[106px] object-contain" style={{ height: "auto" }} />
        </div>
        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-sm text-gray-600">{t("welcome", { name: userName })}</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
            className="group ml-1 h-10 rounded-full border-slate-200/80 bg-white/90 px-3.5 text-slate-600 shadow-sm shadow-slate-200/60 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            title={t("signOut")}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-red-100 group-hover:text-red-500">
              <LogOut className="h-3.5 w-3.5" />
            </span>
            <span className="hidden sm:inline">{t("signOut")}</span>
            <span className="sr-only sm:hidden">{t("signOut")}</span>
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
                      {t("linkedInImportBanner")}
                    </div>
                  )}
                  {/* AI Import from LinkedIn — auto-triggered */}
                  {isLinkedIn && !aiImported && aiImporting && (
                    <div className="mt-3">
                      <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium shadow-md">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("aiImportingLinkedIn")}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5 text-center">
                        {t("aiImportingLinkedInDesc")}
                      </p>
                    </div>
                  )}
                  {isLinkedIn && !aiImported && !aiImporting && aiImportError && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                        <X className="w-4 h-4 shrink-0" />
                        {t("aiImportFailed", { error: aiImportError })}
                      </div>
                      <button
                        type="button"
                        onClick={handleAiImport}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium shadow-md transition-all"
                      >
                        <Wand2 className="w-4 h-4" />
                        {t("retryAutoFill")}
                      </button>
                    </div>
                  )}
                  {aiImported && (
                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-800">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                      {t("aiImportedSuccessfully")}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    {t("accountCreatedSuccess")}
                  </div>
                  <p className="text-sm text-blue-600 mt-2">{t("jobSiteTagline")}</p>
                </div>

                {/* Full name */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-gray-800">{t("fullName")} <span className="text-red-500">*</span></Label>
                    {linkedInPrefilled && step0.name.trim() && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> {t("fromLinkedIn")}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      value={step0.name}
                      onChange={(e) => setStep0((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t("fullNamePlaceholder")}
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
                      <Label className="text-sm font-medium text-gray-800">{t("email")}</Label>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> {t("fromLinkedIn")}
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
                  <Label className="text-sm font-medium text-gray-800">{t("mobileNumber")} <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <CountryCodeSelect
                      value={step0.countryCode}
                      onChange={(code) => setStep0((p) => ({ ...p, countryCode: code }))}
                      t={t}
                    />
                    <div className="relative flex-1">
                      <Input
                        ref={phoneRef}
                        type="tel"
                        value={step0.phone}
                        onChange={(e) => setStep0((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "") }))}
                        placeholder={t("mobileNumberPlaceholder")}
                        className={`h-11 border-gray-300 focus:border-blue-500 pr-10 ${!step0.phone && "border-red-400"}`}
                      />
                      {step0.phone.length >= 7 && (
                        <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </div>
                  {!step0.phone && <p className="text-xs text-red-500">{t("mobileNumberRequired")}</p>}
                  {step0.phone.length >= 7 && <p className="text-xs text-gray-500">{t("recruitersWillContact")}</p>}
                </div>

                {/* Work status */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">{t("workStatus")} <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "experienced", icon: <Briefcase className="w-8 h-8 text-gray-400" />, title: t("iExperienced"), sub: t("iExperiencedDesc") },
                      { value: "fresher", icon: <GraduationCap className="w-8 h-8 text-gray-400" />, title: t("iAFresher"), sub: t("iAFresherDesc") },
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
                    <Label className="text-sm font-medium text-gray-800">{t("resume")}</Label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.rtf"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setStep0((p) => ({ ...p, resumeFile: file }));
                            if (file) handleCvParse(file);
                          }}
                        />
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
                          {cvParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {cvParsing ? t("parsing") : step0.resumeFile ? step0.resumeFile.name.slice(0, 20) + "…" : t("uploadResume")}
                        </span>
                      </label>
                      <span className="text-xs text-gray-500">{t("resumeFormats")}</span>
                    </div>
                    {cvParsed && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {t("resumeParsedSuccess")}
                      </p>
                    )}
                    {cvParseError && (
                      <p className="text-xs text-red-500">{cvParseError}</p>
                    )}
                    {!cvParsed && !cvParseError && (
                      <p className="text-xs text-gray-500">{t("uploadResumeToAutoFill")}</p>
                    )}
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
                    {t("marketingConsent")}
                  </span>
                </label>

                <p className="text-xs text-gray-400">
                  {t("termsAgreement")}{" "}
                  <span className="text-blue-600 cursor-pointer">{t("termsAndConditions")}</span> &amp;{" "}
                  <span className="text-blue-600 cursor-pointer">{t("privacyPolicy")}</span> {t("ofMployedin")}.
                </p>
              </div>
            )}

            {/* ══ Step 1: Employment ══════════════════════════════════════════ */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{t("employmentDetails")}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t("employmentDetailsDesc")}</p>
                </div>

                {step0.workStatus === "fresher" ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <GraduationCap className="w-16 h-16 text-gray-300" />
                    <div>
                      <p className="font-semibold text-gray-700">{t("noWorkExperience")}</p>
                      <p className="text-sm text-gray-500 mt-1">{t("skipEmploymentStepDesc")}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Currently employed */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">{t("currentlyEmployed")} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-3">
                        {[t("yes"), t("no")].map((opt) => (
                          <ChipButton
                            key={opt}
                            label={opt}
                            selected={step1.isCurrentlyEmployed === (opt === t("yes"))}
                            onClick={() => setStep1((p) => ({ ...p, isCurrentlyEmployed: opt === t("yes") }))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Total experience */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">{t("totalExperience")} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-3">
                        <Select value={step1.experienceYears} onValueChange={(v) => setStep1((p) => ({ ...p, experienceYears: v }))}>
                          <SelectTrigger className="flex-1 h-11">
                            <SelectValue placeholder={t("selectYear")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 31 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>{i === 0 ? t("zeroYears") : t("yearCount", { count: i })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={step1.experienceMonths} onValueChange={(v) => setStep1((p) => ({ ...p, experienceMonths: v }))}>
                          <SelectTrigger className="flex-1 h-11">
                            <SelectValue placeholder={t("selectMonth")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>{t("monthCount", { count: i })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Company name */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("companyName")} <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input
                          value={step1.companyName}
                          onChange={(e) => setStep1((p) => ({ ...p, companyName: e.target.value }))}
                          placeholder={t("companyNamePlaceholder")}
                          className="h-11 border-gray-300 focus:border-blue-500 pr-10"
                        />
                        {step1.companyName.trim() && <Check className="absolute right-3 top-3 w-5 h-5 text-green-500" />}
                      </div>
                    </div>

                    {/* Job title */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("currentJobTitle")} <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.jobTitle}
                        onChange={(e) => setStep1((p) => ({ ...p, jobTitle: e.target.value }))}
                        placeholder={t("jobTitlePlaceholder")}
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                    </div>

                    {/* Current city */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-800">{t("currentCity")} <span className="text-red-500">*</span></Label>
                        {linkedInPrefilled && step1.currentCity.trim() && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                            <Linkedin className="w-3 h-3" /> {t("fromLinkedIn")}
                          </span>
                        )}
                      </div>
                      <Autocomplete
                        type="locations"
                        value={step1.currentCity}
                        onChange={(v) => setStep1((p) => ({ ...p, currentCity: v }))}
                        placeholder={t("cityPlaceholder")}
                        inputClassName="h-11 border-gray-300 focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500">{t("locationHelpsRecruiters")}</p>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("duration")} <span className="text-red-500">*</span></Label>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2 flex-1">
                          <Select value={step1.startMonth} onValueChange={(v) => setStep1((p) => ({ ...p, startMonth: v }))}>
                            <SelectTrigger className="flex-1 h-11">
                              <SelectValue placeholder={t("month")} />
                            </SelectTrigger>
                            <SelectContent>
                              {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={step1.startYear} onValueChange={(v) => setStep1((p) => ({ ...p, startYear: v }))}>
                            <SelectTrigger className="flex-1 h-11">
                              <SelectValue placeholder={t("year")} />
                            </SelectTrigger>
                            <SelectContent>
                              {YEARS_RANGE.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-sm text-gray-500 shrink-0">{t("to")}</span>
                        <div className="flex-1 h-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center px-3 text-sm text-gray-500">
                          {step1.isCurrentlyEmployed ? t("present") : t("endDate")}
                        </div>
                      </div>
                    </div>

                    {/* Annual salary */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("annualSalary")} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <Select value={step1.salaryCurrency} onValueChange={(v) => setStep1((p) => ({ ...p, salaryCurrency: v }))}>
                          <SelectTrigger className="h-11 w-24 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["AED", "SAR", "USD", "EUR", "GBP", "INR", "QAR", "KWD", "OMR", "BHD"].map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="0"
                          value={step1.annualSalary}
                          onChange={(e) => setStep1((p) => ({ ...p, annualSalary: e.target.value }))}
                          placeholder={t("salaryPlaceholder")}
                          className="flex-1 h-11 border-gray-300 focus:border-blue-500"
                        />
                      </div>
                      {step1.annualSalary && parseFloat(step1.annualSalary) < 1000 && (
                        <p className="text-xs text-orange-500">{t("verifySalary")}</p>
                      )}
                    </div>

                    {/* Notice period */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-800">{t("noticePeriod")} <span className="text-red-500">*</span></Label>
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
                      <Label className="text-sm font-medium text-gray-800">{t("keySkills")} <span className="text-red-500">*</span></Label>
                      <TagAutocomplete
                        type="skills"
                        value={step1.skills}
                        onChange={(next) => setStep1((p) => ({ ...p, skills: next }))}
                        placeholder={step1.skills.length === 0 ? t("typeSkillPlaceholder") : t("addMore")}
                        max={30}
                      />
                      <p className="text-xs text-gray-500">{t("skillsHelpRecruiters")}</p>
                    </div>

                    {/* Industry */}
                    <div className="space-y-1.5" ref={industryRef}>
                      <Label className="text-sm font-medium text-gray-800">{t("industry")} <span className="text-red-500">*</span></Label>
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
                            placeholder={t("industryPlaceholder")}
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
                      <Label className="text-sm font-medium text-gray-800">{t("department")}</Label>
                      <Input
                        value={step1.department}
                        onChange={(e) => setStep1((p) => ({ ...p, department: e.target.value }))}
                        placeholder={t("departmentPlaceholder")}
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-gray-500">{t("suggestions")}:</span>
                        {[t("dept1"), t("dept2"), t("dept3")].filter((d) => d !== step1.department).map((d) => (
                          <SuggestionChip key={d} label={d} onClick={() => setStep1((p) => ({ ...p, department: d }))} />
                        ))}
                      </div>
                    </div>

                    {/* Role category */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("roleCategory")} <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.roleCategory}
                        onChange={(e) => setStep1((p) => ({ ...p, roleCategory: e.target.value }))}
                        placeholder={t("roleCategoryPlaceholder")}
                        className="h-11 border-gray-300 focus:border-blue-500"
                      />
                    </div>

                    {/* Job role */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-gray-800">{t("jobRole")} <span className="text-red-500">*</span></Label>
                      <Input
                        value={step1.jobRole}
                        onChange={(e) => setStep1((p) => ({ ...p, jobRole: e.target.value }))}
                        placeholder={t("jobRolePlaceholder")}
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
                  <h2 className="text-2xl font-bold text-gray-900">{t("educationDetails")}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t("educationDetailsDesc")}</p>
                </div>

                {/* Highest qualification */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">{t("highestQualification")} <span className="text-red-500">*</span></Label>
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
                      <Label className="text-sm font-medium text-gray-800">{t("course")} <span className="text-red-500">*</span></Label>
                      {step2.course && courseConfirmed ? (
                        <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px]">
                          <TagChip label={step2.course} onRemove={() => { setStep2((p) => ({ ...p, course: "" })); setCourseConfirmed(false); }} />
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Input
                              value={step2.course}
                              onChange={(e) => setStep2((p) => ({ ...p, course: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter" && step2.course.trim()) { e.preventDefault(); setCourseConfirmed(true); } }}
                              placeholder={t("coursePlaceholder")}
                              autoComplete="off"
                              className="h-11 border-gray-300 focus:border-blue-500 pr-20"
                            />
                            {step2.course.trim() && !courseConfirmed && (
                              <button
                                type="button"
                                onClick={() => setCourseConfirmed(true)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-2 py-1 rounded"
                              >
                                ✓ {t("confirm")}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-gray-500">{t("suggestions")}</span>
                            {(COURSE_SUGGESTIONS[step2.qualification] ?? []).filter((c) => !step2.course || c.toLowerCase().includes(step2.course.toLowerCase())).map((c) => (
                              <SuggestionChip key={c} label={c} onClick={() => { setStep2((p) => ({ ...p, course: c })); setCourseConfirmed(true); }} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Course type */}
                    {step2.course && courseConfirmed && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-800">{t("courseType")} <span className="text-red-500">*</span></Label>
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
                        <Label className="text-sm font-medium text-gray-800">{t("specialization")} <span className="text-red-500">*</span></Label>
                        {step2.specialization && specConfirmed ? (
                          <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-300 min-h-[44px]">
                            <TagChip label={step2.specialization} onRemove={() => { setStep2((p) => ({ ...p, specialization: "" })); setSpecConfirmed(false); }} />
                          </div>
                        ) : (
                          <Autocomplete
                            type="specializations"
                            value={step2.specialization}
                            onChange={(v) => { setStep2((p) => ({ ...p, specialization: v })); setSpecConfirmed(true); }}
                            placeholder={t("specializationPlaceholder")}
                            inputClassName="h-11 border-gray-300 focus:border-blue-500"
                          />
                        )}
                      </div>
                    )}

                    {/* University */}
                    {step2.specialization && specConfirmed && (
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-800">{t("university")} <span className="text-red-500">*</span></Label>
                        <Input
                          value={step2.university}
                          onChange={(e) => setStep2((p) => ({ ...p, university: e.target.value }))}
                          placeholder={t("universityPlaceholder")}
                          className="h-11 border-gray-300 focus:border-blue-500"
                        />
                      </div>
                    )}

                    {/* Start + passing year */}
                    {step2.university && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-gray-800">{t("startingYear")} <span className="text-red-500">*</span></Label>
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
                          <Label className="text-sm font-medium text-gray-800">{t("passingYear")} <span className="text-red-500">*</span></Label>
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
                  <h2 className="text-2xl font-bold text-gray-900">{t("addHeadlinePreferences")}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <p className="text-sm text-gray-500">{t("makeProfileStronger")}</p>
                  </div>
                </div>

                {/* Resume headline */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-gray-800">{t("resumeHeadline")}</Label>
                    {linkedInPrefilled && step3.headline.trim() && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[11px] font-medium text-[#0A66C2]">
                        <Linkedin className="w-3 h-3" /> {t("fromLinkedIn")}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={step3.headline}
                    onChange={(e) => setStep3((p) => ({ ...p, headline: e.target.value }))}
                    rows={3}
                    maxLength={500}
                    placeholder={t("headlinePlaceholder")}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-800 focus:outline-none focus:border-blue-500 resize-none"
                  />
                  {/* Suggestion */}
                  {(step1.jobTitle || step2.course) && !step3.headline && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">{t("suggestions")}</p>
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
                  <Label className="text-sm font-medium text-gray-800">{t("preferredLocations")} <span className="text-gray-400 font-normal">{t("maximum10")}</span></Label>
                  <TagAutocomplete
                    type="locations"
                    value={step3.preferredLocations}
                    onChange={(next) => setStep3((p) => ({ ...p, preferredLocations: next }))}
                    placeholder={t("locationsPlaceholder")}
                    max={10}
                  />
                </div>

                {/* Preferred salary */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-800">{t("preferredSalary")}</Label>
                  <div className="flex items-center gap-2">
                    <Select value={step3.salaryCurrency} onValueChange={(v) => setStep3((p) => ({ ...p, salaryCurrency: v }))}>
                      <SelectTrigger className="h-11 w-24 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["AED", "SAR", "USD", "EUR", "GBP", "INR", "QAR", "KWD"].map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      value={step3.preferredSalary}
                      onChange={(e) => setStep3((p) => ({ ...p, preferredSalary: e.target.value }))}
                      placeholder={t("salaryPlaceholder")}
                      className="flex-1 h-11 border-gray-300 focus:border-blue-500"
                    />
                    <span className="text-sm text-gray-500 shrink-0">{t("perYear")}</span>
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800">{t("gender")}</Label>
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
                  ← {t("back")}
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                {/* Complete Later — available on all steps */}
                <button
                  type="button"
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await saveStep({ onboardingComplete: true, profileCompletedLater: true });
                      await updateSession({ isOnboarded: true });
                      router.push(`/${locale ?? "en"}/job-seeker`);
                    } catch {
                      setSaveError(t("failedToSkip"));
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors underline underline-offset-2"
                >
                  {t("completeLater")}
                </button>
                {/* Skip button for fresher Employment step */}
                {step === 1 && step0.workStatus === "fresher" && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {t("skip")}
                  </button>
                )}
                {step < 3 ? (
                  <Button
                    onClick={handleNext}
                    disabled={saving || !canAdvance()}
                    className="rounded-full px-8 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {t("saveAndContinue")}
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinish}
                    disabled={saving}
                    className="rounded-full px-8 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {t("submit")}
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

