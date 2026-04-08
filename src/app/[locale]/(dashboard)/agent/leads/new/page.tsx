"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import Link from "next/link";
import { toast } from "sonner";

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    country: "",
    industry: "",
    source: "",
    notes: "",
    followUpAt: "",
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v) body[k] = v;
    }
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.back();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to create lead");
    }
    setSaving(false);
  };

  const Field = ({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input
        type={type}
        value={form[name as keyof typeof form]}
        onChange={(e) => set(name, e.target.value)}
        required={required}
        className="input-field w-full h-9"
      />
    </div>
  );

  return (
    <div className="page-container">
      <PageHeader title="New Lead" description="Add a new employer lead to your pipeline" />

      <form onSubmit={handleSubmit} className="card-base space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company Name" name="companyName" required />
          <Field label="Contact Person" name="contactPerson" required />
          <Field label="Email" name="contactEmail" type="email" />
          <Field label="Phone" name="contactPhone" type="tel" />
          <Field label="Country" name="country" />
          <div className="space-y-1">
            <label className="text-sm font-medium">Industry</label>
            <select
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              className="select-field w-full h-9"
            >
              <option value="">Select industry…</option>
              {["Construction", "IT", "Healthcare", "Hospitality", "Retail", "Manufacturing", "Finance", "Education", "Oil & Gas", "Other"].map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Source</label>
            <select
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              className="select-field w-full h-9"
            >
              <option value="">Select source…</option>
              {["Referral", "Cold Call", "LinkedIn", "Website", "Event", "Other"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Field label="Follow-up Date" name="followUpAt" type="date" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="textarea-field w-full"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Create Lead"}
          </button>
          <Link href=".."
            className="btn-outline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
