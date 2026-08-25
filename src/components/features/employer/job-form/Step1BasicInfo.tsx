"use client";

import { useState, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Wifi, Sparkles, UserCog } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { getLocalizedCountryName } from "@/lib/i18n/locations";
import { cn } from "@/lib/utils";
import { JOB_CATEGORIES, COUNTRIES, EMPLOYMENT_TYPES, WORK_MODES, type JobFormValues } from "./jobFormSchema";

const CATEGORY_TRANSLATION_KEYS: Record<(typeof JOB_CATEGORIES)[number], string> = {
  Technology: "technology",
  Healthcare: "healthcare",
  Finance: "finance",
  Construction: "construction",
  Hospitality: "hospitality",
  Education: "education",
  Manufacturing: "manufacturing",
  Logistics: "logistics",
  "Oil & Gas": "oilGas",
  Retail: "retail",
  Marketing: "marketing",
  Legal: "legal",
  "Human Resources": "humanResources",
  Other: "other",
};

interface Suggestions {
  titles: string[];
  skills: string[];
  salary: { min: number; max: number; currency: string; period: string };
  experience: { min: number; max: number };
}

interface Step1BasicInfoProps {
  onSuggestionsLoaded?: (suggestions: Suggestions) => void;
}

export function Step1BasicInfo({ onSuggestionsLoaded }: Step1BasicInfoProps) {
  const t = useTranslations("employerJobForm.step1");
  const locale = useLocale();
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const title = watch("title");
  const workMode = watch("workMode");
  const category = watch("category");

  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionsListId = "job-title-suggestions";

  // Agent list for "Assign Agent" dropdown
  const [agents, setAgents] = useState<{ _id: string; name: string }[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      setLoadingAgents(true);
      try {
        const res = await fetch("/api/employers/agents");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAgents(data.agents ?? []);
        }
      } catch { /* optional field — fail silently */ }
      finally { if (!cancelled) setLoadingAgents(false); }
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, []);

  // Debounced fetch on title change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!title || title.length < 4) {
      setTitleSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setFetchingSuggestions(true);
      try {
        const params = new URLSearchParams({ q: title });
        if (category) params.set("category", category);
        const res = await fetch(`/api/jobs/suggestions?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as { suggestions: Suggestions };
          setTitleSuggestions(data.suggestions.titles ?? []);
          setSuggestions(data.suggestions);
          setShowSuggestions(true);
          onSuggestionsLoaded?.(data.suggestions);
        }
      } catch {
        // silently fail — suggestions are non-critical
      } finally {
        setFetchingSuggestions(false);
      }
    }, 600);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [title, category, onSuggestionsLoaded]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function applyTitleSuggestion(suggestedTitle: string) {
    setValue("title", suggestedTitle, { shouldValidate: true });
    setShowSuggestions(false);
  }

  function autoFillFromSuggestions() {
    if (!suggestions) return;
    // Auto-fill skills, salary and experience from suggestions
    setValue("requirements.skills", suggestions.skills.slice(0, 8), { shouldValidate: true });
    setValue("salary.min", suggestions.salary.min, { shouldValidate: true });
    setValue("salary.max", suggestions.salary.max, { shouldValidate: true });
    setValue("salary.currency", suggestions.salary.currency, { shouldValidate: true });
    setValue("salary.period", suggestions.salary.period as "monthly" | "yearly" | "lpa", { shouldValidate: true });
    setValue("requirements.experienceMin", suggestions.experience.min, { shouldValidate: true });
    setValue("requirements.experienceMax", suggestions.experience.max, { shouldValidate: true });
    setShowSuggestions(false);
    onSuggestionsLoaded?.(suggestions);
  }

  function getCountryLabel(country: (typeof COUNTRIES)[number]) {
    return getLocalizedCountryName(country, locale, {
      remoteGlobalLabel: t("countries.remoteGlobal"),
    });
  }

  function getTitleError() {
    if (!errors.title) return null;
    return title?.trim() ? t("validation.titleMin") : t("validation.titleRequired");
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 sm:space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground sm:max-w-xs">
          {suggestions
            ? t("suggestionHint")
            : t("defaultHint")}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.9fr)]">
        {/* Job Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-sm font-medium">
            {t("jobTitle")} <span className="text-destructive">*</span>
          </Label>
          <div className="relative" ref={suggestionsRef}>
            <Input
              id="title"
              {...register("title")}
              placeholder={t("jobTitlePlaceholder")}
              className={cn(errors.title && "border-destructive")}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && titleSuggestions.length > 0}
              aria-controls={titleSuggestions.length > 0 ? suggestionsListId : undefined}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "job-title-error" : undefined}
              onFocus={() => titleSuggestions.length > 0 && setShowSuggestions(true)}
            />
            {fetchingSuggestions && (
              <div className="absolute end-3 top-1/2 -translate-y-1/2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              </div>
            )}

            <AnimatePresence>
              {showSuggestions && titleSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  id={suggestionsListId}
                  role="listbox"
                  className="absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
                >
                  {suggestions && (
                    <button
                      type="button"
                      onClick={autoFillFromSuggestions}
                      className="flex w-full items-center gap-1.5 border-b border-border bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {t("autoFill")}
                    </button>
                  )}
                  <ul>
                    {titleSuggestions.map((suggestedTitle) => (
                      <li key={suggestedTitle}>
                        <button
                          type="button"
                          onClick={() => applyTitleSuggestion(suggestedTitle)}
                          role="option"
                          className="w-full px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent"
                        >
                          {suggestedTitle}
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("jobTitleHint")}
          </p>
          {errors.title && (
            <p id="job-title-error" className="mt-1 text-xs text-destructive">{getTitleError()}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("category")}</Label>
          <SearchableSelect
            options={JOB_CATEGORIES.map((categoryValue) => ({
              value: categoryValue,
              label: t(`categories.${CATEGORY_TRANSLATION_KEYS[categoryValue]}`),
            }))}
            value={category ?? ""}
            onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
            placeholder={t("categoryPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("categoryHint")}
          </p>
        </div>
      </div>

      {/* Employment Type */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{t("employmentType")} <span className="text-xs text-muted-foreground font-normal">({t("optional")})</span></Label>
        <SearchableSelect
          options={EMPLOYMENT_TYPES.map((type) => ({ value: type.value, label: t(`employmentTypes.${type.value}`) }))}
          value={watch("employmentType") ?? ""}
          onValueChange={(v) => setValue("employmentType", v as JobFormValues["employmentType"], { shouldValidate: true })}
          placeholder={t("employmentTypePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">
          {t("employmentTypeHint")}
        </p>
      </div>

      {/* Duration (for internships/contracts) */}
      <div className="space-y-1.5">
        <Label htmlFor="job-duration" className="text-sm font-medium">{t("duration")} <span className="text-xs text-muted-foreground font-normal">({t("optional")})</span></Label>
        <Input
          id="job-duration"
          {...register("duration")}
          placeholder={t("durationPlaceholder")}
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          {t("durationHint")}
        </p>
      </div>

      {/* Location */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin className="w-3.5 h-3.5" />
              {t("location")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("locationHint")}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2">
            <Wifi className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex gap-1">
              {WORK_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => {
                    setValue("workMode", mode.value as JobFormValues["workMode"], { shouldValidate: false });
                    setValue("location.isRemote", mode.value === "remote", { shouldValidate: false });
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    workMode === mode.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t(`workModes.${mode.value}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="location-country" className="text-xs text-muted-foreground">
              {t("country")} <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              id="location-country"
              options={COUNTRIES.map((country) => ({ value: country, label: getCountryLabel(country) }))}
              value={watch("location.country") ?? ""}
              aria-invalid={!!errors.location?.country}
              aria-describedby={errors.location?.country ? "location-country-error" : undefined}
              onValueChange={(v) => {
                setValue("location.country", v, { shouldValidate: true });
                // Auto-select currency based on country
                import("./jobFormSchema")
                  .then(({ COUNTRY_CURRENCY_MAP }) => {
                    const currency = COUNTRY_CURRENCY_MAP[v];
                    if (currency) {
                      setValue("salary.currency", currency, { shouldValidate: false });
                    }
                  })
                  .catch(() => {
                    // ignore auto-currency lookup failures
                  });
              }}
              placeholder={t("countryPlaceholder")}
            />
            {errors.location?.country && (
              <p id="location-country-error" className="text-xs text-destructive">{t("validation.countryRequired")}</p>
            )}
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label htmlFor="location-city" className="text-xs text-muted-foreground">
              {t("city")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location-city"
              {...register("location.city")}
              placeholder={t("cityPlaceholder")}
              className={cn(errors.location?.city && "border-destructive")}
              aria-invalid={!!errors.location?.city}
              aria-describedby={errors.location?.city ? "location-city-error" : undefined}
            />
            {errors.location?.city && (
              // Showing "City is required" for a filled-but-invalid city (e.g.
              // "12345") told the user the wrong thing. Prefer the real message.
              <p id="location-city-error" className="text-xs text-destructive">
                {errors.location.city.message ?? t("validation.cityRequired")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Assign Agent (optional) */}
      {agents.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-border/80 bg-background/60 p-4">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <UserCog className="w-3.5 h-3.5" />
            {t("assignAgent")} <span className="text-xs text-muted-foreground font-normal">({t("optional")})</span>
          </Label>
          <SearchableSelect
            options={[
              { value: "__none__", label: t("noAgent") },
              ...agents.map((agent) => ({ value: agent._id, label: agent.name })),
            ]}
            value={watch("agentId") ?? "__none__"}
            onValueChange={(value) =>
              setValue("agentId", value === "__none__" ? undefined : value, {
                shouldValidate: false,
              })
            }
            placeholder={loadingAgents ? t("loadingAgents") : t("noAgent")}
          />
          <p className="text-xs text-muted-foreground">
            {t("assignAgentHint")}
          </p>
        </div>
      )}
    </motion.div>
  );
}
