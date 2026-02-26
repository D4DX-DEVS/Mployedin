"use client";

import { useState, useEffect, useCallback } from "react";
import { GraduationCap, Plus, CheckCircle, Clock, ExternalLink, Loader2, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface TrainingItem {
  _id?: string;
  title: string;
  provider: string;
  url?: string;
  status: "not_started" | "in_progress" | "completed";
  targetDate?: string;
  notes?: string;
  completedAt?: string;
}

const SUGGESTED_TRAININGS = [
  { title: "Gulf Labour Law Essentials", provider: "MPLOYEDIN Academy", url: "#" },
  { title: "Professional HR Certificate (Gulf)", provider: "CIPD", url: "https://cipd.org" },
  { title: "Advanced Excel for HR", provider: "LinkedIn Learning", url: "https://linkedin.com/learning" },
  { title: "Interviewing Skills Masterclass", provider: "Coursera", url: "https://coursera.org" },
  { title: "Corporate Communication in Arabic", provider: "AUB Online", url: "#" },
];

export default function EmployerTrainingTrackerPage() {
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<TrainingItem, "_id">>({
    title: "",  provider: "", url: "", status: "not_started", targetDate: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employers/training");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.title || !form.provider) return;
    setSaving(true);
    try {
      await fetch("/api/employers/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ title: "", provider: "", url: "", status: "not_started", targetDate: "", notes: "" });
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string | undefined, status: TrainingItem["status"]) => {
    if (!id) {
      setItems(prev => prev.map(item => !item._id && item.title === id ? { ...item, status } : item));
      return;
    }
    await fetch(`/api/employers/training/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}) }),
    });
    load();
  };

  const completed = items.filter(i => i.status === "completed").length;
  const inProgress = items.filter(i => i.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Tracker"
        description={`${completed}/${items.length} courses completed · ${inProgress} in progress`}
        actions={
          <button onClick={() => setShowForm(s => !s)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Training
          </button>
        }
      />

      {/* Add Form */}
      {showForm && (
        <div className="card-base space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Add Training Item</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Course Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="input-field w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Provider *</label>
              <input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                className="input-field w-full mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">URL</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://…" className="input-field w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target Date</label>
              <input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                className="input-field w-full mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Training List */}
        <div className="lg:col-span-2 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="card-base text-center py-8 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No training items yet. Add one or pick from suggestions.</p>
            </div>
          )}
          {items.map((item, i) => (
            <div key={item._id ?? i} className="card-base flex items-start gap-3">
              <div className="pt-0.5">
                {item.status === "completed"
                  ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                  : item.status === "in_progress"
                  ? <Clock className="h-5 w-5 text-amber-500" />
                  : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.provider}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={item.status.replace("_", " ")} />
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="p-1 rounded hover:bg-primary/10 text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {item.status !== "in_progress" && (
                    <button onClick={() => updateStatus(item._id, "in_progress")}
                      className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                      Start
                    </button>
                  )}
                  {item.status !== "completed" && (
                    <button onClick={() => updateStatus(item._id, "completed")}
                      className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        <div className="card-base space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" /> Recommended Training
          </h3>
          <div className="space-y-2">
            {SUGGESTED_TRAININGS.map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-2 p-2.5 rounded-lg border hover:border-primary/30 transition-colors">
                <div>
                  <p className="text-xs font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.provider}</p>
                </div>
                <button
                  onClick={() => {
                    setForm({ title: s.title, provider: s.provider, url: s.url, status: "not_started", targetDate: "", notes: "" });
                    setShowForm(true);
                  }}
                  className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 shrink-0">
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
