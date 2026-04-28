"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Inbox, Plus, X } from "lucide-react";

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
    <div className="page-container space-y-4">
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* Compact header row */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Territory Management</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage geographic territories and super-agent assignments.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search territories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-48 rounded-lg border-border bg-secondary/65 pl-8 text-sm shadow-none sm:w-56"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="h-9 gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {showForm ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> New Territory</>}
            </Button>
          </div>
        </div>

        {/* Inline create form */}
        {showForm && (
          <div className="border-b border-border/60 bg-secondary/30 px-5 py-4">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <h3 className="text-sm font-semibold text-foreground">Create Territory</h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Territory Name <span className="text-destructive">*</span></label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  placeholder="e.g. Gulf East, UAE North"
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Countries</label>
                <div className="flex flex-wrap gap-2">
                  {GCC_COUNTRIES.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      variant={form.countries.includes(c) ? "default" : "outline"}
                      size="xs"
                      onClick={() => toggleCountry(c)}
                      className="rounded-full"
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <Button type="submit" size="sm" disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                {saving ? "Saving…" : "Create Territory"}
              </Button>
            </form>
          </div>
        )}

        {/* Card grid */}
        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-shimmer rounded-xl border border-border/50 bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
              ))}
            </div>
          ) : territories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No territories yet</p>
              <p className="text-xs text-muted-foreground">Create your first territory using the button above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {territories.map((t) => (
                <div key={t._id} className="rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{t.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Manager: {(t.superAgentId as { name?: string })?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Active
                    </span>
                  </div>
                  {t.countries?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {t.countries.map((c) => (
                        <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
