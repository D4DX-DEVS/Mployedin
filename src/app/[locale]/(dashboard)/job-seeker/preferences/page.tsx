"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Target,
  MapPin,
  DollarSign,
  Briefcase,
  Clock,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  Sparkles,
  TrendingUp,
  Zap,
  Building2,
  ChevronRight,
} from "lucide-react";

const CURRENCIES = ["USD", "INR", "AED", "SAR", "EGP", "KWD", "QAR", "BHD", "OMR"];

const JOB_TYPES = [
  { value: "remote", label: "Remote", emoji: "🌐" },
  { value: "hybrid", label: "Hybrid", emoji: "🔄" },
  { value: "onsite", label: "Onsite", emoji: "🏢" },
  { value: "any", label: "Any", emoji: "✨" },
];

const AVAILABILITY_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "within_month", label: "Within 1 Month" },
  { value: "within_3_months", label: "Within 3 Months" },
  { value: "not_available", label: "Not Available" },
];

const POPULAR_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Product Manager",
  "UI/UX Designer",
  "Data Analyst",
  "DevOps Engineer",
  "React Developer",
  "Mobile Developer",
  "Software Engineer",
];

const POPULAR_LOCATIONS = [
  "UAE",
  "Saudi Arabia",
  "India",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Remote",
];

const SALARY_PRESETS_BY_CURRENCY: Record<
  string,
  { label: string; min: number; max: number }[]
> = {
  USD: [
    { label: "< $3k",   min: 0,     max: 3000  },
    { label: "$3–7k",   min: 3000,  max: 7000  },
    { label: "$7–15k",  min: 7000,  max: 15000 },
    { label: "$15k+",   min: 15000, max: 0     },
  ],
  INR: [
    { label: "< ₹30k",    min: 0,      max: 30000  },
    { label: "₹30–70k",  min: 30000,  max: 70000  },
    { label: "₹70–150k", min: 70000,  max: 150000 },
    { label: "₹150k+",   min: 150000, max: 0      },
  ],
  AED: [
    { label: "< 5k",    min: 0,     max: 5000  },
    { label: "5–15k",   min: 5000,  max: 15000 },
    { label: "15–30k",  min: 15000, max: 30000 },
    { label: "30k+",    min: 30000, max: 0     },
  ],
  SAR: [
    { label: "< 5k",    min: 0,     max: 5000  },
    { label: "5–15k",   min: 5000,  max: 15000 },
    { label: "15–30k",  min: 15000, max: 30000 },
    { label: "30k+",    min: 30000, max: 0     },
  ],
  EGP: [
    { label: "< 10k",   min: 0,     max: 10000 },
    { label: "10–25k",  min: 10000, max: 25000 },
    { label: "25–50k",  min: 25000, max: 50000 },
    { label: "50k+",    min: 50000, max: 0     },
  ],
  KWD: [
    { label: "< 500",     min: 0,    max: 500  },
    { label: "500–1.5k",  min: 500,  max: 1500 },
    { label: "1.5–3k",    min: 1500, max: 3000 },
    { label: "3k+",       min: 3000, max: 0    },
  ],
  QAR: [
    { label: "< 5k",   min: 0,     max: 5000  },
    { label: "5–15k",  min: 5000,  max: 15000 },
    { label: "15–30k", min: 15000, max: 30000 },
    { label: "30k+",   min: 30000, max: 0     },
  ],
  BHD: [
    { label: "< 500",    min: 0,    max: 500  },
    { label: "500–1.5k", min: 500,  max: 1500 },
    { label: "1.5–3k",   min: 1500, max: 3000 },
    { label: "3k+",      min: 3000, max: 0    },
  ],
  OMR: [
    { label: "< 500",    min: 0,    max: 500  },
    { label: "500–1.5k", min: 500,  max: 1500 },
    { label: "1.5–3k",   min: 1500, max: 3000 },
    { label: "3k+",      min: 3000, max: 0    },
  ],
};

function getSalaryPresets(currency: string) {
  return (
    SALARY_PRESETS_BY_CURRENCY[currency] ?? SALARY_PRESETS_BY_CURRENCY["USD"]
  );
}

interface PreferencesData {
  preferredRoles: string[];
  preferredCountries: string[];
  preferredSalary: { min: number; max: number; currency: string };
  preferredJobType: string;
  availabilityStatus: string;
  noticePeriod: number;
}

interface MatchTip {
  text: string;
  points: number;
}

function computeMatchScore(prefs: PreferencesData): {
  score: number;
  tips: MatchTip[];
} {
  const tips: MatchTip[] = [];
  let score = 0;

  if (prefs.preferredRoles.length >= 1) {
    score += 25;
    if (prefs.preferredRoles.length >= 3) score += 10;
    else tips.push({ text: `Add ${3 - prefs.preferredRoles.length} more role(s)`, points: 10 });
  } else {
    tips.push({ text: "Add at least one preferred role", points: 35 });
  }

  if (prefs.preferredCountries.length >= 1) {
    score += 20;
  } else {
    tips.push({ text: "Add preferred locations", points: 20 });
  }

  if (prefs.preferredSalary.min > 0 && prefs.preferredSalary.max > 0) {
    score += 20;
  } else if (prefs.preferredSalary.min > 0 || prefs.preferredSalary.max > 0) {
    score += 10;
    tips.push({ text: "Set both min & max salary", points: 10 });
  } else {
    tips.push({ text: "Set your salary expectations", points: 20 });
  }

  if (prefs.preferredJobType !== "any") {
    score += 15;
  } else {
    tips.push({ text: "Specify a job type preference", points: 15 });
  }

  if (prefs.availabilityStatus && prefs.availabilityStatus !== "not_available") {
    score += 10;
  }

  return { score: Math.min(score, 100), tips: tips.slice(0, 3) };
}

interface RecommendedJob {
  _id: string;
  title: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
  employerId?: { companyName?: string; logo?: string };
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Smart Tag Input ──────────────────────────────────────────────────────────

function SmartTagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  suggestions,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const availableSuggestions = suggestions.filter((s) => !tags.includes(s));

  const handleAdd = (value?: string) => {
    const trimmed = (value ?? input).trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {tag}
              <button
                onClick={() => onRemove(tag)}
                className="hover:text-destructive transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="h-9 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleAdd()}
          className="h-9 px-3 shrink-0"
          disabled={!input.trim() || tags.includes(input.trim())}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Suggestions */}
      {availableSuggestions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Popular:</p>
          <div className="flex flex-wrap gap-1.5">
            {availableSuggestions.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleAdd(s)}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Match Score Card ─────────────────────────────────────────────────────────

function MatchScoreCard({
  prefs,
  prevScore,
}: {
  prefs: PreferencesData;
  prevScore: number | null;
}) {
  const { score, tips } = useMemo(() => computeMatchScore(prefs), [prefs]);
  const scoreColor =
    score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-rose-500";
  const barColor =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-rose-500";
  const delta = prevScore !== null ? score - prevScore : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Match Setup Score</p>
            <p className="text-xs text-muted-foreground">
              Complete your preferences for better job matches
            </p>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
            {score}%
          </span>
          {delta !== null && delta !== 0 && (
            <span
              className={`text-xs font-medium ${delta > 0 ? "text-green-600" : "text-rose-500"}`}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 shrink-0 text-primary" />
              <span>
                {tip.text}{" "}
                <span className="font-medium text-primary">+{tip.points}%</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {score === 100 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs font-medium text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Profile fully optimized — you&apos;re getting the best matches!
        </div>
      )}
    </div>
  );
}

// ─── Recommended Job Card ─────────────────────────────────────────────────────

function RecommendedJobCard({ job }: { job: RecommendedJob }) {
  const location = job.location?.isRemote
    ? "Remote"
    : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || "—";
  const salary =
    job.salary?.min && job.salary?.max
      ? `${job.salary.currency ?? "USD"} ${(job.salary.min / 1000).toFixed(0)}k–${(job.salary.max / 1000).toFixed(0)}k`
      : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 hover:border-primary/30 hover:shadow-sm transition-all">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {job.employerId?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.employerId.logo}
            alt={job.employerId.companyName ?? ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{job.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {job.employerId?.companyName ?? "Company"} · {location}
          {salary && ` · ${salary}`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobPreferencesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [prefs, setPrefs] = useState<PreferencesData>({
    preferredRoles: [],
    preferredCountries: [],
    preferredSalary: { min: 0, max: 0, currency: "USD" },
    preferredJobType: "any",
    availabilityStatus: "immediately",
    noticePeriod: 0,
  });
  const [savedPrefs, setSavedPrefs] = useState<PreferencesData>({
    preferredRoles: [],
    preferredCountries: [],
    preferredSalary: { min: 0, max: 0, currency: "USD" },
    preferredJobType: "any",
    availabilityStatus: "immediately",
    noticePeriod: 0,
  });
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [recommendedJobs, setRecommendedJobs] = useState<RecommendedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAFT_KEY = "job-prefs-draft";

  const isDirty = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(savedPrefs),
    [prefs, savedPrefs]
  );

  // Persist unsaved draft to sessionStorage so navigation away/back preserves it
  useEffect(() => {
    if (!loading) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(prefs));
    }
  }, [prefs, loading]);

  // Auto-save debounced — save 800ms after last change
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || !isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave();
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, loading, isDirty]);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/job-seeker/profile");
      if (res.ok) {
        const data = await res.json();
        const js = data;
        const saved: PreferencesData = {
          preferredRoles: js.preferredRoles ?? [],
          preferredCountries: js.preferredCountries ?? [],
          preferredSalary: js.preferredSalary ?? { min: 0, max: 0, currency: "USD" },
          preferredJobType: js.preferredJobType ?? "any",
          availabilityStatus: js.availabilityStatus ?? "immediately",
          noticePeriod: js.noticePeriod ?? 0,
        };
        setSavedPrefs(saved);
        // Restore any unsaved draft from sessionStorage
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          try {
            const draft = JSON.parse(raw) as PreferencesData;
            setPrefs(draft);
          } catch {
            setPrefs(saved);
          }
        } else {
          setPrefs(saved);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecommendedJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/job-seeker/recommended-jobs");
      if (res.ok) {
        const data = await res.json();
        setRecommendedJobs((data.items ?? []).slice(0, 3));
      }
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
    loadRecommendedJobs();
  }, [loadPreferences, loadRecommendedJobs]);

  const handleSave = async () => {
    setSaving(true);
    const currentScore = computeMatchScore(savedPrefs ?? prefs).score;
    try {
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setPrevScore(currentScore);
        setSavedPrefs({ ...prefs });
        sessionStorage.removeItem(DRAFT_KEY);
        setSaveState("saved");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
        // Refresh recommendations after saving
        loadRecommendedJobs();
      } else {
        setSaveState("error");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container">
        <div className="max-w-3xl mx-auto w-full space-y-5">
          <div className="h-28 rounded-xl bg-muted animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const activelyLooking = prefs.availabilityStatus !== "not_available";

  return (
    <div className="page-container">
      <PageHeader
        title="Job Preferences"
        description="Set your preferences to get better job matches and recommendations"
      />

      <div className="grid gap-6 max-w-3xl mx-auto w-full">
        {/* ── Match Score Card ──────────────────────────────────────────── */}
        <MatchScoreCard prefs={prefs} prevScore={prevScore} />

        {/* ── Preferred Roles ───────────────────────────────────────────── */}
        <Section
          icon={<Target className="h-4 w-4" />}
          title="Preferred Roles"
          description="What job titles are you looking for?"
        >
          <SmartTagInput
            tags={prefs.preferredRoles}
            onAdd={(tag) =>
              setPrefs((p) => ({ ...p, preferredRoles: [...p.preferredRoles, tag] }))
            }
            onRemove={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredRoles: p.preferredRoles.filter((r) => r !== tag),
              }))
            }
            placeholder="e.g. Frontend Developer, Product Manager…"
            suggestions={POPULAR_ROLES}
          />
        </Section>

        {/* ── Preferred Locations ───────────────────────────────────────── */}
        <Section
          icon={<MapPin className="h-4 w-4" />}
          title="Preferred Locations"
          description="Where do you want to work?"
        >
          <SmartTagInput
            tags={prefs.preferredCountries}
            onAdd={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredCountries: [...p.preferredCountries, tag],
              }))
            }
            onRemove={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredCountries: p.preferredCountries.filter((c) => c !== tag),
              }))
            }
            placeholder="e.g. UAE, Saudi Arabia, Qatar…"
            suggestions={POPULAR_LOCATIONS}
          />
        </Section>

        {/* ── Salary Expectations ───────────────────────────────────────── */}
        <Section
          icon={<DollarSign className="h-4 w-4" />}
          title="Salary Expectations"
          description="What is your expected monthly salary range?"
        >
          {/* Quick presets */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Quick select:</p>
            <div className="flex flex-wrap gap-2">
              {getSalaryPresets(prefs.preferredSalary.currency).map((preset) => {
                const active =
                  prefs.preferredSalary.min === preset.min &&
                  prefs.preferredSalary.max === preset.max;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        preferredSalary: {
                          ...p.preferredSalary,
                          min: preset.min,
                          max: preset.max,
                        },
                      }))
                    }
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual input */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Minimum
              </label>
              <Input
                type="number"
                min={0}
                value={prefs.preferredSalary.min || ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: {
                      ...p.preferredSalary,
                      min: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Maximum
              </label>
              <Input
                type="number"
                min={0}
                value={prefs.preferredSalary.max || ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: {
                      ...p.preferredSalary,
                      max: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Currency
              </label>
              <SearchableSelect
                className="h-9 text-sm"
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={prefs.preferredSalary.currency}
                onValueChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: { min: 0, max: 0, currency: v },
                  }))
                }
              />
            </div>
          </div>
        </Section>

        {/* ── Job Type ──────────────────────────────────────────────────── */}
        <Section
          icon={<Briefcase className="h-4 w-4" />}
          title="Job Type"
          description="What type of work arrangement do you prefer?"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {JOB_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() =>
                  setPrefs((p) => ({ ...p, preferredJobType: type.value }))
                }
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                  prefs.preferredJobType === type.value
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span className="text-base">{type.emoji}</span>
                <span className="text-xs">{type.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Availability ──────────────────────────────────────────────── */}
        <Section
          icon={<Clock className="h-4 w-4" />}
          title="Availability"
          description="When can you start a new role?"
        >
          {/* Actively looking toggle */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 border border-border/60">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-none">Actively Looking</p>
              <p className="text-xs text-muted-foreground">
                Signal to employers you&apos;re open to opportunities
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activelyLooking && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
              <Switch
                checked={activelyLooking}
                onCheckedChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    availabilityStatus: v ? "immediately" : "not_available",
                  }))
                }
              />
            </div>
          </div>

          {activelyLooking && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Availability
                </label>
                <SearchableSelect
                  className="h-9 text-sm"
                  options={AVAILABILITY_OPTIONS.filter((o) => o.value !== "not_available").map((opt) => ({ value: opt.value, label: opt.label }))}
                  value={prefs.availabilityStatus}
                  onValueChange={(v) =>
                    setPrefs((p) => ({ ...p, availabilityStatus: v }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Notice Period (days)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={prefs.noticePeriod || ""}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      noticePeriod: Number(e.target.value) || 0,
                    }))
                  }
                  className="h-9 text-sm"
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </Section>

        {/* ── Auto-save status ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 h-8">
          {saving && (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          )}
          {saveState === "saved" && !saving && (
            <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {saveState === "error" && !saving && (
            <span className="text-sm text-destructive flex items-center gap-1.5">
              Failed to save.
              <button onClick={handleSave} className="underline hover:no-underline">
                Retry
              </button>
            </span>
          )}
        </div>

        {/* ── Recommended Jobs Preview ──────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Jobs matching your preferences</p>
                <p className="text-xs text-muted-foreground">Based on your current setup</p>
              </div>
            </div>
          </div>

          {jobsLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : recommendedJobs.length > 0 ? (
            <div className="space-y-2">
              {recommendedJobs.map((job) => (
                <RecommendedJobCard key={job._id} job={job} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No matches yet — complete your preferences to unlock recommendations.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

