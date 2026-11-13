"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateSeekerProfile, readSeekerProfile } from "@/hooks/useSeekerCache";
import { useLocale, useTranslations } from "next-intl";
import { ProfileHubShell } from "@/components/features/job-seeker/ProfileHubShell";
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
  Building2,
  Globe,
  Shuffle,
} from "lucide-react";
import {
  preferencesFromProfile,
  validatePreferences,
  preferenceErrorsFromServer,
  MAX_NOTICE_PERIOD_DAYS,
  MAX_PREFERRED_ROLE_LENGTH,
  type PreferencesData,
  type PreferenceError,
  type PreferenceErrors,
} from "@/lib/jobSeeker/preferences";

const CURRENCIES = ["USD", "INR", "AED", "SAR", "EGP", "KWD", "QAR", "BHD", "OMR"];

const JOB_TYPES = [
  { value: "remote", label: "Remote", Icon: Globe },
  { value: "hybrid", label: "Hybrid", Icon: Shuffle },
  { value: "onsite", label: "Onsite", Icon: Building2 },
  { value: "any", label: "Any", Icon: Sparkles },
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

// ─── Section Card ─────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
  labelFor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Id of the section's single input: the title becomes its visible label. */
  labelFor?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm panel-body">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          {icon}
        </div>
        <div>
          {labelFor ? (
            <label htmlFor={labelFor} className="block text-sm font-semibold leading-tight">{title}</label>
          ) : (
            <p className="text-sm font-semibold leading-tight">{title}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Smart Tag Input ──────────────────────────────────────────────────────────

// ─── Match Score Card ─────────────────────────────────────────────────────────

// ─── Recommended Job Card ─────────────────────────────────────────────────────

/** Shortens a pasted entry so the message stays one line. */
function clip(value: string | undefined, max = 40): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobPreferencesPage() {
  const t = useTranslations("jobSeekerExtra.preferences");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<PreferenceErrors>({});
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
      // From the shared cache when fresh, so Back from Jobs/Profile is instant.
      const profile = await readSeekerProfile(queryClient).catch(() => null);
      if (profile) {
        // Normalised so the form always saves: stored profiles can hold a
        // salary with no min/max and over-long imported roles.
        const saved = preferencesFromProfile(profile);
        setSavedPrefs(saved);
        // Restore any unsaved draft from sessionStorage
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          try {
            // A draft saved before this fix can carry the same broken shape.
            setPrefs(preferencesFromProfile(JSON.parse(raw)));
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
  }, [queryClient]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Once a save has flagged fields, re-check as the seeker edits so each
  // message clears the moment its field is fixed.
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  useEffect(() => {
    if (hasFieldErrors) setFieldErrors(validatePreferences(prefs));
  }, [prefs]);

  const errorText = (error?: PreferenceError): string | undefined => {
    if (!error) return undefined;
    switch (error.code) {
      case "roleTooLong": return t("errors.roleTooLong", { value: clip(error.value), max: MAX_PREFERRED_ROLE_LENGTH });
      case "tooManyRoles": return t("errors.tooManyRoles", { max: 20 });
      case "countryTooLong": return t("errors.countryTooLong", { value: clip(error.value), max: MAX_PREFERRED_ROLE_LENGTH });
      case "tooManyCountries": return t("errors.tooManyCountries", { max: 20 });
      case "salaryNegative": return t("errors.salaryNegative");
      case "salaryOrder": return t("errors.salaryOrder");
      case "noticeRange": return t("errors.noticeRange", { max: MAX_NOTICE_PERIOD_DAYS });
      default: return t("errors.invalid");
    }
  };

  const showSaveError = (errors: PreferenceErrors) => {
    setFieldErrors(errors);
    setSaveState("error");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // A field message stays until it is fixed; only the bare failure fades.
    if (Object.keys(errors).length === 0) {
      saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const handleSave = async () => {
    const localErrors = validatePreferences(prefs);
    if (Object.keys(localErrors).length > 0) {
      showSaveError(localErrors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setFieldErrors({});
        setSavedPrefs({ ...prefs });
        sessionStorage.removeItem(DRAFT_KEY);
        void invalidateSeekerProfile(queryClient);
        setSaveState("saved");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
      } else {
        // validateBody answers 400 with the failing paths; name those fields.
        const body = res.status === 400 ? await res.json().catch(() => null) : null;
        showSaveError(preferenceErrorsFromServer(body?.details, prefs));
      }
    } catch {
      showSaveError({});
    } finally {
      setSaving(false);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ProfileHubShell locale={locale}>
        <div className="w-full space-y-5" aria-busy="true">
          <div className="h-28 rounded-xl bg-muted animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </ProfileHubShell>
    );
  }

  const activelyLooking = prefs.availabilityStatus !== "not_available";

  return (
    <ProfileHubShell locale={locale}>
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6">
        {/* ── Preferred Roles ───────────────────────────────────────────── */}
        <Section
          icon={<Target className="h-4 w-4" />}
          title={t("preferredRoles")}
          description={t("preferredRolesDescription")}
          labelFor="pref-roles"
        >
          <TagAutocomplete
            id="pref-roles"
            type="roles"
            value={prefs.preferredRoles}
            onChange={(next) => setPrefs((p) => ({ ...p, preferredRoles: next }))}
            placeholder={t("rolesPlaceholder")}
            ariaLabel={t("preferredRoles")}
            max={10}
          />
          <FieldError id="pref-roles-error" message={errorText(fieldErrors.preferredRoles)} />
        </Section>

        {/* ── Preferred Locations ───────────────────────────────────────── */}
        <Section
          icon={<MapPin className="h-4 w-4" />}
          title={t("preferredLocations")}
          description={t("preferredLocationsDescription")}
          labelFor="pref-locations"
        >
          <TagAutocomplete
            id="pref-locations"
            type="countries"
            value={prefs.preferredCountries}
            onChange={(next) => setPrefs((p) => ({ ...p, preferredCountries: next }))}
            placeholder={t("locationsPlaceholder")}
            ariaLabel={t("preferredLocations")}
            max={10}
          />
          <FieldError id="pref-locations-error" message={errorText(fieldErrors.preferredCountries)} />
          {/* Employers see this answer on your profile (rollout row 18). */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/50 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p id="pref-relocation-label" className="text-sm font-medium leading-none">{t("openToRelocation")}</p>
              <p className="text-xs text-muted-foreground">{t("openToRelocationDescription")}</p>
            </div>
            <Switch
              aria-labelledby="pref-relocation-label"
              checked={prefs.openToRelocation === true}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, openToRelocation: v }))}
            />
          </div>
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
                    aria-pressed={active}
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
              <label htmlFor="pref-salary-min" className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("minimum")}
              </label>
              <Input
                id="pref-salary-min"
                aria-invalid={fieldErrors.preferredSalary ? true : undefined}
                aria-describedby={fieldErrors.preferredSalary ? "pref-salary-error" : undefined}
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
              <label htmlFor="pref-salary-max" className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("maximum")}
              </label>
              <Input
                id="pref-salary-max"
                aria-invalid={fieldErrors.preferredSalary ? true : undefined}
                aria-describedby={fieldErrors.preferredSalary ? "pref-salary-error" : undefined}
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
              <label htmlFor="pref-salary-currency" className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("currency")}
              </label>
              <SearchableSelect
                id="pref-salary-currency"
                ariaLabel={t("currency")}
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
          <FieldError id="pref-salary-error" message={errorText(fieldErrors.preferredSalary)} />
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
                aria-pressed={prefs.preferredJobType === type.value}
                onClick={() =>
                  setPrefs((p) => ({ ...p, preferredJobType: type.value }))
                }
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                  prefs.preferredJobType === type.value
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <type.Icon className="h-5 w-5" aria-hidden="true" />
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
                aria-label={t("activelyLooking")}
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
                <label htmlFor="pref-availability" className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("availability")}
                </label>
                <SearchableSelect
                  id="pref-availability"
                  ariaLabel={t("availability")}
                  className="h-9 text-sm"
                  options={AVAILABILITY_OPTIONS.filter((o) => o.value !== "not_available").map((opt) => ({ value: opt.value, label: t(`availabilityOptions.${opt.value}`) }))}
                  value={prefs.availabilityStatus}
                  onValueChange={(v) =>
                    setPrefs((p) => ({ ...p, availabilityStatus: v }))
                  }
                />
              </div>
              <div>
                <label htmlFor="pref-notice" className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("noticePeriod")}
                </label>
                <Input
                  id="pref-notice"
                  aria-invalid={fieldErrors.noticePeriod ? true : undefined}
                  aria-describedby={fieldErrors.noticePeriod ? "pref-notice-error" : "pref-notice-hint"}
                  type="number"
                  min={0}
                  max={MAX_NOTICE_PERIOD_DAYS}
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
                {fieldErrors.noticePeriod ? (
                  <FieldError id="pref-notice-error" message={errorText(fieldErrors.noticePeriod)} />
                ) : (
                  <p id="pref-notice-hint" className="mt-1.5 text-xs text-muted-foreground">{t("noticeHint")}</p>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ── Save controls ───────────────────────────────────────────── */}
        <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-end gap-3">
          {saveState === "saved" && !saving && !isDirty && (
            <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("saved")}
            </span>
          )}
          {saveState === "error" && !saving && (
            <span className="text-sm text-destructive flex items-center gap-1.5">
              {hasFieldErrors ? t("fixErrors") : t("failed")}
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

      </div>
    </ProfileHubShell>
  );
}
