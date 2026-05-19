"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Briefcase, Building2, Loader2, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencySelect } from "@/components/ui/currency-select";
import { CountrySelect } from "@/components/ui/country-select";
import { JOB_CATEGORIES } from "@/components/features/employer/job-form/jobFormSchema";

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
] as const;

interface Employer {
  _id: string;
  name: string;
  companyName?: string;
}

export default function AgentJobPosterPage() {
  const router = useRouter();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("");
  const [loadingEmployers, setLoadingEmployers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "",
    city: "",
    country: "",
    employmentType: "full_time",
    salaryMin: "",
    salaryMax: "",
    currency: "AED",
    description: "",
    requirements: "",
  });

  const loadEmployers = useCallback(async () => {
    try {
      const res = await fetch("/api/employers");
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? data);
      }
    } finally {
      setLoadingEmployers(false);
    }
  }, []);

  useEffect(() => { loadEmployers(); }, [loadEmployers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployer) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          location: { city: form.city, country: form.country },
          employmentType: form.employmentType,
          ...(form.salaryMin && form.salaryMax ? { salary: { min: parseInt(form.salaryMin), max: parseInt(form.salaryMax), currency: form.currency } } : {}),
          description: form.description,
          ...(form.requirements.trim() ? { requirements: { skills: form.requirements.split("\n").map((r) => r.trim()).filter(Boolean) } } : {}),
          employerId: selectedEmployer,
        }),
      });
      if (res.ok) {
        toast.success("Job posted successfully");
        router.push("../jobs");
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || "Failed to post job");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Post Job on Behalf of Employer</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Create a role for one of your assigned employers without leaving the agent workspace.</p>
          </div>
          <Button variant="outline" onClick={() => router.back()} className="rounded-xl border-white/80 bg-white/80 hover:border-sky-200 hover:text-sky-700">
            <ArrowRight className="h-4 w-4" />
            Back
          </Button>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-950">Select Employer</h3>
        </div>
        {loadingEmployers ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading employers…
          </div>
        ) : employers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            No employers assigned to you. Contact your super-agent.
          </div>
        ) : (
          <Select value={selectedEmployer} onValueChange={setSelectedEmployer}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="Choose an employer…" />
            </SelectTrigger>
            <SelectContent>
              {employers.map((em) => (
                <SelectItem key={em._id} value={em._id}>
                  {em.companyName ?? em.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-950">Job Details</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job Title *</label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Senior Accountant"
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category *</label>
            <Select required value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {JOB_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Country *</label>
            <CountrySelect
              value={form.country}
              onValueChange={(v) => setForm({ ...form, country: v })}
              className="h-11"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">City *</label>
            <Input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="e.g. Dubai"
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Employment Type</label>
            <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
            <CurrencySelect
              value={form.currency}
              onValueChange={(v) => setForm({ ...form, currency: v })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Salary Min</label>
            <Input
              type="number"
              value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
              placeholder="e.g. 8000"
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Salary Max</label>
            <Input
              type="number"
              value={form.salaryMax}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
              placeholder="e.g. 12000"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job Description *</label>
          <Textarea
            required
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the role, responsibilities…"
            className="rounded-xl resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Requirements (one per line)</label>
          <Textarea
            rows={4}
            value={form.requirements}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            placeholder={"5+ years experience\nBachelor's degree\nMS Excel proficiency"}
            className="rounded-xl resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-11 rounded-xl">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !selectedEmployer}
            className="h-11 rounded-xl bg-sky-600 hover:bg-sky-700"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? "Posting…" : "Post Job"}
          </Button>
        </div>
      </form>
    </div>
  );
}
