"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, GripVertical, ChevronDown, ChevronUp,
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
    const newStages = [...stages];
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
      <div className="page-container">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );

  const activeStages = stages.filter((s) => s.enabled);

  return (
    <div className="page-container">
      <PageHeader
        title="Hiring Workflow"
        description="Configure your recruitment pipeline stages and automation"
        actions={
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="gap-2"
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
        <div className="card-base border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          You have unsaved changes
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="card-base border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-2 flex items-center justify-between text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-medium">✕</button>
        </div>
      )}

      {/* Pipeline Preview */}
      {activeStages.length > 0 && (
        <div className="card-base p-4 overflow-x-auto">
          <p className="text-xs font-medium text-muted-foreground mb-3">PIPELINE PREVIEW</p>
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {activeStages
              .sort((a, b) => a.order - b.order)
              .map((stage, i) => (
                <div key={stage.id} className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-medium">
                    <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                    {stage.label}
                  </div>
                  {i < activeStages.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Pipeline Stages ─── */}
        <div className="lg:col-span-2 card-base p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Pipeline Stages
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drag to reorder, toggle to enable/disable. {stages.length}/20 stages
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingStage(!addingStage)}
              disabled={stages.length >= 20}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Stage
            </Button>
          </div>

          {/* Add stage input */}
          {addingStage && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5">
              <Input
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder="Stage name (e.g. Technical Test)"
                className="flex-1 h-9"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && addStage()}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addStage} disabled={!newStageLabel.trim()} className="flex-1 sm:flex-none">
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingStage(false); setNewStageLabel(""); }} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Stages list */}
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Settings2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-sm">No stages added yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Create your hiring pipeline to get started
              </p>
              <Button size="sm" variant="outline" onClick={() => { setStages(DEFAULT_STAGES); markDirty(); }} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Use Default Pipeline
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...stages]
                .sort((a, b) => a.order - b.order)
                .map((stage, i) => (
                  <div
                    key={stage.id}
                    className={`group rounded-lg border transition-all hover:shadow-sm p-3 ${
                      stage.enabled
                        ? "border-border bg-background hover:border-primary/30"
                        : "border-border/40 bg-muted/20 opacity-50"
                    }`}
                  >
                    {/* Top row: reorder + label + delete */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5 text-muted-foreground">
                        <button
                          onClick={() => moveStage(i, "up")}
                          disabled={i === 0}
                          className="hover:text-foreground disabled:opacity-20 p-0.5 transition-colors"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveStage(i, "down")}
                          disabled={i === stages.length - 1}
                          className="hover:text-foreground disabled:opacity-20 p-0.5 transition-colors"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className={`h-3 w-3 rounded-full flex-shrink-0 ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center">{stage.order}</span>
                      <span className="flex-1 text-sm font-medium truncate">{stage.label}</span>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1 flex-shrink-0"
                        title="Remove stage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Bottom row: toggles */}
                    <div className="flex items-center gap-4 mt-2 ms-8 sm:ms-10">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Auto</span>
                        <Switch
                          checked={stage.autoProgress}
                          onCheckedChange={() => toggleStage(stage.id, "autoProgress")}
                          disabled={!stage.enabled}
                          className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 [&>span]:h-5 [&>span]:w-5"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={stage.enabled}
                          onCheckedChange={() => toggleStage(stage.id, "enabled")}
                          className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 [&>span]:h-5 [&>span]:w-5"
                        />
                        <span className={`text-[10px] font-medium ${stage.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {stage.enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ─── Automation Settings ─── */}
        <div className="space-y-4">
          <div className="card-base p-5 space-y-5">
            <h3 className="text-sm font-semibold">Automation</h3>

            {/* AI Auto-Screening */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">AI Auto-Screening</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={aiAutoScreen}
                        onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }}
                      />
                      <Badge variant={aiAutoScreen ? "default" : "secondary"} className="text-[10px] w-16 justify-center">
                        {aiAutoScreen ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Automatically score and rank new applications</p>
                </div>
              </div>
            </div>

            {/* Notify Candidates */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center flex-shrink-0">
                  <Bell className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">Notify Candidates</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={notifyOnStageChange}
                        onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }}
                      />
                      <Badge variant={notifyOnStageChange ? "default" : "secondary"} className="text-[10px] w-16 justify-center">
                        {notifyOnStageChange ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Send notifications on stage changes</p>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Auto-reject slider */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-950/50 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium">Auto-reject Threshold</p>
                    <span className="text-lg font-bold text-primary">{autoRejectBelow}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0% (off)</span>
                <span>40% (default)</span>
                <span>80% (strict)</span>
              </div>
            </div>
          </div>

          {/* Mobile save button */}
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="w-full gap-2 lg:hidden"
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
