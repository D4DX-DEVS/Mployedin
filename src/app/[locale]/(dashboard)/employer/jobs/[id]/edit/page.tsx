"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Sparkles, Plus, X, ChevronDown, ChevronUp,
  Briefcase, MapPin, DollarSign, Settings2, Tags,
  Globe, Users, Eye, CheckCircle2, AlertCircle, Loader2,
  Search, Rocket, ClipboardList, GripVertical, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useJobDetail, useUpdateJob } from "@/hooks/useJobs";
import { useCountrySearch } from "@/hooks/useCountrySearch";
import type { CountryOption } from "@/hooks/useCountrySearch";
import { useTranslations } from "next-intl";

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

const WORK_MODE_OPTIONS = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

// ─── Types ───────────────────────────────────────────────────────

interface ScreeningQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";
  required: boolean;
  options: string[];
  placeholder: string;
}

const QUESTION_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Multiple Choice" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
] as const;

const NEEDS_OPTIONS = new Set(["select", "checkbox", "radio"]);

function generateQuestionId() {
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  location: { country: string; city: string; isRemote: boolean };
  requirements: { skills: string[]; preferredSkills: string[]; experienceMin: number; experienceMax: number };
  salary: { min: number; max: number; currency: string; period: string; isNegotiable: boolean };
  applicationMode: "auto" | "manual";
  expiresAt: string;
  tags: string[];
  vacancies: number;
  employmentType: string;
  workMode: string;
  duration: string;
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
  learningOutcomes: string[];
  screeningQuestions: ScreeningQuestion[];
}

type FieldErrors = Partial<Record<string, string>>;

// ─── Salary formatter ─────────────────────────────────────────────
function formatSalary(value: number, currency: string, period: string): string {
  if (!value) return "—";
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  // When period is LPA, user enters value directly in lakhs (e.g. 35 = 35L)
  if (period === "lpa") {
    return `${sym}${value % 1 === 0 ? value : value.toFixed(1)}L`;
  }
  if (currency === "INR" && value >= 100000) {
    const l = value / 100000;
    return `${sym}${l % 1 === 0 ? l : l.toFixed(1)}L`;
  }
  if (value >= 1000) return `${sym}${(value / 1000).toFixed(0)}K`;
  return `${sym}${value.toLocaleString()}`;
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

// ─── Reusable list section for edit page ──────────────────────────
function EditListSection({
  title,
  subtitle,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  subtitle: string;
  items: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 bg-muted/20">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary" className="ml-auto rounded-full px-2.5 py-0.5 text-xs">
            {items.length}
          </Badge>
        )}
      </div>
      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
            className="flex-1 text-sm"
            maxLength={500}
          />
          <Button type="button" size="sm" variant="outline" onClick={onAdd} className="px-3">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                <span className="mt-0.5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 text-foreground/90">{item}</span>
                <button type="button" onClick={() => onRemove(i)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function EditJobPage() {
  const t = useTranslations("employerJobEdit");
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();

  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    category: "",
    location: { country: "", city: "", isRemote: false },
    requirements: { skills: [], preferredSkills: [], experienceMin: 0, experienceMax: 5 },
    salary: { min: 0, max: 0, currency: "USD", period: "monthly", isNegotiable: false },
    applicationMode: "manual",
    expiresAt: "",
    tags: [],
    vacancies: 1,
    employmentType: "",
    workMode: "",
    duration: "",
    responsibilities: [],
    qualifications: [],
    benefits: [],
    learningOutcomes: [],
    screeningQuestions: [],
  });

  const [skillInput, setSkillInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [preferredSkillInput, setPreferredSkillInput] = useState("");
  const [responsibilityInput, setResponsibilityInput] = useState("");
  const [qualificationInput, setQualificationInput] = useState("");
  const [benefitInput, setBenefitInput] = useState("");
  const [learningOutcomeInput, setLearningOutcomeInput] = useState("");
  const [formLoaded, setFormLoaded] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "publishing" | "saved" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [aiState, setAiState] = useState<"idle" | "generating" | "done">("idle");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Country search
  const [countryQuery, setCountryQuery] = useState("");
  const { data: countryResults = [], isLoading: countryLoading } = useCountrySearch(countryQuery);
  const [countryDropOpen, setCountryDropOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  // Load job via React Query
  const { data: jobData, isLoading: jobLoading, isError: jobError } = useJobDetail(id);
  const updateJob = useUpdateJob();

  const loading = jobLoading || (!formLoaded && !jobError);

  // Populate form when job data arrives
  useEffect(() => {
    if (!jobData || formLoaded) return;

    const job = jobData;
    let loc = { country: "", city: "", isRemote: false };
    if (job.location && typeof job.location === "object") {
      loc = {
        country: (job.location as { country?: string }).country ?? "",
        city: (job.location as { city?: string }).city ?? "",
        isRemote: (job.location as { isRemote?: boolean }).isRemote ?? false,
      };
    }

    setForm({
      title: job.title ?? "",
      description: (job as unknown as { description?: string }).description ?? "",
      category: (job as unknown as { category?: string }).category ?? "",
      location: loc,
      requirements: {
        skills: (job.requirements as unknown as { skills?: string[] })?.skills ?? [],
        preferredSkills: (job.requirements as unknown as { preferredSkills?: string[] })?.preferredSkills ?? [],
        experienceMin: (job.requirements as unknown as { experienceMin?: number })?.experienceMin ?? 0,
        experienceMax: (job.requirements as unknown as { experienceMax?: number })?.experienceMax ?? 5,
      },
      salary: {
        min: (job.salary as unknown as { min?: number })?.min ?? 0,
        max: (job.salary as unknown as { max?: number })?.max ?? 0,
        currency: (job.salary as unknown as { currency?: string })?.currency ?? "USD",
        period: (job.salary as unknown as { period?: string })?.period ?? "monthly",
        isNegotiable: (job.salary as unknown as { isNegotiable?: boolean })?.isNegotiable ?? false,
      },
      applicationMode: (job as unknown as { applicationMode?: string }).applicationMode as "auto" | "manual" ?? (job as unknown as { workflowMode?: string }).workflowMode as "auto" | "manual" ?? "manual",
      expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split("T")[0] : "",
      tags: (job as unknown as { tags?: string[] }).tags ?? [],
      vacancies: (job as unknown as { vacancies?: number }).vacancies ?? 1,
      employmentType: (job as unknown as { employmentType?: string }).employmentType ?? "",
      workMode: (job as unknown as { workMode?: string }).workMode ?? "",
      duration: (job as unknown as { duration?: string }).duration ?? "",
      responsibilities: (job as unknown as { responsibilities?: string[] }).responsibilities ?? [],
      qualifications: (job as unknown as { qualifications?: string[] }).qualifications ?? [],
      benefits: (job as unknown as { benefits?: string[] }).benefits ?? [],
      learningOutcomes: (job as unknown as { learningOutcomes?: string[] }).learningOutcomes ?? [],
      screeningQuestions: ((job as unknown as { screeningQuestions?: ScreeningQuestion[] }).screeningQuestions ?? []).map((q) => ({
        id: q.id || generateQuestionId(),
        label: q.label || "",
        type: q.type || "text",
        required: q.required ?? false,
        options: q.options ?? [],
        placeholder: q.placeholder || "",
      })),
    });

    if (loc.country) setCountryQuery(loc.country);
    document.title = `Edit: ${job.title} · MPLOYEDIN`;
    setFormLoaded(true);
  }, [jobData, formLoaded]);

  // Show error if job not found
  useEffect(() => {
    if (jobError) setGlobalError(t("jobNotFound"));
  }, [jobError]);

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

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function selectCountry(c: CountryOption) {
    setField("location", { ...form.location, country: c.name });
    if (c.currencyCode && c.currencyCode.length === 3) {
      setField("salary", { ...form.salary, currency: c.currencyCode });
    }
    setCountryQuery(c.name);
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
    const val = tagInput.trim();
    if (!val || form.tags.includes(val)) { setTagInput(""); return; }
    setField("tags", [...form.tags, val]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setField("tags", form.tags.filter((tg) => tg !== tag));
  }

  function addPreferredSkill() {
    const s = preferredSkillInput.trim();
    if (!s || form.requirements.preferredSkills.includes(s)) { setPreferredSkillInput(""); return; }
    setField("requirements", { ...form.requirements, preferredSkills: [...form.requirements.preferredSkills, s] });
    setPreferredSkillInput("");
  }

  function removePreferredSkill(skill: string) {
    setField("requirements", { ...form.requirements, preferredSkills: form.requirements.preferredSkills.filter((s) => s !== skill) });
  }

  function addListItem(field: "responsibilities" | "qualifications" | "benefits" | "learningOutcomes", value: string, setter: (v: string) => void) {
    const trimmed = value.trim();
    if (!trimmed || form[field].includes(trimmed)) { setter(""); return; }
    setField(field, [...form[field], trimmed]);
    setter("");
  }

  function removeListItem(field: "responsibilities" | "qualifications" | "benefits" | "learningOutcomes", index: number) {
    setField(field, form[field].filter((_, i) => i !== index));
  }

  function validate(forPublish = false): boolean {
    const errors: FieldErrors = {};
    if (!form.title.trim()) errors.title = t("errorTitleRequired");
    else if (form.title.trim().length < 5) errors.title = t("errorTitleLength");
    if (!form.description.trim()) errors.description = t("errorDescRequired");
    else if (form.description.trim().length < 20) errors.description = t("errorDescLength");
    if (forPublish && !form.location.country) errors.country = t("errorCountry");
    if (form.salary.max > 0 && form.salary.max < form.salary.min) errors.salary = t("errorSalary");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const submit = useCallback(async (publish: boolean) => {
    if (!validate(publish)) return;
    setSubmitState(publish ? "publishing" : "saving");
    setGlobalError("");

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
      employmentType: form.employmentType || undefined,
      workMode: form.workMode || undefined,
      duration: form.duration || undefined,
      responsibilities: form.responsibilities.length > 0 ? form.responsibilities : undefined,
      qualifications: form.qualifications.length > 0 ? form.qualifications : undefined,
      benefits: form.benefits.length > 0 ? form.benefits : undefined,
      learningOutcomes: form.learningOutcomes.length > 0 ? form.learningOutcomes : undefined,
      screeningQuestions: form.screeningQuestions.length > 0
        ? form.screeningQuestions.map((q, i) => ({ ...q, order: i }))
        : [],
    };

    if (form.location.country.trim() && form.location.city.trim()) {
      payload.location = {
        country: form.location.country.trim(),
        city: form.location.city.trim(),
        isRemote: form.workMode === "remote",
      };
    }

    if (publish) payload.status = "active";

    try {
      await updateJob.mutateAsync({ jobId: id, updates: payload });
      setSubmitState("saved");
      setTimeout(() => router.push(`/${locale}/employer/jobs/${id}`), 900);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed to update job");
      setSubmitState("error");
      setTimeout(() => setSubmitState("idle"), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, id, locale, router, updateJob]);

  async function generateDescription() {
    if (!form.title.trim()) {
      setFieldErrors((p) => ({ ...p, title: t("errorAiTitle") }));
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
        {t("backToJob")}
      </button>

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("description")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button type="button" variant="outline" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(false)} className="min-w-[110px]">
            {submitState === "saving" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{t("saving")}</>
              : submitState === "saved" ? <><CheckCircle2 className="w-3.5 h-3.5 me-1.5 text-emerald-500" />{t("saved")}</>
              : submitState === "error" ? <><AlertCircle className="w-3.5 h-3.5 me-1.5 text-destructive" />{t("error")}</>
              : t("saveDraft")}
          </Button>
          <Button type="button" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(true)}
            className="min-w-[130px] bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-white shadow-sm">
            {submitState === "publishing" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{t("publishing")}</>
              : <><Rocket className="w-3.5 h-3.5 me-1.5" />{t("publish")}</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* ── Left: form ──────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ① Job Basics */}
          <Section icon={Briefcase} title={t("basics")} subtitle={t("basicsDesc")}>
            <Field label={t("jobTitle")} required error={fieldErrors.title} hint={t("hintTitle")}>
              <Input
                placeholder={t("placeholderTitle")}
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                className={cn(fieldErrors.title && "border-destructive focus-visible:ring-destructive")}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("category")}>
                <SearchableSelect
                  options={JOB_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
                  value={form.category}
                  onValueChange={(v) => setField("category", v)}
                  placeholder={t("placeholderCategory")}
                />
              </Field>
              <Field label={t("vacanciesLabel")} hint={t("hintVacancies")}>
                <Input type="number" min={1} max={100} value={form.vacancies}
                  onChange={(e) => setField("vacancies", Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>
            <Field label={t("employmentType")} hint={t("hintType")}>
              <SearchableSelect
                options={[
                  { value: "full_time", label: t("fullTime") },
                  { value: "part_time", label: t("partTime") },
                  { value: "contract", label: t("contract") },
                  { value: "internship", label: t("internship") },
                  { value: "freelance", label: t("freelance") },
                ]}
                value={form.employmentType}
                onValueChange={(v) => setField("employmentType", v)}
                placeholder={t("placeholderType")}
              />
            </Field>
            <Field label={t("duration")} hint={t("hintDuration")}>
              <Input
                placeholder={t("placeholderDuration")}
                value={form.duration}
                onChange={(e) => setField("duration", e.target.value)}
                maxLength={100}
              />
            </Field>
          </Section>

          {/* ② Location */}
          <Section icon={MapPin} title={t("locationSection")} subtitle={t("locationDesc")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("country")} error={fieldErrors.country} hint={t("hintCountry")}>
                <div ref={countryRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-8"
                      placeholder={t("placeholderCountry")}
                      value={countryQuery}
                      onChange={(e) => {
                        setCountryQuery(e.target.value);
                        setField("location", { ...form.location, country: e.target.value });
                        setCountryDropOpen(true);
                      }}
                      onFocus={() => { if (countryQuery) setCountryDropOpen(true); }}
                    />
                  </div>
                  {countryDropOpen && (countryResults.length > 0 || countryLoading) && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                      {countryLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> {t("searching")}
                        </div>
                      ) : (
                        countryResults.map((c) => (
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
              <Field label={t("city")}>
                <Input placeholder={t("placeholderCity")}
                  value={form.location.city}
                  onChange={(e) => setField("location", { ...form.location, city: e.target.value })} />
              </Field>
            </div>
            <Field label={t("workMode")} hint={t("workModeHint")}>
              <div className="flex gap-1.5">
                {WORK_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => {
                      setField("workMode", mode.value);
                      setField("location", { ...form.location, isRemote: mode.value === "remote" });
                    }}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-medium transition-colors",
                      form.workMode === mode.value
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {mode.value === "onsite" ? t("onSite") : mode.value === "hybrid" ? t("hybridMode") : t("remote")}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* ③ Job Description */}
          <Section icon={Globe} title={t("descriptionSection")} subtitle={t("descriptionDesc")}>
            <Field label={t("descriptionField")} required error={fieldErrors.description}>
              <Textarea
                placeholder={t("placeholderDesc")}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={10}
                className={cn("resize-y text-sm", fieldErrors.description && "border-destructive")}
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className={cn("text-xs", form.description.length < 20 ? "text-destructive" : "text-muted-foreground")}>
                  {t("charCount", { count: form.description.length })}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={generateDescription}
                  disabled={aiState === "generating"} className="h-7 text-xs gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  {aiState === "generating" ? t("generating") : t("generateAi")}
                </Button>
              </div>
            </Field>
            {(aiState === "generating" || aiState === "done") && aiSuggestion && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> {t("aiSuggestion")}
                  {aiState === "generating" && <Loader2 className="w-3 h-3 animate-spin ms-1" />}
                </p>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{aiSuggestion}</p>
                {aiState === "done" && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="h-7 text-xs" onClick={() => { setField("description", aiSuggestion); setAiState("idle"); setAiSuggestion(""); }}>
                      <CheckCircle2 className="w-3 h-3 me-1.5" /> {t("useDescription")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAiState("idle"); setAiSuggestion(""); }}>
                      {t("dismiss")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ④ Requirements */}
          <Section icon={Users} title={t("requirementsSection")} subtitle={t("requirementsDesc")}>
            <Field label={t("requiredSkills")} hint={t("hintSkills")}>
              <div className="flex gap-2">
                <Input placeholder={t("placeholderRequired")} value={skillInput}
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
            <Field label={t("preferredSkills")} hint={t("hintPreferred")}>
              <div className="flex gap-2">
                <Input placeholder={t("placeholderPreferred")} value={preferredSkillInput}
                  onChange={(e) => setPreferredSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPreferredSkill(); } }}
                  className="flex-1" />
                <Button type="button" size="sm" variant="outline" onClick={addPreferredSkill} className="px-3">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.requirements.preferredSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.requirements.preferredSkills.map((s) => (
                    <Badge key={s} variant="outline" className="gap-1 text-xs border-dashed">
                      {s}
                      <button type="button" onClick={() => removePreferredSkill(s)} className="hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("minExp")}>
                <Input type="number" min={0} max={50} value={form.requirements.experienceMin}
                  onChange={(e) => setField("requirements", { ...form.requirements, experienceMin: Number(e.target.value) })} />
              </Field>
              <Field label={t("maxExp")}>
                <Input type="number" min={0} max={50} value={form.requirements.experienceMax}
                  onChange={(e) => setField("requirements", { ...form.requirements, experienceMax: Number(e.target.value) })} />
              </Field>
            </div>
          </Section>

          {/* ④b Key Responsibilities (optional) */}
          <EditListSection
            title={t("responsibilities")}
            subtitle={t("responsibilitiesHint")}
            items={form.responsibilities}
            inputValue={responsibilityInput}
            onInputChange={setResponsibilityInput}
            onAdd={() => addListItem("responsibilities", responsibilityInput, setResponsibilityInput)}
            onRemove={(i) => removeListItem("responsibilities", i)}
            placeholder={t("responsibilityPlaceholder")}
          />

          {/* ④c Qualifications (optional) */}
          <EditListSection
            title={t("qualifications")}
            subtitle={t("qualificationsHint")}
            items={form.qualifications}
            inputValue={qualificationInput}
            onInputChange={setQualificationInput}
            onAdd={() => addListItem("qualifications", qualificationInput, setQualificationInput)}
            onRemove={(i) => removeListItem("qualifications", i)}
            placeholder={t("qualificationPlaceholder")}
          />

          {/* ④d Benefits (optional) */}
          <EditListSection
            title={t("benefits")}
            subtitle={t("benefitsHint")}
            items={form.benefits}
            inputValue={benefitInput}
            onInputChange={setBenefitInput}
            onAdd={() => addListItem("benefits", benefitInput, setBenefitInput)}
            onRemove={(i) => removeListItem("benefits", i)}
            placeholder={t("benefitPlaceholder")}
          />

          {/* ④e What You Will Learn (optional) */}
          <EditListSection
            title={t("whatYouLearn")}
            subtitle={t("whatYouLearnHint")}
            items={form.learningOutcomes}
            inputValue={learningOutcomeInput}
            onInputChange={setLearningOutcomeInput}
            onAdd={() => addListItem("learningOutcomes", learningOutcomeInput, setLearningOutcomeInput)}
            onRemove={(i) => removeListItem("learningOutcomes", i)}
            placeholder={t("learnPlaceholder")}
          />

          {/* ⑤ Compensation */}
          <Section icon={DollarSign} title={t("compensationSection")} subtitle={t("compensationDesc")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("minSalary")} error={fieldErrors.salary}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{sym}</span>
                  <Input type="number" min={0} placeholder="0" value={form.salary.min || ""}
                    onChange={(e) => setField("salary", { ...form.salary, min: Number(e.target.value) })} className="pl-7" />
                </div>
              </Field>
              <Field label={t("maxSalary")}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{sym}</span>
                  <Input type="number" min={0} placeholder="0" value={form.salary.max || ""}
                    onChange={(e) => setField("salary", { ...form.salary, max: Number(e.target.value) })} className="pl-7" />
                </div>
              </Field>
              <Field label={t("currency")}>
                <SearchableSelect
                  options={Object.entries(CURRENCY_SYMBOLS).map(([code, sym]) => ({ value: code, label: `${sym} ${code}` }))}
                  value={form.salary.currency}
                  onValueChange={(v) => setField("salary", { ...form.salary, currency: v })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("payPeriod")}>
                <SearchableSelect
                  options={[
                    { value: "monthly", label: t("perMonth") },
                    { value: "yearly", label: t("perYear") },
                    { value: "lpa", label: t("lpa") },
                  ]}
                  value={form.salary.period}
                  onValueChange={(v) => setField("salary", { ...form.salary, period: v })}
                />
              </Field>
              <Field label={t("negotiableQ")}>
                <label className="flex items-center gap-3 cursor-pointer h-10">
                  <div onClick={() => setField("salary", { ...form.salary, isNegotiable: !form.salary.isNegotiable })}
                    className={cn("w-9 h-5 rounded-full transition-colors relative", form.salary.isNegotiable ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form.salary.isNegotiable ? "translate-x-4" : "translate-x-0.5")} />
                  </div>
                  <span className="text-sm">{form.salary.isNegotiable ? t("negotiableYes") : t("fixedSalary")}</span>
                </label>
              </Field>
            </div>
            {(form.salary.min > 0 || form.salary.max > 0) && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground text-xs">{t("salaryPreview")} </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {form.salary.min > 0 ? formatSalary(form.salary.min, form.salary.currency, form.salary.period) : "—"}
                  {" – "}
                  {form.salary.max > 0 ? formatSalary(form.salary.max, form.salary.currency, form.salary.period) : "—"}
                  <span className="font-normal text-xs ms-1">{t("perPeriod", { period: form.salary.period === "lpa" ? "LPA" : form.salary.period })}</span>
                </span>
                {form.salary.isNegotiable && <span className="text-xs text-muted-foreground ms-2">({t("negotiableYes")})</span>}
              </div>
            )}
          </Section>

          {/* ⑥ Tags */}
          <Section icon={Tags} title={t("tagsSection")} subtitle={t("tagsDesc")}>
            <Field label={t("tagsField")} hint={t("hintTags")}>
              <div className="flex gap-2">
                <Input placeholder={t("placeholderTag")} value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  className="flex-1" />
                <Button type="button" size="sm" variant="outline" onClick={addTag} className="px-3">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="gap-1 text-xs">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
          </Section>

          {/* ⑥b Screening Questions */}
          <Section icon={ClipboardList} title={t("screeningSection")} subtitle={t("screeningDesc")}>
            {form.screeningQuestions.map((q, qIdx) => (
              <div key={q.id} className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder={t("placeholderQuestion")}
                        value={q.label}
                        onChange={(e) => {
                          const updated = [...form.screeningQuestions];
                          updated[qIdx] = { ...updated[qIdx], label: e.target.value };
                          setField("screeningQuestions", updated);
                        }}
                        className="flex-1 text-sm"
                        maxLength={500}
                      />
                      <button
                        type="button"
                        onClick={() => setField("screeningQuestions", form.screeningQuestions.filter((_, i) => i !== qIdx))}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={q.type}
                        onValueChange={(value) => {
                          const updated = [...form.screeningQuestions];
                          updated[qIdx] = { ...updated[qIdx], type: value as ScreeningQuestion["type"], options: NEEDS_OPTIONS.has(value) ? (updated[qIdx].options.length ? updated[qIdx].options : [""]) : [] };
                          setField("screeningQuestions", updated);
                        }}
                      >
                        <SelectTrigger aria-label={t("questionTypeLabel")} className="h-8 w-auto gap-1 px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: "text", label: t("shortText") },
                            { value: "textarea", label: t("longText") },
                            { value: "select", label: t("dropdown") },
                            { value: "checkbox", label: t("checkbox") },
                            { value: "radio", label: t("multipleChoice") },
                            { value: "number", label: t("number") },
                            { value: "date", label: t("dateType") },
                          ].map((qt) => (
                            <SelectItem key={qt.value} value={qt.value}>{qt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) => {
                            const updated = [...form.screeningQuestions];
                            updated[qIdx] = { ...updated[qIdx], required: e.target.checked };
                            setField("screeningQuestions", updated);
                          }}
                          className="rounded border-border"
                        />
                        {t("required")}
                      </label>
                      {qIdx > 0 && (
                        <button type="button" onClick={() => {
                          const updated = [...form.screeningQuestions];
                          [updated[qIdx - 1], updated[qIdx]] = [updated[qIdx], updated[qIdx - 1]];
                          setField("screeningQuestions", updated);
                        }} className="p-1 text-muted-foreground hover:text-foreground">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {qIdx < form.screeningQuestions.length - 1 && (
                        <button type="button" onClick={() => {
                          const updated = [...form.screeningQuestions];
                          [updated[qIdx], updated[qIdx + 1]] = [updated[qIdx + 1], updated[qIdx]];
                          setField("screeningQuestions", updated);
                        }} className="p-1 text-muted-foreground hover:text-foreground">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {NEEDS_OPTIONS.has(q.type) && (
                      <div className="space-y-1.5 pl-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("options")}</p>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-1.5">
                            <Input
                              placeholder={`Option ${optIdx + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const updated = [...form.screeningQuestions];
                                const newOpts = [...updated[qIdx].options];
                                newOpts[optIdx] = e.target.value;
                                updated[qIdx] = { ...updated[qIdx], options: newOpts };
                                setField("screeningQuestions", updated);
                              }}
                              className="flex-1 h-8 text-xs"
                              maxLength={200}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...form.screeningQuestions];
                                updated[qIdx] = { ...updated[qIdx], options: updated[qIdx].options.filter((_, i) => i !== optIdx) };
                                setField("screeningQuestions", updated);
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {q.options.length < 20 && (
                          <Button
                            type="button" size="sm" variant="ghost"
                            onClick={() => {
                              const updated = [...form.screeningQuestions];
                              updated[qIdx] = { ...updated[qIdx], options: [...updated[qIdx].options, ""] };
                              setField("screeningQuestions", updated);
                            }}
                            className="h-7 text-xs gap-1 text-primary"
                          >
                            <Plus className="w-3 h-3" /> {t("addOption")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {form.screeningQuestions.length < 20 && (
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setField("screeningQuestions", [
                  ...form.screeningQuestions,
                  { id: generateQuestionId(), label: "", type: "text", required: false, options: [], placeholder: "" },
                ])}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> {t("addQuestion")}
              </Button>
            )}
            {form.screeningQuestions.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noQuestions")}</p>
            )}
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
                  <p className="text-sm font-semibold">{t("advancedSection")}</p>
                  <p className="text-xs text-muted-foreground font-normal">{t("advancedDesc")}</p>
                </div>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showAdvanced && (
              <div className="p-5 pt-0 space-y-4 border-t border-border/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  <Field label={t("expiryDate")} hint={t("hintExpiry")}>
                    <Input type="date" value={form.expiresAt}
                      onChange={(e) => setField("expiresAt", e.target.value)}
                      min={new Date().toISOString().split("T")[0]} />
                  </Field>
                  <Field label={t("applicationMode")} hint={t("hintAppMode")}>
                    <SearchableSelect
                      options={[
                        { value: "manual", label: t("manualReview") },
                        { value: "auto", label: t("autoMatch") },
                      ]}
                      value={form.applicationMode}
                      onValueChange={(v) => setField("applicationMode", v as "auto" | "manual")}
                    />
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
              {submitState === "saving" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{t("saving")}</>
                : submitState === "saved" ? <><CheckCircle2 className="w-3.5 h-3.5 me-1.5 text-emerald-500" />{t("saved")}</>
                : t("saveDraft")}
            </Button>
            <Button type="button" disabled={isSubmitting || submitState === "saved"} onClick={() => submit(true)}
              className="min-w-[140px] bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-white">
              {submitState === "publishing" ? <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{t("publishing")}</>
                : <><Rocket className="w-3.5 h-3.5 me-1.5" />{t("publish")}</>}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(`/${locale}/employer/jobs/${id}`)}>
              {t("cancel")}
            </Button>
          </div>
        </div>

        {/* ── Right: live preview ──────────────────────────────── */}
        <div className="hidden xl:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="bg-muted/30 border-b border-border/40 px-4 py-3 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("livePreview")}</p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-bold text-base leading-snug">
                    {form.title || <span className="text-muted-foreground/50 font-normal text-sm">{t("previewTitle")}</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {[form.location.city, form.location.country].filter(Boolean).join(", ") || t("locationNotSet")}
                    {form.workMode && <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                      form.workMode === "remote" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : form.workMode === "hybrid" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    )}>{form.workMode === "onsite" ? t("onSite") : form.workMode === "hybrid" ? t("hybridMode") : t("remote")}</span>}
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
                    <span className="text-xs text-muted-foreground">{t("perPeriod", { period: form.salary.period === "lpa" ? "LPA" : form.salary.period })}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {form.category && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{form.category}</span>}
                  {form.employmentType && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">{form.employmentType === "full_time" ? t("fullTime") : form.employmentType === "part_time" ? t("partTime") : form.employmentType === "contract" ? t("contract") : form.employmentType === "internship" ? t("internship") : t("freelance")}</span>}
                  {form.duration && <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">{form.duration}</span>}
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{form.vacancies} {form.vacancies === 1 ? "vacancy" : "vacancies"}</span>
                  {form.applicationMode === "auto" && <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium">{t("aiMatching")}</span>}
                </div>
                {form.requirements.skills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t("skillsPreview")}</p>
                    <div className="flex flex-wrap gap-1">
                      {form.requirements.skills.slice(0, 8).map((s) => (
                        <span key={s} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                      {form.requirements.skills.length > 8 && <span className="text-xs text-muted-foreground">+{form.requirements.skills.length - 8} more</span>}
                    </div>
                  </div>
                )}
                {form.requirements.preferredSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t("niceToHave")}</p>
                    <div className="flex flex-wrap gap-1">
                      {form.requirements.preferredSkills.slice(0, 6).map((s) => (
                        <span key={s} className="text-xs bg-secondary/50 text-secondary-foreground/70 px-2 py-0.5 rounded-full border border-dashed border-border">{s}</span>
                      ))}
                      {form.requirements.preferredSkills.length > 6 && <span className="text-xs text-muted-foreground">+{form.requirements.preferredSkills.length - 6} more</span>}
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

