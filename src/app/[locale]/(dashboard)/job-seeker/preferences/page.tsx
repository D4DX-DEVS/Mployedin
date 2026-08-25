"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TagAutocomplete } from "@/components/ui/tag-autocomplete";
import {
  Target,
  MapPin,
  DollarSign,
  Briefcase,
  Clock,
  Loader2,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Zap,
  Building2,
  ChevronRight,
} from "lucide-react";
import { formatLocalizedLocation } from "@/lib/i18n/locations";

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

function computeMatchScore(prefs: PreferencesData, translate?: (key: string, values?: Record<string, string | number>) => string): {
  score: number;
  tips: MatchTip[];
} {
  const tip = (key: string, values?: Record<string, string | number>) => translate?.(`tips.${key}`, values) ?? key;
  const tips: MatchTip[] = [];
  let score = 0;

  if (prefs.preferredRoles.length >= 1) {
    score += 25;
    if (prefs.preferredRoles.length >= 3) score += 10;
    else tips.push({ text: tip("addMoreRoles", { count: 3 - prefs.preferredRoles.length }), points: 10 });
  } else {
    tips.push({ text: tip("addPreferredRole"), points: 35 });
  }

  if (prefs.preferredCountries.length >= 1) {
    score += 20;
  } else {
    tips.push({ text: tip("addLocations"), points: 20 });
  }

  if (prefs.preferredSalary.min > 0 && prefs.preferredSalary.max > 0) {
    score += 20;
  } else if (prefs.preferredSalary.min > 0 || prefs.preferredSalary.max > 0) {
    score += 10;
    tips.push({ text: tip("setBothSalary"), points: 10 });
  } else {
    tips.push({ text: tip("setSalary"), points: 20 });
  }

  if (prefs.preferredJobType !== "any") {
    score += 15;
  } else {
    tips.push({ text: tip("specifyJobType"), points: 15 });
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
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
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

// ─── Match Score Card ─────────────────────────────────────────────────────────

function MatchScoreCard({
  prefs,
  prevScore,
}: {
  prefs: PreferencesData;
  prevScore: number | null;
}) {
  const t = useTranslations("jobSeekerExtra.preferences");
  const numberLocale = useLocale() === "ar" ? "ar-SA" : "en-US";
  const { score, tips } = useMemo(() => computeMatchScore(prefs, t), [prefs, t]);
  const scoreColor =
    score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-rose-500";
  const barColor =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-rose-500";
  const delta = prevScore !== null ? score - prevScore : null;

  return (
    <div className="min-w-0 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-col items-start gap-4 min-[420px]:flex-row min-[420px]:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("matchTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("matchDescription")}
            </p>
          </div>
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-baseline gap-1.5">
          <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
            {score.toLocaleString(numberLocale)}%
          </span>
          {delta !== null && delta !== 0 && (
            <span
              className={`text-xs font-medium ${delta > 0 ? "text-green-600" : "text-rose-500"}`}
            >
              {delta > 0 ? `+${delta.toLocaleString(numberLocale)}` : delta.toLocaleString(numberLocale)}
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
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {t("optimized")}
        </div>
      )}
    </div>
  );
}

// ─── Recommended Job Card ─────────────────────────────────────────────────────

function RecommendedJobCard({ job }: { job: RecommendedJob }) {
  const t = useTranslations("jobSeekerExtra.preferences");
  const locale = useLocale();
  const location = job.location?.isRemote
    ? t("remote")
    : formatLocalizedLocation(job.location, locale, { remoteLabel: t("remote"), fallback: "—" });
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
          {job.employerId?.companyName ?? t("companyFallback")} · {location}
          {salary && ` · ${salary}`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobPreferencesPage() {
  const t = useTranslations("jobSeekerExtra.preferences");
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
        title={t("title")}
        description={t("description")}
      />

      <div className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6">
        {/* ── Match Score Card ──────────────────────────────────────────── */}
        <MatchScoreCard prefs={prefs} prevScore={prevScore} />

        {/* ── Preferred Roles ───────────────────────────────────────────── */}
        <Section
          icon={<Target className="h-4 w-4" />}
          title={t("preferredRoles")}
          description={t("preferredRolesDescription")}
        >
          <TagAutocomplete
            type="roles"
            value={prefs.preferredRoles}
            onChange={(next) => setPrefs((p) => ({ ...p, preferredRoles: next }))}
            placeholder={t("rolesPlaceholder")}
            max={10}
          />
        </Section>

        {/* ── Preferred Locations ───────────────────────────────────────── */}
        <Section
          icon={<MapPin className="h-4 w-4" />}
          title={t("preferredLocations")}
          description={t("preferredLocationsDescription")}
        >
          <TagAutocomplete
            type="countries"
            value={prefs.preferredCountries}
            onChange={(next) => setPrefs((p) => ({ ...p, preferredCountries: next }))}
            placeholder={t("locationsPlaceholder")}
            max={10}
          />
        </Section>

        {/* ── Salary Expectations ───────────────────────────────────────── */}
        <Section
          icon={<DollarSign className="h-4 w-4" />}
          title={t("salary")}
          description={t("salaryDescription")}
        >
          {/* Quick presets */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("quickSelect")}</p>
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
          <div className="grid min-w-0 grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("minimum")}
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
                {t("maximum")}
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
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("currency")}
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
          title={t("jobType")}
          description={t("jobTypeDescription")}
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
                <span className="text-xs">{t(`jobTypes.${type.value}`)}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Availability ──────────────────────────────────────────────── */}
        <Section
          icon={<Clock className="h-4 w-4" />}
          title={t("availability")}
          description={t("availabilityDescription")}
        >
          {/* Actively looking toggle */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/50 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium leading-none">{t("activelyLooking")}</p>
              <p className="text-xs text-muted-foreground">
                {t("activelyLookingDescription")}
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
                  {t("availability")}
                </label>
                <SearchableSelect
                  className="h-9 text-sm"
                  options={AVAILABILITY_OPTIONS.filter((o) => o.value !== "not_available").map((opt) => ({ value: opt.value, label: t(`availabilityOptions.${opt.value}`) }))}
                  value={prefs.availabilityStatus}
                  onValueChange={(v) =>
                    setPrefs((p) => ({ ...p, availabilityStatus: v }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("noticePeriod")}
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

        {/* ── Save controls ───────────────────────────────────────────── */}
        <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-end gap-3">
          {saving && (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("saving")}
            </span>
          )}
          {saveState === "saved" && !saving && !isDirty && (
            <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("saved")}
            </span>
          )}
          {saveState === "error" && !saving && (
            <span className="text-sm text-destructive flex items-center gap-1.5">
              {t("failed")}
            </span>
          )}
          {isDirty && saveState !== "error" && !saving && (
            <span className="text-sm text-amber-600 flex items-center gap-1.5">
              {t("unsavedChanges")}
            </span>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              t("saveChanges")
            )}
          </Button>
        </div>

        {/* ── Recommended Jobs Preview ──────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("jobsTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("jobsDescription")}</p>
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
                {t("noMatches")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
