"use client";

import { useState, useEffect } from "react";
import { Settings2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Save, Loader2, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

interface WorkflowStage {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

const DEFAULT_STAGES: WorkflowStage[] = [
  { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
  { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
  { id: "interview_scheduled", label: "Interview Scheduled", enabled: true, autoProgress: true, order: 4 },
  { id: "interview_completed", label: "Interview Completed", enabled: true, autoProgress: false, order: 5 },
  { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 6 },
  { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 7 },
  { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 8 },
];

export default function EmployerWorkflowPage() {
  const [stages, setStages] = useState<WorkflowStage[]>(DEFAULT_STAGES);
  const [aiAutoScreen, setAiAutoScreen] = useState(true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(true);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/employers/workflow")
      .then(r => r.json())
      .then(d => {
        if (d.stages) setStages(d.stages);
        if (d.settings) {
          setAiAutoScreen(d.settings.aiAutoScreen ?? true);
          setNotifyOnStageChange(d.settings.notifyOnStageChange ?? true);
          setAutoRejectBelow(d.settings.autoRejectBelow ?? 40);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleStage = (id: string, key: "enabled" | "autoProgress") => {
    setStages(s => s.map(stage => stage.id === id ? { ...stage, [key]: !stage[key] } : stage));
    setSaved(false);
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const newStages = [...stages];
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= newStages.length) return;
    [newStages[index], newStages[swap]] = [newStages[swap], newStages[index]];
    newStages.forEach((s, i) => { s.order = i + 1; });
    setStages(newStages);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/employers/workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages, settings: { aiAutoScreen, notifyOnStageChange, autoRejectBelow } }),
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
      <PageHeader title="Hiring Workflow" description="Configure your recruitment pipeline stages and automation" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Stages */}
        <div className="lg:col-span-2 card-base space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Pipeline Stages
          </h3>
          <p className="text-xs text-muted-foreground">Enable/disable stages and toggle automatic progression.</p>

          <div className="space-y-2">
            {stages.sort((a, b) => a.order - b.order).map((stage, i) => (
              <div key={stage.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                stage.enabled ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-60"
              }`}>
                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveStage(i, "up")} disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => moveStage(i, "down")} disabled={i === stages.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Order */}
                <span className="text-xs font-bold text-muted-foreground w-5">{stage.order}</span>

                {/* Label */}
                <span className="flex-1 text-sm font-medium">{stage.label}</span>

                {/* Auto-progress toggle */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="hidden sm:block">Auto</span>
                  <button onClick={() => toggleStage(stage.id, "autoProgress")} disabled={!stage.enabled}>
                    {stage.autoProgress
                      ? <ToggleRight className="h-5 w-5 text-primary" />
                      : <ToggleLeft className="h-5 w-5 text-muted-foreground/50" />}
                  </button>
                </div>

                {/* Enable/disable */}
                <button onClick={() => toggleStage(stage.id, "enabled")}>
                  {stage.enabled
                    ? <ToggleRight className="h-6 w-6 text-primary" />
                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Automation Settings */}
        <div className="space-y-4">
          <div className="card-base space-y-4">
            <h3 className="text-sm font-semibold">Automation</h3>

            {[
              { key: "aiAutoScreen", value: aiAutoScreen, setter: setAiAutoScreen, label: "AI Auto-Screening", desc: "Automatically score and rank new applications" },
              { key: "notifyOnStageChange", value: notifyOnStageChange, setter: setNotifyOnStageChange, label: "Notify Candidates", desc: "Send notifications on stage changes" },
            ].map(({ key, value, setter, label, desc }) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <button onClick={() => { setter(!value); setSaved(false); }} className="shrink-0">
                  {value
                    ? <ToggleRight className="h-7 w-7 text-primary" />
                    : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                </button>
              </div>
            ))}

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Auto-reject below AI score</span>
                <span className="font-medium text-primary">{autoRejectBelow}%</span>
              </div>
              <input type="range" min={20} max={70} step={5} value={autoRejectBelow}
                onChange={e => { setAutoRejectBelow(parseInt(e.target.value)); setSaved(false); }}
                className="w-full accent-primary" />
              <p className="text-xs text-muted-foreground">
                Applications scoring below this threshold are automatically rejected.
              </p>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
