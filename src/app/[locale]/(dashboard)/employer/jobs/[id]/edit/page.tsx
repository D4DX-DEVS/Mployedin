"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Sparkles, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

const JOB_CATEGORIES = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality",
  "Education", "Manufacturing", "Logistics", "Oil & Gas", "Retail", "Other"
];

const CURRENCIES = ["USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "EUR", "GBP"];

interface FormData {
  title: string;
  description: string;
  category: string;
  location: string;
  requirements: { skills: string[]; experienceMin: number; experienceMax: number };
  salary: { min: number; max: number; currency: string };
  applicationMode: "auto" | "manual";
  expiresAt: string;
  tags: string[];
  vacancies: number;
}

export default function EditJobPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();

  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    category: "",
    location: "",
    requirements: { skills: [], experienceMin: 0, experienceMax: 20 },
    salary: { min: 0, max: 0, currency: "USD" },
    applicationMode: "manual",
    expiresAt: "",
    tags: [],
    vacancies: 1,
  });

  const [skillInput, setSkillInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load existing job
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) { setError("Job not found"); setLoading(false); return; }
        const { job } = await res.json();

        const loc = typeof job.location === "string"
          ? job.location
          : job.location
            ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}`
            : "";

        setForm({
          title: job.title ?? "",
          description: job.description ?? "",
          category: job.category ?? "",
          location: loc,
          requirements: {
            skills: job.requirements?.skills ?? [],
            experienceMin: job.requirements?.experienceMin ?? 0,
            experienceMax: job.requirements?.experienceMax ?? 20,
          },
          salary: {
            min: job.salary?.min ?? 0,
            max: job.salary?.max ?? 0,
            currency: job.salary?.currency ?? "USD",
          },
          applicationMode: job.workflowMode ?? "manual",
          expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().split("T")[0] : "",
          tags: job.tags ?? [],
          vacancies: job.vacancies ?? 1,
        });

        document.title = `Edit: ${job.title} · MPLOYEDIN`;
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s || form.requirements.skills.includes(s)) { setSkillInput(""); return; }
    setField("requirements", { ...form.requirements, skills: [...form.requirements.skills, s] });
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setField("requirements", {
      ...form.requirements,
      skills: form.requirements.skills.filter((s) => s !== skill),
    });
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

  async function generateDescription() {
    if (!form.title) { setError("Enter a job title first"); return; }
    setAiLoading(true); setError("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Write a professional job description for: "${form.title}" in ${form.location || "the Gulf region"} (${form.category || "general"} sector). Include: key responsibilities, benefits, and required qualifications. Format with clear sections. Keep it under 400 words.`,
          context: "employer_assist",
        }),
      });
      if (res.ok && res.body) {
        let desc = "";
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          desc += decoder.decode(value);
        }
        setField("description", desc.trim());
      }
    } catch {
      setError("AI generation failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description) {
      setError("Title and description are required");
      return;
    }

    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: form.category || undefined,
          location: form.location || undefined,
          requirements: form.requirements,
          salary: form.salary,
          applicationMode: form.applicationMode,
          tags: form.tags,
          vacancies: form.vacancies,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });

      if (res.ok) {
        router.push(`/${locale}/employer/jobs/${id}`);
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed to update job");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="card-base h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/employer/jobs/${id}`)}>
          <ArrowLeft className="w-4 h-4 me-2" /> Back to Job
        </Button>
      </div>

      <PageHeader
        title="Edit Job"
        description="Update your job posting details"
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="card-base p-5 space-y-4">
          <h2 className="text-sm font-semibold">Basic Information</h2>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Job Title <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Senior Software Engineer"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
              <Input
                placeholder="e.g. Dubai, UAE"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vacancies</label>
            <Input
              type="number" min={1} max={100}
              value={form.vacancies}
              onChange={(e) => setField("vacancies", Number(e.target.value))}
              className="w-32"
            />
          </div>
        </div>

        {/* Description */}
        <div className="card-base p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Job Description <span className="text-destructive">*</span>
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={generateDescription}
              disabled={aiLoading}
            >
              <Sparkles className="w-3.5 h-3.5 me-1.5 text-primary" />
              {aiLoading ? "Generating…" : "Regenerate with AI"}
            </Button>
          </div>
          <Textarea
            placeholder="Describe the role, responsibilities, and what you're looking for…"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={10}
            required
            className="resize-y"
          />
          <p className="text-xs text-muted-foreground">{form.description.length} characters</p>
        </div>

        {/* Requirements */}
        <div className="card-base p-5 space-y-4">
          <h2 className="text-sm font-semibold">Requirements</h2>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Required Skills</label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Add a skill (press Enter)"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                className="flex-1"
              />
              <Button type="button" size="sm" onClick={addSkill} variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {form.requirements.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.requirements.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button type="button" onClick={() => removeSkill(s)}>
                      <X className="w-3 h-3 hover:text-destructive" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Min. Experience (years)</label>
              <Input
                type="number" min={0} max={50}
                value={form.requirements.experienceMin}
                onChange={(e) => setField("requirements", { ...form.requirements, experienceMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max. Experience (years)</label>
              <Input
                type="number" min={0} max={50}
                value={form.requirements.experienceMax}
                onChange={(e) => setField("requirements", { ...form.requirements, experienceMax: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        {/* Salary */}
        <div className="card-base p-5 space-y-4">
          <h2 className="text-sm font-semibold">Salary Package</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Min. Salary</label>
              <Input
                type="number" min={0}
                placeholder="5000"
                value={form.salary.min || ""}
                onChange={(e) => setField("salary", { ...form.salary, min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max. Salary</label>
              <Input
                type="number" min={0}
                placeholder="10000"
                value={form.salary.max || ""}
                onChange={(e) => setField("salary", { ...form.salary, max: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <Select value={form.salary.currency} onValueChange={(v) => setField("salary", { ...form.salary, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="card-base p-5 space-y-3">
          <h2 className="text-sm font-semibold">Tags</h2>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add a tag (press Enter)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={addTag} variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)}>
                    <X className="w-3 h-3 hover:text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Advanced (collapsible) */}
        <div className="card-base p-5 space-y-4">
          <button
            type="button"
            className="flex items-center justify-between w-full text-sm font-semibold"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Settings
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Expiry Date</label>
                  <Input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setField("expiresAt", e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Application Mode</label>
                  <Select value={form.applicationMode} onValueChange={(v) => setField("applicationMode", v as "auto" | "manual")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Review</SelectItem>
                      <SelectItem value="auto">Auto Match (AI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none px-8">
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/employer/jobs/${id}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
