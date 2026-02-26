"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

interface Territory {
  _id: string;
  name: string;
  superAgentId?: { name?: string; email?: string };
  countries?: string[];
  createdAt?: string;
}

const GCC_COUNTRIES = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Egypt", "Jordan", "Lebanon"];

export default function AdminTerritoryPage() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", countries: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchTerritories = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/territories?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTerritories(data.items ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchTerritories(); }, [fetchTerritories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/territories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: "", countries: [] });
      fetchTerritories();
    }
    setSaving(false);
  };

  const toggleCountry = (country: string) => {
    setForm((prev) => ({
      ...prev,
      countries: prev.countries.includes(country)
        ? prev.countries.filter((c) => c !== country)
        : [...prev.countries, country],
    }));
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Territory Management"
        description="Manage geographic territories and super-agent assignments"
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            {showForm ? "Cancel" : "+ New Territory"}
          </button>
        }
      />

      {showForm && (
        <form onSubmit={handleSubmit} className="card-base space-y-4">
          <h3 className="font-semibold text-sm">Create Territory</h3>
          <div className="space-y-1">
            <label className="text-sm font-medium">Territory Name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="e.g. Gulf East, UAE North"
              className="w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Countries</label>
            <div className="flex flex-wrap gap-2">
              {GCC_COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCountry(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    form.countries.includes(c)
                      ? "bg-primary text-white border-primary"
                      : "hover:bg-muted/60"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving…" : "Create Territory"}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search territories…"
          className="h-9 rounded-lg border px-3 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {territories.map((t) => (
            <div key={t._id} className="card-base hover:border-primary/40 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manager: {(t.superAgentId as { name?: string })?.name ?? "Unassigned"}
                  </p>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  Active
                </span>
              </div>
              {(t as { countries?: string[] }).countries?.length ? (
                <div className="flex flex-wrap gap-1 mt-3">
                  {(t as { countries?: string[] }).countries!.map((c) => (
                    <span key={c} className="text-xs bg-muted rounded-full px-2 py-0.5">{c}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {territories.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">
              No territories yet. Create your first territory above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
