"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Briefcase, Building2, AlertCircle } from "lucide-react";

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
        router.push("../leads");
      } else {
        alert("Failed to post job");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Post Job on Behalf of Employer"
        description="Create a job posting for one of your employer accounts"
      />

      {/* Employer selector */}
      <div className="card-base space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Select Employer</h3>
        </div>
        {loadingEmployers ? (
          <p className="text-sm text-muted-foreground">Loading employers…</p>
        ) : employers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            No employers assigned to you. Contact your super-agent.
          </div>
        ) : (
          <select
            value={selectedEmployer}
            onChange={(e) => setSelectedEmployer(e.target.value)}
            className="select-field w-full"
          >
            <option value="">Choose an employer…</option>
            {employers.map((em) => (
              <option key={em._id} value={em._id}>
                {em.companyName ?? em.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Job form */}
      <form onSubmit={handleSubmit} className="card-base space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Job Details</h3>
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
            className="btn-outline">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedEmployer}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post Job"}
          </button>
        </div>
      </form>
    </div>
  );
}
