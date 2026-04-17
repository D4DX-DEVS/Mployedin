"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, ChevronDown, ChevronUp,
  Save, Loader2, CheckCircle, Plus, Trash2, ArrowRight, Sparkles, Bell, ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWorkflow, useSaveWorkflow, type WorkflowStage } from "@/hooks/useWorkflow";

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
  new: "bg-blue-500",
  screening: "bg-violet-500",
  shortlisted: "bg-amber-500",
  interview_scheduled: "bg-purple-500",
  interview_completed: "bg-indigo-500",
  offer_extended: "bg-emerald-500",
  accepted: "bg-green-500",
  rejected: "bg-red-500",
};

export default function EmployerWorkflowPage() {
  const { data: serverData, isLoading: loading, error: fetchError } = useWorkflow();
  const saveWorkflow = useSaveWorkflow();

  const [stages, setStages] = useState<WorkflowStage[]>(DEFAULT_STAGES);
  const [aiAutoScreen, setAiAutoScreen] = useState(true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(true);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed local state from server data
  useEffect(() => {
    if (serverData) {
      if (serverData.stages) setStages(serverData.stages);
      if (serverData.settings) {
        setAiAutoScreen(serverData.settings.aiAutoScreen ?? true);
        setNotifyOnStageChange(serverData.settings.notifyOnStageChange ?? true);
        setAutoRejectBelow(serverData.settings.autoRejectBelow ?? 40);
      }
    }
  }, [serverData]);

  useEffect(() => {
    if (fetchError) setError("Could not load workflow settings");
  }, [fetchError]);

  const markDirty = useCallback(() => { setDirty(true); setSaved(false); }, []);

  const toggleStage = (id: string, key: "enabled" | "autoProgress") => {
    setStages((s) =>
      s.map((stage) => (stage.id === id ? { ...stage, [key]: !stage[key] } : stage))
    );
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
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save workflow");
    }
  };

  if (loading)
    return (
      <div className="page-container employer-legacy-surface space-y-4">
        <div className="h-40 animate-pulse rounded-[28px] border border-border bg-background/70" />
        <div className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[28px] border border-border bg-background/70" />
          ))}
        </div>
      </div>
    );

  const activeStages = stages.filter((s) => s.enabled);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const automatedStages = activeStages.filter((stage) => stage.autoProgress).length;
  const saveStateLabel = saveWorkflow.isPending
    ? "Saving changes"
    : saved
      ? "Workflow saved"
      : dirty
        ? "Unsaved edits"
        : "Live configuration";

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      <PageHeader
        title="Hiring Workflow"
        description="Configure your recruitment pipeline stages and automation"
        actions={
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="gap-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300"
            size="sm"
          >
            {saveWorkflow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveWorkflow.isPending ? "Saving…" : saved ? "Saved!" : "Save Workflow"}
          </Button>
        }
      />

      {/* Unsaved changes banner */}
      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          You have unsaved changes
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200">✕</button>
        </div>
      )}

      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-7">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Sparkles className="h-4 w-4" />
              Pipeline automation
            </div>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground">
              Shape the hiring journey once, then keep recruiters and candidates aligned from first review to final offer.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Reorder stages, enable automation, and define rejection thresholds without leaving the workflow view. Every change stays local until you save it.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="workspace-glass-panel rounded-2xl p-4">
                <Settings2 className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{activeStages.length} active stages</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">A clean pipeline keeps hiring teams consistent across every role.</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <Sparkles className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{automatedStages} automated steps</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Auto-progression can speed up screening and interview coordination.</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <Bell className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{saveStateLabel}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Notifications and automation stay in sync with your latest saved workflow.</p>
              </div>
            </div>
          </div>

          <div className="workspace-glass-panel rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline preview</p>
                <p className="mt-2 text-sm text-muted-foreground">This is the active candidate path recruiters will work with.</p>
              </div>
              <span className="rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-semibold text-foreground">
                {activeStages.length} live
              </span>
            </div>
            <div className="mt-5 overflow-x-auto pb-1">
              {activeStages.length > 0 ? (
                <div className="flex min-w-max items-center gap-1.5">
                  {activeStages.map((stage, index) => (
                    <div key={stage.id} className="flex items-center gap-1.5">
                      <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-xs font-medium text-foreground">
                        <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                        {stage.label}
                      </div>
                      {index < activeStages.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  Enable at least one stage to preview the live pipeline.
                </div>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Candidate alerts</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {notifyOnStageChange ? "Enabled for stage changes" : "Disabled for stage changes"}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Auto-reject floor</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{autoRejectBelow}% match score</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* ─── Pipeline Stages ─── */}
        <section className="workspace-panel-surface space-y-4 rounded-[28px] p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workflow builder</p>
              <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-sky-600" /> Pipeline stages
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Reorder the pipeline, toggle stage automation, and keep up to 20 stages active.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingStage(!addingStage)}
              disabled={stages.length >= 20}
              className="gap-1.5 rounded-xl border-border bg-background/80 hover:bg-background"
            >
              <Plus className="h-3.5 w-3.5" /> Add Stage
            </Button>
          </div>

          {/* Add stage input */}
          {addingStage && (
            <div className="flex flex-col items-stretch gap-2 rounded-[22px] border border-dashed border-sky-500/30 bg-sky-500/10 p-4 sm:flex-row sm:items-center">
              <Input
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder="Stage name (e.g. Technical Test)"
                className="h-10 flex-1 border-border bg-background/80"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && addStage()}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={addStage}
                  disabled={!newStageLabel.trim()}
                  className="flex-1 rounded-xl bg-sky-600 text-white hover:bg-sky-700 sm:flex-none"
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddingStage(false); setNewStageLabel(""); }}
                  className="flex-1 rounded-xl text-muted-foreground hover:bg-background/70 sm:flex-none"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Stages list */}
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-background/60 py-16 text-center">
              <Settings2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No stages added yet</p>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                Create your hiring pipeline to get started
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setStages(DEFAULT_STAGES); markDirty(); }}
                className="gap-1.5 rounded-xl border-border bg-background/80 hover:bg-background"
              >
                <Plus className="h-3.5 w-3.5" /> Use Default Pipeline
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedStages.map((stage, i) => (
                  <div
                    key={stage.id}
                    className={`group rounded-[22px] border p-4 transition-all ${
                      stage.enabled
                        ? "border-border bg-background/80 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.45)] hover:border-sky-500/25"
                        : "border-border/80 bg-background/55 opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-0.5 pt-1 text-muted-foreground">
                        <button
                          onClick={() => moveStage(i, "up")}
                          disabled={i === 0}
                          className="rounded-md p-0.5 transition-colors hover:bg-background hover:text-foreground disabled:opacity-20"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveStage(i, "down")}
                          disabled={i === sortedStages.length - 1}
                          className="rounded-md p-0.5 transition-colors hover:bg-background hover:text-foreground disabled:opacity-20"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-background/60 text-xs font-semibold text-muted-foreground">
                        {stage.order}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 flex-shrink-0 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                          <span className="truncate text-sm font-semibold text-foreground">{stage.label}</span>
                          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {stage.enabled ? "Enabled" : "Paused"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Auto-progress</span>
                            <Switch
                              checked={stage.autoProgress}
                              onCheckedChange={() => toggleStage(stage.id, "autoProgress")}
                              disabled={!stage.enabled}
                              className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 [&>span]:h-5 [&>span]:w-5"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Stage active</span>
                            <Switch
                              checked={stage.enabled}
                              onCheckedChange={() => toggleStage(stage.id, "enabled")}
                              className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 [&>span]:h-5 [&>span]:w-5"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:text-red-300"
                        title="Remove stage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-background/70 px-2.5 py-1">Order {stage.order}</span>
                      <span className="rounded-full bg-background/70 px-2.5 py-1">
                        {stage.autoProgress ? "Moves automatically" : "Manual review required"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* ─── Automation Settings ─── */}
        <div className="space-y-4">
          <section className="workspace-panel-surface space-y-5 rounded-[28px] p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Automation</p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">Recruitment rules</h3>
              <p className="mt-1 text-sm text-muted-foreground">Set which steps are automated and how strict the AI gate should be.</p>
            </div>

            {/* AI Auto-Screening */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">AI Auto-Screening</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={aiAutoScreen}
                        onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }}
                      />
                      <Badge
                        variant={aiAutoScreen ? "default" : "secondary"}
                        className="w-16 justify-center rounded-full text-[10px]"
                      >
                        {aiAutoScreen ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Automatically score and rank new applications.</p>
                </div>
              </div>
            </div>

            {/* Notify Candidates */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500/10">
                  <Bell className="h-4 w-4 text-blue-600 dark:text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">Notify Candidates</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={notifyOnStageChange}
                        onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }}
                      />
                      <Badge
                        variant={notifyOnStageChange ? "default" : "secondary"}
                        className="w-16 justify-center rounded-full text-[10px]"
                      >
                        {notifyOnStageChange ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Send notifications as candidates move through the workflow.</p>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border/60" />

            {/* Auto-reject slider */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
                  <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-300" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-foreground">Auto-reject Threshold</p>
                    <span className="text-lg font-bold text-sky-700 dark:text-sky-300">{autoRejectBelow}%</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Candidates scoring below <strong>{autoRejectBelow}%</strong> AI match score will be automatically rejected
                  </p>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={autoRejectBelow}
                onChange={(e) => { setAutoRejectBelow(parseInt(e.target.value)); markDirty(); }}
                className="w-full cursor-pointer accent-sky-600"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0% (off)</span>
                <span>40% (default)</span>
                <span>80% (strict)</span>
              </div>
            </div>

            <div className="rounded-[22px] border border-border bg-background/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Guidance</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Use automation where it reduces repetition, not judgment.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep manual checkpoints for interviews and offers so recruiters still review high-impact decisions before moving candidates forward.
              </p>
            </div>
          </section>

          {/* Mobile save button */}
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="w-full gap-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 lg:hidden disabled:bg-slate-300"
          >
            {saveWorkflow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveWorkflow.isPending ? "Saving…" : saved ? "Saved!" : "Save Workflow"}
          </Button>
        </div>
      </div>
    </div>
  );
}
