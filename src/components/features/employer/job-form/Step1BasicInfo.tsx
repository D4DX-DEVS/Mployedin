"use client";

import { useState, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Wifi, ChevronDown, Sparkles, UserCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, category]);

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
      className="space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Start with the essentials — we&apos;ll help you fill in the rest.
        </p>
      </div>

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
            onFocus={() => titleSuggestions.length > 0 && setShowSuggestions(true)}
          />
          {fetchingSuggestions && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            </div>
          )}

          {/* Suggestions dropdown */}
          <AnimatePresence>
            {showSuggestions && titleSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
              >
                {/* Auto-fill banner */}
                {suggestions && (
                  <button
                    type="button"
                    onClick={autoFillFromSuggestions}
                    className="w-full px-3 py-2 bg-primary/5 border-b border-border text-xs font-medium text-primary flex items-center gap-1.5 hover:bg-primary/10 transition-colors"
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
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors"
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
        {errors.title && (
          <p className="text-xs text-destructive mt-1">{errors.title.message}</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Category</Label>
        <Select
          value={category ?? ""}
          onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a job category" />
          </SelectTrigger>
          <SelectContent>
            {JOB_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div className="space-y-3">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Location
        </Label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="location-country" className="text-xs text-muted-foreground">
              Country <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("location.country") ?? ""}
              onValueChange={(v) => {
                setValue("location.country", v, { shouldValidate: true });
                // Auto-select currency based on country
                import("./jobFormSchema").then(({ COUNTRY_CURRENCY_MAP }) => {
                  const currency = COUNTRY_CURRENCY_MAP[v];
                  if (currency) {
                    setValue("salary.currency", currency, { shouldValidate: false });
                  }
                });
              }}
            >
              <SelectTrigger id="location-country">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {/* Remote toggle */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
          <Wifi className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Remote Work Available</p>
            <p className="text-xs text-muted-foreground">Candidates can work remotely</p>
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

      {/* Assign Agent (optional) */}
      {agents.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <UserCog className="w-3.5 h-3.5" />
            Assign Agent <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select
            value={watch("agentId") ?? ""}
            onValueChange={(v) => setValue("agentId", v || undefined, { shouldValidate: false })}
          >
            <SelectTrigger>
              <SelectValue placeholder="No agent — self-manage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No agent — self-manage</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Assigning an agent routes this job through the approval workflow before going live.
          </p>
        </div>
      )}
    </motion.div>
  );
}
