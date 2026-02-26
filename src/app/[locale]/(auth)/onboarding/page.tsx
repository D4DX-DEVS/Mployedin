"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronRight, ChevronLeft, CheckCircle, Loader2, MapPin, Briefcase, GraduationCap, Globe } from "lucide-react";
import { FormInput, FormSelect, FormMultiSelect } from "@/components/shared/AppForm";

// ── Step data types ──────────────────────────────────────────────────────────
interface PersonalInfo {
  headline: string;
  nationality: string;
  currentCity: string;
  currentCountry: string;
  yearsExperience: string;
}

interface CareerPrefs {
  desiredRoles: string[];
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

// ── Options ──────────────────────────────────────────────────────────────────
const GCC_COUNTRIES = [
  { value: "AE", label: "UAE" }, { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" }, { value: "OM", label: "Oman" },
  { value: "KW", label: "Kuwait" }, { value: "BH", label: "Bahrain" },
];

const ALL_COUNTRIES = [
  ...GCC_COUNTRIES,
  { value: "GB", label: "UK" }, { value: "US", label: "USA" },
  { value: "IN", label: "India" }, { value: "PK", label: "Pakistan" },
  { value: "EG", label: "Egypt" }, { value: "JO", label: "Jordan" },
];

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
  { label: "Personal", icon: <MapPin className="h-4 w-4" /> },
  { label: "Career", icon: <Briefcase className="h-4 w-4" /> },
  { label: "Skills", icon: <GraduationCap className="h-4 w-4" /> },
  { label: "Languages", icon: <Globe className="h-4 w-4" /> },
];

export default function JobSeekerOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiInsight, setAiInsight] = useState("");

  const [personal, setPersonal] = useState<PersonalInfo>({
    headline: "", nationality: "", currentCity: "", currentCountry: "AE", yearsExperience: "0",
  });
  const [career, setCareer] = useState<CareerPrefs>({
    desiredRoles: [], industries: [], targetCountries: ["AE", "SA"],
    salaryMin: "", currency: "AED", availableIn: "1_month",
  });
  const [skills, setSkills] = useState<SkillsInfo>({
    skills: [], languages: ["en"], educationLevel: "bachelor",
  });

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
            content: `I am a Gulf job seeker with this profile: "${personal.headline}", ${personal.yearsExperience} years experience. What roles should I target? Suggest 3 job titles and 2 industries. Be brief.`,
          }],
        }),
      });
      if (res.ok) {
        const text = await res.text();
        setAiInsight(text.slice(0, 300));
      }
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await fetch("/api/job-seekers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: personal.headline,
          nationality: personal.nationality,
          currentLocation: { city: personal.currentCity, country: personal.currentCountry },
          yearsExperience: parseInt(personal.yearsExperience) || 0,
          desiredRoles: career.desiredRoles,
          industries: career.industries,
          preferredCountries: career.targetCountries,
          salaryExpectation: { min: parseInt(career.salaryMin) || 0, currency: career.currency },
          availabilityStatus: career.availableIn,
          skills: skills.skills.map(s => ({ name: s, level: "intermediate" })),
          languages: skills.languages.map(l => ({ language: l, level: "conversational" })),
          education: skills.educationLevel,
          onboardingComplete: true,
        }),
      });
      router.push("/en/job-seeker/dashboard");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Let&apos;s set up your profile</h1>
          <p className="text-sm text-muted-foreground">Just 4 quick steps to unlock AI-powered job matches</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                i < step ? "bg-primary text-white" : i === step ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle className="h-4 w-4" /> : s.icon}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">{s.label}</span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="card-base space-y-4">
          {/* Step 0 — Personal */}
          {step === 0 && (
            <>
              <h2 className="text-base font-semibold">Personal Information</h2>
              <FormInput label="Professional Headline *"
                value={personal.headline}
                placeholder="e.g. Civil Engineer with 5 years Gulf experience"
                onChange={e => setPersonal(p => ({ ...p, headline: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Nationality" value={personal.nationality}
                  onChange={e => setPersonal(p => ({ ...p, nationality: e.target.value }))} />
                <FormSelect label="Years Experience" value={personal.yearsExperience}
                  options={[0,1,2,3,5,7,10,15].map(n => ({ value: String(n), label: n === 0 ? "Fresh Graduate" : `${n}+ years` }))}
                  onChange={v => setPersonal(p => ({ ...p, yearsExperience: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Current City" value={personal.currentCity}
                  onChange={e => setPersonal(p => ({ ...p, currentCity: e.target.value }))} />
                <FormSelect label="Country" value={personal.currentCountry} options={ALL_COUNTRIES}
                  onChange={v => setPersonal(p => ({ ...p, currentCountry: v }))} />
              </div>
            </>
          )}

          {/* Step 1 — Career */}
          {step === 1 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Career Preferences</h2>
                <button onClick={getAISuggestion} disabled={!personal.headline || aiSuggesting}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50">
                  {aiSuggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI Suggest
                </button>
              </div>
              {aiInsight && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground">
                  {aiInsight}
                </div>
              )}
              <FormMultiSelect label="Target Industries" value={career.industries}
                options={INDUSTRIES_OPTIONS}
                onChange={v => setCareer(c => ({ ...c, industries: v }))} maxSelections={4} />
              <FormMultiSelect label="Target Countries" value={career.targetCountries}
                options={GCC_COUNTRIES}
                onChange={v => setCareer(c => ({ ...c, targetCountries: v }))} maxSelections={3} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Minimum Salary" type="number" value={career.salaryMin}
                  onChange={e => setCareer(c => ({ ...c, salaryMin: e.target.value }))} />
                <FormSelect label="Availability" value={career.availableIn} options={AVAILABLE_IN}
                  onChange={v => setCareer(c => ({ ...c, availableIn: v }))} />
              </div>
            </>
          )}

          {/* Step 2 — Skills */}
          {step === 2 && (
            <>
              <h2 className="text-base font-semibold">Skills & Education</h2>
              <FormMultiSelect label="Key Skills" value={skills.skills}
                options={COMMON_SKILLS.map(s => ({ value: s, label: s }))}
                onChange={v => setSkills(s => ({ ...s, skills: v }))} maxSelections={15} />
              <FormSelect label="Highest Education Level" value={skills.educationLevel}
                options={EDUCATION_LEVELS} onChange={v => setSkills(s => ({ ...s, educationLevel: v }))} />
            </>
          )}

          {/* Step 3 — Languages */}
          {step === 3 && (
            <>
              <h2 className="text-base font-semibold">Languages</h2>
              <FormMultiSelect label="Languages you speak" value={skills.languages}
                options={LANGUAGES} onChange={v => setSkills(s => ({ ...s, languages: v }))} maxSelections={6} />
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                <p className="font-medium text-primary">🎉 Almost done!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  After setup, our AI will match you with roles that fit your profile. You can always update your preferences later.
                </p>
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
              className="flex items-center gap-1 text-sm text-muted-foreground disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} className="btn-primary flex items-center gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Finish Setup"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
