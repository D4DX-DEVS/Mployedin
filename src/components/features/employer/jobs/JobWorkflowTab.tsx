"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, ChevronDown, ChevronUp, Save, Loader2, CheckCircle,
  Plus, Trash2, ArrowRight, Sparkles, Bell, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useJobWorkflow, useSaveJobWorkflow,
  type WorkflowStage, type WorkflowSettings,
} from "@/hooks/useJobWorkflow";

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

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-500", screening: "bg-violet-500", shortlisted: "bg-amber-500",
  interview_scheduled: "bg-purple-500", interview_completed: "bg-indigo-500",
  offer_extended: "bg-emerald-500", accepted: "bg-green-500", rejected: "bg-red-500",
};

interface Props { jobId: string; }

export function JobWorkflowTab({ jobId }: Props) {
  const { data: serverData, isLoading: loading, error: fetchError } = useJobWorkflow(jobId);
  const saveWorkflow = useSaveJobWorkflow(jobId);

  const [stages, setStages] = useState<WorkflowStage[]>(DEFAULT_STAGES);
  const [aiAutoScreen, setAiAutoScreen] = useState(true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(true);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"job" | "employer">("employer");

  useEffect(() => {
    if (serverData) {
      if (serverData.stages) setStages(serverData.stages);
      if (serverData.settings) {
        setAiAutoScreen(serverData.settings.aiAutoScreen ?? true);
        setNotifyOnStageChange(serverData.settings.notifyOnStageChange ?? true);
        setAutoRejectBelow(serverData.settings.autoRejectBelow ?? 40);
      }
      setSource(serverData.source);
    }
  }, [serverData]);

  useEffect(() => { if (fetchError) setError("Could not load workflow settings"); }, [fetchError]);

  const markDirty = useCallback(() => { setDirty(true); setSaved(false); }, []);

  const toggleStage = (id: string, key: "enabled" | "autoProgress") => {
    setStages((s) => s.map((stage) => (stage.id === id ? { ...stage, [key]: !stage[key] } : stage)));
    markDirty();
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const newStages = [...stages].sort((a, b) => a.order - b.order);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= newStages.length) return;
    [newStages[index], newStages[swap]] = [newStages[swap], newStages[index]];
    newStages.forEach((s, i) => { s.order = i + 1; });
    setStages(newStages);
    markDirty();
  };

  const addStage = () => {
    if (!newStageLabel.trim() || stages.length >= 20) return;
    const id = newStageLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (stages.some((s) => s.id === id)) return;
    setStages((prev) => [
      ...prev,
      { id, label: newStageLabel.trim(), enabled: true, autoProgress: false, order: prev.length + 1 },
    ]);
    setNewStageLabel("");
    setAddingStage(false);
    markDirty();
  };

  const removeStage = (id: string) => {
    setStages((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      updated.forEach((s, i) => { s.order = i + 1; });
      return updated;
    });
    markDirty();
  };

  const handleSave = async () => {
    try {
      await saveWorkflow.mutateAsync({
        stages,
        settings: { aiAutoScreen, notifyOnStageChange, autoRejectBelow },
      });
      setSaved(true);
      setDirty(false);
      setSource("job");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save workflow");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    );
  }

  const activeStages = stages.filter((s) => s.enabled);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const automatedStages = activeStages.filter((stage) => stage.autoProgress).length;

  return (
    <div className="space-y-5">
      {/* Source indicator */}
      {source === "employer" && !dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200">
          <Settings2 className="h-4 w-4 shrink-0" />
          Using employer default workflow. Customise below to create a job-specific pipeline.
        </div>
      )}

      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          You have unsaved changes
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Pipeline Preview */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" /> Pipeline Preview
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Active candidate path for this job</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{activeStages.length} stages</span>
            <span>·</span>
            <span>{automatedStages} automated</span>
          </div>
        </div>
        {activeStages.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeStages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
                  <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                  {stage.label}
                </div>
                {index < activeStages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active stages. Enable at least one stage.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Stages builder */}
        <div className="card-base p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-sky-600" /> Pipeline Stages
            </h3>
            <Button variant="outline" size="sm" onClick={() => setAddingStage(!addingStage)} disabled={stages.length >= 20} className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" /> Add Stage
            </Button>
          </div>

          {addingStage && (
            <div className="flex flex-col items-stretch gap-2 rounded-xl border border-dashed border-sky-500/30 bg-sky-500/5 p-3 sm:flex-row sm:items-center">
              <Input
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder="Stage name (e.g. Technical Test)"
                className="h-9 flex-1"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && addStage()}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addStage} disabled={!newStageLabel.trim()} className="bg-sky-600 text-white hover:bg-sky-700">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingStage(false); setNewStageLabel(""); }}>Cancel</Button>
              </div>
            </div>
          )}

          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Settings2 className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No stages</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Create your pipeline or use the defaults</p>
              <Button size="sm" variant="outline" onClick={() => { setStages(DEFAULT_STAGES); markDirty(); }} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Use Default Pipeline
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedStages.map((stage, i) => (
                <div
                  key={stage.id}
                  className={`group rounded-xl border p-3.5 transition-all ${
                    stage.enabled
                      ? "border-border bg-background/80 hover:border-sky-500/25"
                      : "border-border/80 bg-background/55 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-0.5 pt-1 text-muted-foreground">
                      <button onClick={() => moveStage(i, "up")} disabled={i === 0} className="rounded-md p-0.5 hover:bg-background hover:text-foreground disabled:opacity-20">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moveStage(i, "down")} disabled={i === sortedStages.length - 1} className="rounded-md p-0.5 hover:bg-background hover:text-foreground disabled:opacity-20">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background/60 text-xs font-semibold text-muted-foreground">
                      {stage.order}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                        <span className="truncate text-sm font-semibold text-foreground">{stage.label}</span>
                        <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {stage.enabled ? "On" : "Off"}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Auto-progress</span>
                          <Switch checked={stage.autoProgress} onCheckedChange={() => toggleStage(stage.id, "autoProgress")} disabled={!stage.enabled} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Active</span>
                          <Switch checked={stage.enabled} onCheckedChange={() => toggleStage(stage.id, "enabled")} />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeStage(stage.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" title="Remove stage">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Automation settings */}
        <div className="card-base p-5 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Automation Rules</h3>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">AI Auto-Screening</p>
                <Switch checked={aiAutoScreen} onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }} />
              </div>
              <p className="text-xs text-muted-foreground">Auto-score and rank new applications</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
              <Bell className="h-4 w-4 text-blue-600 dark:text-sky-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Notify Candidates</p>
                <Switch checked={notifyOnStageChange} onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }} />
              </div>
              <p className="text-xs text-muted-foreground">Send alerts on stage changes</p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-300" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-medium text-foreground">Auto-reject Threshold</p>
                  <span className="text-base font-bold text-sky-700 dark:text-sky-300">{autoRejectBelow}%</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reject below <strong>{autoRejectBelow}%</strong> match score
                </p>
                <input
                  type="range" min={0} max={80} step={5}
                  value={autoRejectBelow}
                  onChange={(e) => { setAutoRejectBelow(parseInt(e.target.value)); markDirty(); }}
                  className="mt-3 w-full cursor-pointer accent-sky-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0% (off)</span>
                  <span>40% (default)</span>
                  <span>80% (strict)</span>
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="w-full gap-2 bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300"
          >
            {saveWorkflow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saveWorkflow.isPending ? "Saving…" : saved ? "Saved!" : "Save Workflow for this Job"}
          </Button>
        </div>
      </div>
    </div>
  );
}
