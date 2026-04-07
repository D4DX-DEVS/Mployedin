"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Sparkles, Plus, X, ChevronDown, ChevronUp,
  Briefcase, MapPin, DollarSign, Settings2, Tags,
  Globe, Users, Eye, CheckCircle2, AlertCircle, Loader2,
  Search, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────
const JOB_CATEGORIES = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality",
  "Education", "Manufacturing", "Logistics", "Oil & Gas", "Retail",
  "Human Resources", "Sales & Marketing", "Legal", "Engineering", "Other",
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", PKR: "₨",
  AED: "د.إ", SAR: "﷼", QAR: "﷼", KWD: "KD", BHD: "BD",
  OMR: "﷼", BDT: "৳", LKR: "₨", NPR: "₨", MYR: "RM",
  SGD: "S$", IDR: "Rp", PHP: "₱", THB: "฿",
};

const SALARY_PERIODS = [
  { value: "monthly", label: "Per Month" },
  { value: "yearly", label: "Per Year" },
  { value: "lpa", label: "LPA (Lakhs Per Annum)" },
];

// ─── Types ───────────────────────────────────────────────────────
interface CountryOption {
  name: string;
  code: string;
  currencyCode: string;
  currencySymbol: string;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  location: { country: string; city: string; isRemote: boolean };
  requirements: { skills: string[]; experienceMin: number; experienceMax: number };
  salary: { min: number; max: number; currency: string; period: string; isNegotiable: boolean };
  applicationMode: "auto" | "manual";
  expiresAt: string;
  tags: string[];
  vacancies: number;
}

type FieldErrors = Partial<Record<string, string>>;

// ─── Salary formatter ─────────────────────────────────────────────
function formatSalary(value: number, currency: string, period: string): string {
  if (!value) return "—";
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  if (period === "lpa" || (currency === "INR" && value >= 100000)) {
    const l = value / 100000;
    return `${sym}${l % 1 === 0 ? l : l.toFixed(1)}L`;
  }
  if (value >= 1000) return `${sym}${(value / 1000).toFixed(0)}K`;
  return `${sym}${value.toLocaleString()}`;
}

// ─── Country search hook ─────────────────────────────────────────
function useCountrySearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/countries?q=${encodeURIComponent(query)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.countries ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { query, setQuery, results, loading };
}

// ─── Section card ─────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 bg-muted/30">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/80 block">
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function EditJobPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();

  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    category: "",
    location: { country: "", city: "", isRemote: false },
    requirements: { skills: [], experienceMin: 0, experienceMax: 5 },
    salary: { min: 0, max: 0, currency: "USD", period: "monthly", isNegotiable: false },
    applicationMode: "manual",
    expiresAt: "",
    tags: [],
    vacancies: 1,
  });

  const [skillInput, setSkillInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "publishing" | "saved" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [aiState, setAiState] = useState<"idle" | "generating" | "done">("idle");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Country search
  const countrySearch = useCountrySearch();
  const [countryDropOpen, setCountryDropOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load existing job
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) { setGlobalError("Job not found"); setLoading(false); return; }
        const { job } = await res.json();

        let loc = { country: "", city: "", isRemote: false };
        if (job.location && typeof job.location === "object") {
          loc = {
            country: job.location.country ?? "",
            city: job.location.city ?? "",
            isRemote: job.location.isRemote ?? false,
          };
        }

        setForm({
          title: job.title ?? "",
          description: job.description ?? "",
          category: job.category ?? "",
          location: loc,
          requirements: {
            skills: job.requirements?.skills ?? [],
            experienceMin: job.requirements?.experienceMin ?? 0,
            experienceMax: job.requirements?.experienceMax ?? 5,
          },
          salary: {
            min: job.salary?.min ?? 0,
            max: job.salary?.max ?? 0,
            currency: job.salary?.currency ?? "USD",
            period: job.salary?.period ?? "monthly",
            isNegotiable: job.salary?.isNegotiable ?? false,
          },
          applicationMode: job.applicationMode ?? job.workflowMode ?? "manual",
          expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split("T")[0] : "",
          tags: job.tags ?? [],
          vacancies: job.vacancies ?? 1,
        });

        // Seed country search box with the stored country name
        if (loc.country) countrySearch.setQuery(loc.country);

        document.title = `Edit: ${job.title} · MPLOYEDIN`;
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function selectCountry(c: CountryOption) {
    setField("location", { ...form.location, country: c.name });
    if (c.currencyCode && c.currencyCode.length === 3) {
      setField("salary", { ...form.salary, currency: c.currencyCode });
    }
    countrySearch.setQuery(c.name);
    setCountryDropOpen(false);
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s || form.requirements.skills.includes(s)) { setSkillInput(""); return; }
    setField("requirements", { ...form.requirements, skills: [...form.requirements.skills, s] });
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setField("requirements", { ...form.requirements, skills: form.requirements.skills.filter((s) => s !== skill) });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) { setTagInput(""); return; }
    setField("tags", [...form.tags, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setField("tags", form.tags.filter((t) => t !== tag));
  }

  function validate(forPublish = false): boolean {
    const errors: FieldErrors = {};
    if (!form.title.trim()) errors.title = "Job title is required";
    else if (form.title.trim().length < 5) errors.title = "Must be at least 5 characters";
    if (!form.description.trim()) errors.description = "Job description is required";
    else if (form.description.trim().length < 20) errors.description = "Must be at least 20 characters";
    if (forPublish && !form.location.country) errors.country = "Country is required to publish";
    if (form.salary.max > 0 && form.salary.max < form.salary.min) errors.salary = "Max salary must be ≥ min salary";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const submit = useCallback(async (publish: boolean) => {
    if (!validate(publish)) return;
    setSubmitState(publish ? "publishing" : "saving");
    setGlobalError("");

    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category || undefined,
        requirements: form.requirements,
        salary: {
          min: form.salary.min,
          max: form.salary.max,
          currency: form.salary.currency,
          period: form.salary.period,
          isNegotiable: form.salary.isNegotiable,
        },
        applicationMode: form.applicationMode,
        tags: form.tags,
        vacancies: form.vacancies,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };

      if (form.location.country.trim() && form.location.city.trim()) {
        payload.location = {
          country: form.location.country.trim(),
          city: form.location.city.trim(),
          isRemote: form.location.isRemote,
        };
      }

      if (publish) payload.status = "active";

      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSubmitState("saved");
        setTimeout(() => router.push(`/${locale}/employer/jobs/${id}`), 900);
      } else {
        const err = await res.json();
        setGlobalError(err.error ?? "Failed to update job");
        setSubmitState("error");
        setTimeout(() => setSubmitState("idle"), 3000);
      }
    } catch {
      setGlobalError("Network error. Please try again.");
      setSubmitState("error");
      setTimeout(() => setSubmitState("idle"), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, id, locale, router]);

  async function generateDescription() {
    if (!form.title.trim()) {
      setFieldErrors((p) => ({ ...p, title: "Enter a title first to generate a description" }));
      return;
    }
    setAiState("generating");
    setAiSuggestion("");
    try {
      const locationLabel = [form.location.city, form.location.country].filter(Boolean).join(", ") || "the Gulf region";
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Write a professional job description for "${form.title}" based in ${locationLabel} (${form.category || "general"} sector). ${form.requirements.skills.length ? "Required skills: " + form.requirements.skills.join(", ") + "." : ""} ${form.salary.min ? "Salary: " + formatSalary(form.salary.min, form.salary.currency, form.salary.period) + " – " + formatSalary(form.salary.max, form.salary.currency, form.salary.period) + "." : ""} Include key responsibilities, required qualifications, and what makes this role exciting. Use clear bullet points. Max 350 words.`,
          }],
          context: "employer_assist",
        }),
      });
      if (res.ok && res.body) {
        let text = "";
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
          setAiSuggestion(text);
        }
        setAiState("done");
      }
    } catch {
      setAiState("idle");
    }
  }

  if (loading) {
    return (
      <div className="page-container max-w-6xl space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border/60 bg-card h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  const sym = CURRENCY_SYMBOLS[form.salary.currency] ?? form.salary.currency + " ";
  const isSubmitting = submitState === "saving" || submitState === "publishing";

  return (
    <div className="page-container max-w-6xl">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => router.push(`/${locale}/employer/jobs/${id}`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Job
      </button>

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Edit Job Posting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Changes save as draft unless you publish.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button type="button" variant="outline" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(false)} className="min-w-[110px]">
            {submitState === "saving" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />Saving…</>
              : submitState === "saved" ? <><CheckCircle2 className="w-3.5 h-3.5 me-1.5 text-emerald-500" />Saved!</>
              : submitState === "error" ? <><AlertCircle className="w-3.5 h-3.5 me-1.5 text-destructive" />Error</>
              : "Save Draft"}
          </Button>
          <Button type="button" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(true)}
            className="min-w-[130px] bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-white shadow-sm">
            {submitState === "publishing" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />Publishing…</>
              : <><Rocket className="w-3.5 h-3.5 me-1.5" />Publish Job</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* ── Left: form ──────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ① Job Basics */}
          <Section icon={Briefcase} title="Job Basics" subtitle="Core details candidates see first">
            <Field label="Job Title" required error={fieldErrors.title} hint="Be specific — e.g. 'Senior React Developer' not 'Developer'">
              <Input
                placeholder="e.g. Senior Full Stack Developer"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                className={cn(fieldErrors.title && "border-destructive focus-visible:ring-destructive")}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Vacancies" hint="Number of open positions">
                <Input type="number" min={1} max={100} value={form.vacancies}
                  onChange={(e) => setField("vacancies", Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>
          </Section>

          {/* ② Location */}
          <Section icon={MapPin} title="Location" subtitle="Where is this role based?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Country" error={fieldErrors.country} hint="Type to search — auto-sets currency">
                <div ref={countryRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-8"
                      placeholder="Search country…"
                      value={countrySearch.query}
                      onChange={(e) => {
                        countrySearch.setQuery(e.target.value);
                        setField("location", { ...form.location, country: e.target.value });
                        setCountryDropOpen(true);
                      }}
                      onFocus={() => { if (countrySearch.query) setCountryDropOpen(true); }}
                    />
                  </div>
                  {countryDropOpen && (countrySearch.results.length > 0 || countrySearch.loading) && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                      {countrySearch.loading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Searching…
                        </div>
                      ) : (
                        countrySearch.results.map((c) => (
                          <button key={c.code} type="button" onMouseDown={() => selectCountry(c)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2">
                            <span>{c.name}</span>
                            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-mono shrink-0">{c.currencyCode}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="City / Region">
                <Input placeholder="e.g. Dubai, Bangalore, Remote"
                  value={form.location.city}
                  onChange={(e) => setField("location", { ...form.location, city: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-3 cursor-pointer w-fit">
              <div onClick={() => setField("location", { ...form.location, isRemote: !form.location.isRemote })}
                className={cn("w-9 h-5 rounded-full transition-colors relative", form.location.isRemote ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form.location.isRemote ? "translate-x-4" : "translate-x-0.5")} />
              </div>
              <span className="text-sm font-medium">Remote work available
                <span className="font-normal text-muted-foreground ms-1.5 text-xs">· Boosts applications by ~40%</span>
              </span>
            </label>
          </Section>

          {/* ③ Job Description */}
          <Section icon={Globe} title="Job Description" subtitle="Tell candidates what makes this role compelling">
            <Field label="Description" required error={fieldErrors.description}>
              <Textarea
                placeholder="Describe responsibilities, day-to-day tasks, team culture, and what success looks like in this role…"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={10}
                className={cn("resize-y text-sm", fieldErrors.description && "border-destructive")}
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className={cn("text-xs", form.description.length < 20 ? "text-destructive" : "text-muted-foreground")}>
                  {form.description.length} / 5000 characters
                </span>
                <Button type="button" size="sm" variant="outline" onClick={generateDescription}
                  disabled={aiState === "generating"} className="h-7 text-xs gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  {aiState === "generating" ? "Generating…" : "Generate with AI"}
                </Button>
              </div>
            </Field>
            {(aiState === "generating" || aiState === "done") && aiSuggestion && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> AI Suggestion
                  {aiState === "generating" && <Loader2 className="w-3 h-3 animate-spin ms-1" />}
                </p>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{aiSuggestion}</p>
                {aiState === "done" && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="h-7 text-xs" onClick={() => { setField("description", aiSuggestion); setAiState("idle"); setAiSuggestion(""); }}>
                      <CheckCircle2 className="w-3 h-3 me-1.5" /> Use this description
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAiState("idle"); setAiSuggestion(""); }}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ④ Requirements */}
          <Section icon={Users} title="Requirements" subtitle="Skills and experience needed">
            <Field label="Required Skills" hint="Press Enter or click + to add each skill">
              <div className="flex gap-2">
                <Input placeholder="e.g. React, Python, SQL…" value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                  className="flex-1" />
                <Button type="button" size="sm" variant="outline" onClick={addSkill} className="px-3">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.requirements.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.requirements.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1 text-xs">
                      {s}
                      <button type="button" onClick={() => removeSkill(s)} className="hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Experience (years)">
                <Input type="number" min={0} max={50} value={form.requirements.experienceMin}
                  onChange={(e) => setField("requirements", { ...form.requirements, experienceMin: Number(e.target.value) })} />
              </Field>
              <Field label="Max Experience (years)">
                <Input type="number" min={0} max={50} value={form.requirements.experienceMax}
                  onChange={(e) => setField("requirements", { ...form.requirements, experienceMax: Number(e.target.value) })} />
              </Field>
            </div>
          </Section>

          {/* ⑤ Compensation */}
          <Section icon={DollarSign} title="Compensation" subtitle="Salary transparency attracts 2× more applicants">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Min Salary" error={fieldErrors.salary}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{sym}</span>
                  <Input type="number" min={0} placeholder="0" value={form.salary.min || ""}
                    onChange={(e) => setField("salary", { ...form.salary, min: Number(e.target.value) })} className="pl-7" />
                </div>
              </Field>
              <Field label="Max Salary">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{sym}</span>
                  <Input type="number" min={0} placeholder="0" value={form.salary.max || ""}
                    onChange={(e) => setField("salary", { ...form.salary, max: Number(e.target.value) })} className="pl-7" />
                </div>
              </Field>
              <Field label="Currency">
                <Select value={form.salary.currency} onValueChange={(v) => setField("salary", { ...form.salary, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CURRENCY_SYMBOLS).map(([code, sym]) => (
                      <SelectItem key={code} value={code}>{sym} {code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Pay Period">
                <Select value={form.salary.period} onValueChange={(v) => setField("salary", { ...form.salary, period: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SALARY_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Negotiable?">
                <label className="flex items-center gap-3 cursor-pointer h-10">
                  <div onClick={() => setField("salary", { ...form.salary, isNegotiable: !form.salary.isNegotiable })}
                    className={cn("w-9 h-5 rounded-full transition-colors relative", form.salary.isNegotiable ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form.salary.isNegotiable ? "translate-x-4" : "translate-x-0.5")} />
                  </div>
                  <span className="text-sm">{form.salary.isNegotiable ? "Yes, negotiable" : "Fixed salary"}</span>
                </label>
              </Field>
            </div>
            {(form.salary.min > 0 || form.salary.max > 0) && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground text-xs">Candidates will see: </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {form.salary.min > 0 ? formatSalary(form.salary.min, form.salary.currency, form.salary.period) : "—"}
                  {" – "}
                  {form.salary.max > 0 ? formatSalary(form.salary.max, form.salary.currency, form.salary.period) : "—"}
                  <span className="font-normal text-xs ms-1">/ {form.salary.period === "lpa" ? "LPA" : form.salary.period}</span>
                </span>
                {form.salary.isNegotiable && <span className="text-xs text-muted-foreground ms-2">(negotiable)</span>}
              </div>
            )}
          </Section>

          {/* ⑥ Tags */}
          <Section icon={Tags} title="Tags" subtitle="Keywords that improve discoverability">
            <Field label="Tags" hint="Add relevant keywords — e.g. 'remote', 'urgent', 'growth role'">
              <div className="flex gap-2">
                <Input placeholder="Add tag and press Enter" value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  className="flex-1" />
                <Button type="button" size="sm" variant="outline" onClick={addTag} className="px-3">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1 text-xs">
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
          </Section>

          {/* ⑦ Advanced */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Advanced Settings</p>
                  <p className="text-xs text-muted-foreground font-normal">Expiry date, application mode</p>
                </div>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showAdvanced && (
              <div className="p-5 pt-0 space-y-4 border-t border-border/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  <Field label="Expiry Date" hint="Leave blank for no expiry">
                    <Input type="date" value={form.expiresAt}
                      onChange={(e) => setField("expiresAt", e.target.value)}
                      min={new Date().toISOString().split("T")[0]} />
                  </Field>
                  <Field label="Application Mode" hint="How will you review applicants?">
                    <Select value={form.applicationMode} onValueChange={(v) => setField("applicationMode", v as "auto" | "manual")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Review</SelectItem>
                        <SelectItem value="auto">Auto Match (AI)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}
          </div>

          {globalError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-start gap-2.5 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{globalError}
            </div>
          )}

          {/* Bottom CTAs */}
          <div className="flex gap-3 pb-8">
            <Button type="button" variant="outline" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(false)} className="min-w-[120px]">
              {submitState === "saving" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />Saving…</>
                : submitState === "saved" ? <><CheckCircle2 className="w-3.5 h-3.5 me-1.5 text-emerald-500" />Saved!</>
                : "Save Draft"}
            </Button>
            <Button type="button" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(true)}
              className="min-w-[140px] bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-white">
              {submitState === "publishing" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />Publishing…</>
                : <><Rocket className="w-3.5 h-3.5 me-1.5" />Publish Job</>}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(`/${locale}/employer/jobs/${id}`)}>
              Cancel
            </Button>
          </div>
        </div>

        {/* ── Right: live preview ──────────────────────────────── */}
        <div className="hidden xl:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="bg-muted/30 border-b border-border/40 px-4 py-3 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-bold text-base leading-snug">
                    {form.title || <span className="text-muted-foreground/50 font-normal text-sm">Job title…</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {[form.location.city, form.location.country].filter(Boolean).join(", ") || "Location not set"}
                    {form.location.isRemote && <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-medium">Remote</span>}
                  </p>
                </div>
                {(form.salary.min > 0 || form.salary.max > 0) && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {form.salary.min > 0 ? formatSalary(form.salary.min, form.salary.currency, form.salary.period) : "—"}
                      {" – "}
                      {form.salary.max > 0 ? formatSalary(form.salary.max, form.salary.currency, form.salary.period) : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">/ {form.salary.period === "lpa" ? "LPA" : form.salary.period}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {form.category && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{form.category}</span>}
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{form.vacancies} {form.vacancies === 1 ? "vacancy" : "vacancies"}</span>
                  {form.applicationMode === "auto" && <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium">AI Matching</span>}
                </div>
                {form.requirements.skills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {form.requirements.skills.slice(0, 8).map((s) => (
                        <span key={s} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                      {form.requirements.skills.length > 8 && <span className="text-xs text-muted-foreground">+{form.requirements.skills.length - 8} more</span>}
                    </div>
                  </div>
                )}
                {(form.requirements.experienceMin > 0 || form.requirements.experienceMax > 0) && (
                  <p className="text-xs text-muted-foreground">Experience: {form.requirements.experienceMin}–{form.requirements.experienceMax} years</p>
                )}
                {form.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">About the Role</p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5">{form.description.replace(/#+\s/g, "").replace(/\*\*/g, "")}</p>
                  </div>
                )}
                <div className="pt-1 border-t border-border/40">
                  <div className="w-full h-8 rounded-lg bg-gradient-to-r from-primary/20 to-indigo-500/20 flex items-center justify-center text-xs font-medium text-primary/70">
                    Apply Now (preview)
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">💡 Pro Tips</p>
              <ul className="space-y-1 text-amber-700 dark:text-amber-400 list-disc list-inside">
                <li>Adding salary → 2× more applies</li>
                <li>Remote option → +40% reach</li>
                <li>5+ skills → better AI matching</li>
                <li>Clear title → top search rankings</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

