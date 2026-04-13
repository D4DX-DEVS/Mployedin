"use client";

import { useState, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Wifi, Sparkles, UserCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { JOB_CATEGORIES, COUNTRIES, type JobFormValues } from "./jobFormSchema";

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
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const title = watch("title");
  const isRemote = watch("location.isRemote");
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

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>
          <p className="text-sm text-muted-foreground">
            Start with the essentials and keep the role easy to scan.
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground sm:max-w-xs">
          {suggestions
            ? "Use a suggested title to prefill skills, salary, and experience."
            : "Clear titles and location details usually improve candidate quality first."}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.9fr)]">
        {/* Job Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-sm font-medium">
            Job Title <span className="text-destructive">*</span>
          </Label>
          <div className="relative" ref={suggestionsRef}>
            <Input
              id="title"
              {...register("title")}
              placeholder="e.g. Senior Software Engineer"
              className={cn(errors.title && "border-destructive")}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && titleSuggestions.length > 0}
              aria-controls={titleSuggestions.length > 0 ? suggestionsListId : undefined}
              onFocus={() => titleSuggestions.length > 0 && setShowSuggestions(true)}
            />
            {fetchingSuggestions && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
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
                  className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
                >
                  {suggestions && (
                    <button
                      type="button"
                      onClick={autoFillFromSuggestions}
                      className="flex w-full items-center gap-1.5 border-b border-border bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-fill skills, salary &amp; experience from AI
                    </button>
                  )}
                  <ul>
                    {titleSuggestions.map((t) => (
                      <li key={t}>
                        <button
                          type="button"
                          onClick={() => applyTitleSuggestion(t)}
                          role="option"
                          className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                        >
                          {t}
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted-foreground">
            Use the exact role candidates search for instead of internal team titles.
          </p>
          {errors.title && (
            <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Category</Label>
          <SearchableSelect
            options={JOB_CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={category ?? ""}
            onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
            placeholder="Select a job category"
          />
          <p className="text-xs text-muted-foreground">
            Pick the closest category so recommendations and benchmarks stay relevant.
          </p>
        </div>
      </div>

      {/* Location */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin className="w-3.5 h-3.5" />
              Location
            </Label>
            <p className="text-xs text-muted-foreground">
              Add the base location first, then decide whether the role can be done remotely.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5">
            <Wifi className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Remote work available</p>
              <p className="text-xs text-muted-foreground">Show this role to remote-ready applicants</p>
            </div>
            <Switch
              checked={isRemote}
              onCheckedChange={(v) =>
                setValue("location.isRemote", v, { shouldValidate: false })
              }
            />
            {isRemote && (
              <Badge variant="secondary" className="text-xs">
                Remote
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="location-country" className="text-xs text-muted-foreground">
              Country <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              id="location-country"
              options={COUNTRIES.map((c) => ({ value: c, label: c }))}
              value={watch("location.country") ?? ""}
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
              placeholder="Select country"
            />
            {errors.location?.country && (
              <p className="text-xs text-destructive">{errors.location.country.message}</p>
            )}
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label htmlFor="location-city" className="text-xs text-muted-foreground">
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location-city"
              {...register("location.city")}
              placeholder="e.g. Dubai, Pune, London"
              className={cn(errors.location?.city && "border-destructive")}
            />
            {errors.location?.city && (
              <p className="text-xs text-destructive">{errors.location.city.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Assign Agent (optional) */}
      {agents.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-border/80 bg-background/60 p-4">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <UserCog className="w-3.5 h-3.5" />
            Assign Agent <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </Label>
          <SearchableSelect
            options={[
              { value: "__none__", label: "No agent - self-manage" },
              ...agents.map((agent) => ({ value: agent._id, label: agent.name })),
            ]}
            value={watch("agentId") ?? "__none__"}
            onValueChange={(value) =>
              setValue("agentId", value === "__none__" ? undefined : value, {
                shouldValidate: false,
              })
            }
            placeholder={loadingAgents ? "Loading agents..." : "No agent - self-manage"}
          />
          <p className="text-xs text-muted-foreground">
            Assigning an agent routes this job through the approval workflow before going live.
          </p>
        </div>
      )}
    </motion.div>
  );
}
