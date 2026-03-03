"use client";

import { useState, useEffect } from "react";
import { ToggleLeft, ToggleRight, Zap, Hand, Loader2, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

interface WorkflowSettings {
  autoApply: boolean;
  autoApplyFilters: {
    minScore: number;
    maxDistance: string;
    onlyVerifiedEmployers: boolean;
  };
  instantBooking: boolean;
  showSalary: boolean;
  openToRelocation: boolean;
}

export default function JobSeekerSettingsPage() {
  const [settings, setSettings] = useState<WorkflowSettings>({
    autoApply: false,
    autoApplyFilters: { minScore: 70, maxDistance: "same_country", onlyVerifiedEmployers: true },
    instantBooking: true,
    showSalary: true,
    openToRelocation: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/job-seekers/settings")
      .then(r => r.json())
      .then(d => { if (d.settings) setSettings(d.settings); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: keyof Pick<WorkflowSettings, "autoApply" | "instantBooking" | "showSalary" | "openToRelocation">) => {
    setSettings(s => ({ ...s, [key]: !s[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/job-seekers/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="page-container">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Application Settings" description="Control how MPLOYEDIN applies and responds on your behalf" />

      <div className="max-w-2xl space-y-4">
        {/* Auto-Apply */}
        <div className={`card-base space-y-4 border-2 transition-colors ${settings.autoApply ? "border-primary/30" : "border-border"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Zap className={`h-5 w-5 mt-0.5 ${settings.autoApply ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <p className="font-semibold text-sm">Auto Apply Mode</p>
                <p className="text-xs text-muted-foreground">
                  AI automatically applies to matching jobs on your behalf without manual review.
                </p>
              </div>
            </div>
            <button onClick={() => toggle("autoApply")} className="shrink-0">
              {settings.autoApply
                ? <ToggleRight className="h-8 w-8 text-primary" />
                : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
            </button>
          </div>

          {settings.autoApply && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto-apply Filters</p>
              <div className="flex items-center justify-between">
                <span className="text-sm">Minimum match score</span>
                <div className="flex items-center gap-2">
                  <input type="range" min={50} max={95} step={5}
                    value={settings.autoApplyFilters.minScore}
                    onChange={e => setSettings(s => ({
                      ...s, autoApplyFilters: { ...s.autoApplyFilters, minScore: parseInt(e.target.value) }
                    }))}
                    className="w-24 accent-primary" />
                  <span className="text-xs font-medium w-8">{settings.autoApplyFilters.minScore}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Only verified employers</span>
                <button onClick={() => setSettings(s => ({
                  ...s, autoApplyFilters: { ...s.autoApplyFilters, onlyVerifiedEmployers: !s.autoApplyFilters.onlyVerifiedEmployers }
                }))}>
                  {settings.autoApplyFilters.onlyVerifiedEmployers
                    ? <ToggleRight className="h-7 w-7 text-primary" />
                    : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Manual Mode indicator */}
        {!settings.autoApply && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <Hand className="h-4 w-4 shrink-0" />
            Manual mode — you review and approve every application before sending.
          </div>
        )}

        {/* Other Toggles */}
        {[
          { key: "instantBooking" as const, label: "Instant Interview Booking", desc: "Allow employers to book interviews directly in your calendar." },
          { key: "showSalary" as const, label: "Show Salary Expectations", desc: "Display your salary range on your profile." },
          { key: "openToRelocation" as const, label: "Open to Relocation", desc: "Signal to employers that you\u2019re willing to relocate within GCC." },
        ].map(({ key, label, desc }) => (
          <div key={key} className="card-base flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <button onClick={() => toggle(key)} className="shrink-0">
              {settings[key]
                ? <ToggleRight className="h-8 w-8 text-primary" />
                : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
            </button>
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : null}
          {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
