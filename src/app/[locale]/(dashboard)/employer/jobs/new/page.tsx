"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sparkles, Plus, X, ChevronDown, ChevronUp, Copy } from "lucide-react";
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
}

interface JobTemplateData {
  _id: string;
  name: string;
  title?: string;
  description?: string;
  category?: string;
  requirements?: FormData["requirements"];
  salary?: FormData["salary"];
  location?: { country?: string; city?: string; isRemote?: boolean };
  tags?: string[];
  vacancies?: number;
  applicationMode?: "auto" | "manual";
}

export default function NewJobPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    category: "",
    location: "",
    requirements: { skills: [], experienceMin: 0, experienceMax: 20 },
    salary: { min: 0, max: 0, currency: "USD" },
    applicationMode: "manual",
    expiresAt: "",
  });

  const [skillInput, setSkillInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [templates, setTemplates] = useState<JobTemplateData[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Load templates when modal opens
  useEffect(() => {
    if (showTemplateModal && templates.length === 0) {
      loadTemplates();
    }
  }, [showTemplateModal, templates.length]);

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/employers/job-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch (e) {
      console.error("Failed to load templates", e);
    } finally {
      setLoadingTemplates(false);
    }
  }

  function applyTemplate(template: JobTemplateData) {
    const newForm: FormData = {
      title: template.title || form.title,
      description: template.description || form.description,
      category: template.category || form.category,
      location: (template.location?.city && template.location?.country)
        ? `${template.location.city}, ${template.location.country}`
        : form.location,
      requirements: template.requirements || form.requirements,
      salary: template.salary || form.salary,
      applicationMode: template.applicationMode || form.applicationMode,
      expiresAt: form.expiresAt,
    };
    setForm(newForm);
    setShowTemplateModal(false);
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) {
      setError("Template name is required");
      return;
    }

    setSavingTemplate(true);
    setError("");
    try {
      const res = await fetch("/api/employers/job-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          title: form.title,
          description: form.description,
          category: form.category,
          requirements: form.requirements,
          salary: form.salary,
          location: form.location ? { city: form.location.split(",")[0]?.trim(), country: form.location.split(",")[1]?.trim() } : undefined,
          applicationMode: form.applicationMode,
        }),
      });

      if (res.ok) {
        setTemplateName("");
        setShowSaveTemplateInput(false);
        // Reload templates
        setTemplates([]);
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed to save template");
      }
    } catch (e) {
      setError("Failed to save template. Please try again.");
      console.error(e);
    } finally {
      setSavingTemplate(false);
    }
  }

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
      skills: form.requirements.skills.filter((s) => s !== skill)
    });
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
    } catch (e) {
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
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/${locale}/employer/jobs/${data.job._id}`);
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed to create job");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Post a New Job"
        description="Create a job posting to attract qualified candidates"
      />

      {/* Load Template Button */}
      <div className="mb-5 flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowTemplateModal(true)}
          className="flex gap-2"
        >
          <Copy className="w-4 h-4" />
          Load Template
        </Button>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Select a Template</h2>
            {loadingTemplates ? (
              <p className="text-sm text-muted-foreground py-4">Loading templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No templates saved yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template._id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-sm">{template.name}</p>
                    {template.title && <p className="text-xs text-muted-foreground">{template.title}</p>}
                  </button>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTemplateModal(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

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
              {aiLoading ? "Generating…" : "Generate with AI"}
            </Button>
          </div>
          <Textarea
            placeholder="Describe the role, responsibilities, and what you're looking for…"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={8}
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
              {form.applicationMode === "auto" && (
                <p className="text-xs text-muted-foreground p-3 bg-primary/5 rounded-lg border border-primary/20">
                  In Auto mode, AI will automatically shortlist candidates that match your requirements and score above your threshold.
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</p>
        )}

        {/* Save as Template Section */}
        {!showSaveTemplateInput ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSaveTemplateInput(true)}
          >
            Save as Template
          </Button>
        ) : (
          <div className="card-base p-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Template Name</label>
            <Input
              placeholder="e.g. Senior Dev Template"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={saveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
              >
                {savingTemplate ? "Saving…" : "Save Template"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowSaveTemplateInput(false);
                  setTemplateName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none px-8">
            {submitting ? "Posting…" : "Post Job"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
