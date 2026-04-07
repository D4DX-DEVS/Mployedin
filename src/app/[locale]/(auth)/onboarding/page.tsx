"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Sparkles, ChevronRight, ChevronLeft, CheckCircle, Loader2,
  MapPin, Briefcase, GraduationCap, Globe, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect, FormMultiSelect } from "@/components/shared/AppForm";
import { Country as CSCCountry } from "country-state-city";

// ── Country data ──────────────────────────────────────────────────────────────
const ALL_COUNTRIES = CSCCountry.getAllCountries()
  .map((c) => ({ value: c.isoCode, label: c.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

const GCC_POPULAR = [
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "OM", label: "Oman" },
  { value: "KW", label: "Kuwait" },
  { value: "BH", label: "Bahrain" },
];

// ── Step types ──────────────────────────────────────────────────────────────
interface PersonalInfo {
  headline: string;
  nationality: string;
  currentCity: string;
  currentCountry: string;
  yearsExperience: string;
}

interface CareerPrefs {
  industries: string[];
  targetCountries: string[];
  salaryMin: string;
  currency: string;
  availableIn: string;
}

interface SkillsInfo {
  skills: string[];
  languages: string[];
  educationLevel: string;
}

// ── Static options ────────────────────────────────────────────────────────────
const INDUSTRIES_OPTIONS = [
  { value: "technology", label: "Technology" },
  { value: "construction", label: "Construction" },
  { value: "healthcare", label: "Healthcare" },
  { value: "hospitality", label: "Hospitality" },
  { value: "finance", label: "Finance" },
  { value: "oil_gas", label: "Oil & Gas" },
  { value: "education", label: "Education" },
  { value: "logistics", label: "Logistics" },
  { value: "retail", label: "Retail" },
];

const EDUCATION_LEVELS = [
  { value: "high_school", label: "High School" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelor", label: "Bachelor's Degree" },
  { value: "master", label: "Master's Degree" },
  { value: "phd", label: "PhD" },
];

const AVAILABLE_IN = [
  { value: "immediately", label: "Immediately" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "1_month", label: "1 Month" },
  { value: "3_months", label: "3 Months" },
];

const COMMON_SKILLS = [
  "Project Management", "Excel", "AutoCAD", "Python", "React", "Accounting",
  "Arabic", "Customer Service", "Sales", "HR", "Logistics", "Healthcare Admin",
];

const LANGUAGES = [
  { value: "en", label: "English" }, { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" }, { value: "ur", label: "Urdu" },
  { value: "hi", label: "Hindi" }, { value: "tl", label: "Tagalog" },
];

const STEPS = [
  { label: "Personal", Icon: MapPin },
  { label: "Career", Icon: Briefcase },
  { label: "Skills", Icon: GraduationCap },
  { label: "Languages", Icon: Globe },
] as const;

// ── Input class (matches login/register) ─────────────────────────────────────
const inputCls =
  "h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg";

export default function JobSeekerOnboardingPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [stepError, setStepError] = useState("");
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiInsight, setAiInsight] = useState("");

  const [personal, setPersonal] = useState<PersonalInfo>({
    headline: "", nationality: "", currentCity: "", currentCountry: "AE", yearsExperience: "0",
  });
  const [career, setCareer] = useState<CareerPrefs>({
    industries: [], targetCountries: ["AE", "SA"],
    salaryMin: "", currency: "AED", availableIn: "1_month",
  });
  const [skills, setSkills] = useState<SkillsInfo>({
    skills: [], languages: ["en"], educationLevel: "bachelor",
  });

  // ── Per-step validation ──────────────────────────────────────────────────
  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return personal.headline.trim().length >= 3;
      case 1: return true;
      case 2: return skills.skills.length >= 1;
      case 3: return skills.languages.length >= 1;
      default: return true;
    }
  }, [step, personal.headline, skills.skills.length, skills.languages.length]);

  const STEP_ERRORS = [
    "Please enter your professional headline (at least 3 characters).",
    "",
    "Add at least one skill to continue.",
    "Select at least one language to continue.",
  ];

  const handleNext = useCallback(() => {
    if (!canAdvance()) { setStepError(STEP_ERRORS[step]); return; }
    setStepError("");
    setStep((s) => s + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdvance, step]);

  // Enter key to advance (only on text inputs, not dropdowns)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.target instanceof HTMLInputElement && step < STEPS.length - 1) {
        handleNext();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleNext, step]);

  // ── AI Suggestions ────────────────────────────────────────────────────────
  const getAISuggestion = async () => {
    if (!personal.headline) return;
    setAiSuggesting(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `I am a Gulf job seeker: "${personal.headline}", ${personal.yearsExperience} years experience. Suggest 3 job titles and 2 industries briefly.`,
          }],
        }),
      });
      if (res.ok) setAiInsight((await res.text()).slice(0, 300));
    } finally {
      setAiSuggesting(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!canAdvance()) { setStepError(STEP_ERRORS[step]); return; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/job-seekers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: personal.headline,
          nationality: personal.nationality,
          currentLocation: { city: personal.currentCity, country: personal.currentCountry },
          yearsExperience: parseInt(personal.yearsExperience) || 0,
          industries: career.industries,
          preferredCountries: career.targetCountries,
          salaryExpectation: { min: parseInt(career.salaryMin) || 0, currency: career.currency },
          availabilityStatus: career.availableIn,
          skills: skills.skills.map((s) => ({ name: s, level: "intermediate" })),
          languages: skills.languages.map((l) => ({ language: l, level: "conversational" })),
          education: skills.educationLevel,
          onboardingComplete: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError((data as { error?: string }).error ?? "Failed to save. Please try again.");
        return;
      }
      router.push(`/${locale ?? "en"}/job-seeker/dashboard`);
    } catch {
      setSaveError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile logo — matches login/register */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <span className="font-bold text-base">M</span>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
      </div>

      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Let&apos;s set up your profile
            </h1>
            <p className="text-base text-muted-foreground font-light">
              4 quick steps to unlock AI-powered job matches
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="space-y-2">
        <div className="flex items-start">
          {STEPS.map(({ label, Icon }, i) => {
            const isCompleted = i < step;
            const isActive = i === step;
            return (
              <div key={i} className="flex flex-1 items-start">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-md scale-95"
                      : isActive
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {isCompleted
                      ? <Check className="h-4 w-4" strokeWidth={2.5} />
                      : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-xs font-medium ${
                    isActive ? "text-foreground" : isCompleted ? "text-primary" : "text-muted-foreground"
                  }`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mt-5 mx-2 bg-border overflow-hidden relative">
                    <div className={`absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-in-out${
                      i < step ? " w-full" : " w-0"
                    }`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length} &mdash; {STEPS[step].label}
        </p>
      </div>

      {/* Step content */}
      <div className="space-y-5">

        {/* ── Step 0: Personal ── */}
        {step === 0 && (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Personal Information
              </h2>
              <p className="text-sm text-muted-foreground">Tell us about yourself to personalise your job matches.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headline" className="text-sm font-medium">
                  Professional Headline <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="headline"
                  value={personal.headline}
                  placeholder="e.g. Civil Engineer with 5 years Gulf experience"
                  onChange={(e) => { setPersonal((p) => ({ ...p, headline: e.target.value })); setStepError(""); }}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormSelect
                  label="Nationality"
                  value={personal.nationality}
                  options={ALL_COUNTRIES}
                  searchable
                  placeholder="Search nationality…"
                  onChange={(v) => setPersonal((p) => ({ ...p, nationality: v }))}
                />
                <FormSelect
                  label="Years of Experience"
                  value={personal.yearsExperience}
                  options={[0, 1, 2, 3, 5, 7, 10, 15].map((n) => ({
                    value: String(n),
                    label: n === 0 ? "Fresh Graduate" : `${n}+ years`,
                  }))}
                  onChange={(v) => setPersonal((p) => ({ ...p, yearsExperience: v }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm font-medium">Current City</Label>
                  <Input
                    id="city"
                    value={personal.currentCity}
                    placeholder="e.g. Dubai"
                    onChange={(e) => setPersonal((p) => ({ ...p, currentCity: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <FormSelect
                  label="Country"
                  value={personal.currentCountry}
                  options={ALL_COUNTRIES}
                  searchable
                  placeholder="Search country…"
                  onChange={(v) => setPersonal((p) => ({ ...p, currentCountry: v }))}
                />
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: Career ── */}
        {step === 1 && (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Career Preferences
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={getAISuggestion}
                  disabled={!personal.headline || aiSuggesting}
                  className="text-xs text-primary gap-1.5 h-8 px-2 hover:text-primary"
                >
                  {aiSuggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI Suggest
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">What kind of work are you looking for?</p>
            </div>
            {aiInsight && (
              <div className="relative p-4 rounded-xl bg-primary/5 border border-primary/20">
                <button
                  onClick={() => setAiInsight("")}
                  className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2.5 pr-5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground leading-relaxed">{aiInsight}</p>
                </div>
              </div>
            )}
            <div className="space-y-4">
              <FormMultiSelect
                label="Target Industries"
                value={career.industries}
                options={INDUSTRIES_OPTIONS}
                onChange={(v) => setCareer((c) => ({ ...c, industries: v }))}
                maxSelections={4}
              />
              <FormMultiSelect
                label="Target Countries"
                value={career.targetCountries}
                options={ALL_COUNTRIES}
                searchable
                popularOptions={GCC_POPULAR}
                groupLabel="All Countries"
                onChange={(v) => setCareer((c) => ({ ...c, targetCountries: v }))}
                maxSelections={3}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="salary" className="text-sm font-medium">Minimum Salary</Label>
                  <Input
                    id="salary"
                    type="number"
                    min="0"
                    value={career.salaryMin}
                    placeholder="e.g. 5000"
                    onChange={(e) => setCareer((c) => ({ ...c, salaryMin: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <FormSelect
                  label="Availability"
                  value={career.availableIn}
                  options={AVAILABLE_IN}
                  onChange={(v) => setCareer((c) => ({ ...c, availableIn: v }))}
                />
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Skills ── */}
        {step === 2 && (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" /> Skills &amp; Education
              </h2>
              <p className="text-sm text-muted-foreground">Highlight your top skills and education background.</p>
            </div>
            <div className="space-y-4">
              <FormMultiSelect
                label="Key Skills"
                value={skills.skills}
                options={COMMON_SKILLS.map((s) => ({ value: s, label: s }))}
                onChange={(v) => { setSkills((s) => ({ ...s, skills: v })); setStepError(""); }}
                maxSelections={15}
              />
              <FormSelect
                label="Highest Education Level"
                value={skills.educationLevel}
                options={EDUCATION_LEVELS}
                onChange={(v) => setSkills((s) => ({ ...s, educationLevel: v }))}
              />
            </div>
          </>
        )}

        {/* ── Step 3: Languages ── */}
        {step === 3 && (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" /> Languages
              </h2>
              <p className="text-sm text-muted-foreground">Which languages do you speak?</p>
            </div>
            <div className="space-y-4">
              <FormMultiSelect
                label=""
                value={skills.languages}
                options={LANGUAGES}
                onChange={(v) => { setSkills((s) => ({ ...s, languages: v })); setStepError(""); }}
                maxSelections={6}
              />
              <div className="flex gap-3 items-start p-4 rounded-xl bg-gradient-to-br from-primary/8 to-primary/3 border border-primary/15">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Almost done!</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    After setup, our AI will match you with roles that fit your profile.
                    You can always update your preferences later.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Validation error */}
        {stepError && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0 inline-block" />
            {stepError}
          </p>
        )}

        {/* API error */}
        {saveError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {saveError}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="ghost"
          onClick={() => { setStep((s) => s - 1); setStepError(""); }}
          disabled={step === 0}
          className="gap-1.5 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} className="gap-1.5">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleFinish} disabled={saving} className="gap-2 min-w-[130px]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Finish Setup"}
          </Button>
        )}
      </div>
    </div>
  );
}
