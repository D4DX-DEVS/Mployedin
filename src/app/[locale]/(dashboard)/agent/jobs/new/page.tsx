"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Briefcase, Building2, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
    location: "",
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
          location: form.location,
          employmentType: form.employmentType,
          salary: {
            min: form.salaryMin ? parseInt(form.salaryMin) : undefined,
            max: form.salaryMax ? parseInt(form.salaryMax) : undefined,
            currency: form.currency,
          },
          description: form.description,
          requirements: form.requirements.split("\n").map((r) => r.trim()).filter(Boolean),
          onBehalfOfEmployer: selectedEmployer,
        }),
      });
      if (res.ok) {
        router.push("../jobs");
      } else {
        toast.error("Failed to post job");
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
          <button onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:text-sky-700">
            <ArrowRight className="h-4 w-4" />
            Back
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-950">Select Employer</h3>
        </div>
        {loadingEmployers ? (
          <p className="text-sm text-slate-500">Loading employers…</p>
        ) : employers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            No employers assigned to you. Contact your super-agent.
          </div>
        ) : (
          <select
            value={selectedEmployer}
            onChange={(e) => setSelectedEmployer(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">Choose an employer…</option>
            {employers.map((em) => (
              <option key={em._id} value={em._id}>
                {em.companyName ?? em.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-950">Job Details</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Job Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Senior Accountant"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Category *</label>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="select-field w-full"
            >
              <option value="">Select category</option>
              {["Technology","Finance","Healthcare","Engineering","Sales & Marketing","Operations","Human Resources","Education","Hospitality","Construction","Legal","Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Location *</label>
            <input
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Dubai, UAE"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Employment Type</label>
            <select
              value={form.employmentType}
              onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
              className="select-field w-full"
            >
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
              <option value="freelance">Freelance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="select-field w-full"
            >
              {["AED","SAR","KWD","QAR","BHD","OMR","USD"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Salary Min</label>
            <input
              type="number"
              value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
              placeholder="e.g. 8000"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Salary Max</label>
            <input
              type="number"
              value={form.salaryMax}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
              placeholder="e.g. 12000"
              className="input-field w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Job Description *</label>
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the role, responsibilities…"
            className="textarea-field w-full"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Requirements (one per line)</label>
          <textarea
            rows={4}
            value={form.requirements}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            placeholder={"5+ years experience\nBachelor's degree\nMS Excel proficiency"}
            className="textarea-field w-full"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()}
            className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedEmployer}
            className="inline-flex h-11 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post Job"}
          </button>
        </div>
      </form>
    </div>
  );
}
