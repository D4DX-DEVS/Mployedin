"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Settings2, ChevronDown, ChevronUp, Save, Loader2, CheckCircle,
  Plus, Trash2, ArrowRight, Sparkles, Bell, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useJobWorkflow, useSaveJobWorkflow,
  type WorkflowStage, type WorkflowSettings,
} from "@/hooks/useJobWorkflow";
import {
  DEFAULT_WORKFLOW_STAGES,
  DEFAULT_STAGE_LABELS,
  STAGE_DOT_CLASS,
  STAGE_LABEL_KEYS,
  isApplicationStatus,
} from "@/lib/hiring/pipeline";

const DEFAULT_STAGES: WorkflowStage[] = DEFAULT_WORKFLOW_STAGES.map((s) => ({ ...s }));

interface Props { jobId: string; }

export function JobWorkflowTab({ jobId }: Props) {
  const t = useTranslations("jobWorkflowTab");
  const tp = useTranslations("hiringPipeline");
  const { data: serverData, isLoading: loading, error: fetchError } = useJobWorkflow(jobId);
  const saveWorkflow = useSaveJobWorkflow(jobId);

  const [stages, setStages] = useState<WorkflowStage[]>(DEFAULT_STAGES);
  const [aiAutoScreen, setAiAutoScreen] = useState(true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(true);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restoreId, setRestoreId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"job" | "employer">("employer");

  const stageLabel = (stage: WorkflowStage) =>
    isApplicationStatus(stage.id) ? tp(STAGE_LABEL_KEYS[stage.id]) : stage.label;
  const missingStages = DEFAULT_STAGES.filter((d) => !stages.some((s) => s.id === d.id));

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

  useEffect(() => { if (fetchError) setError(t("couldNotLoadWorkflowSettings")); }, [fetchError, t]);

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

  const restoreStage = () => {
    const template = DEFAULT_STAGES.find((s) => s.id === restoreId);
    if (!template || stages.some((s) => s.id === template.id)) return;
    setStages((prev) => [...prev, { ...template, label: DEFAULT_STAGE_LABELS[template.id as keyof typeof DEFAULT_STAGE_LABELS], order: prev.length + 1 }]);
    setRestoreId("");
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
      setError(t("failedToSaveWorkflow"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    );
  }

  const activeStages = stages.filter((s) => s.enabled);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const automatedStages = activeStages.filter((stage) => stage.autoProgress).length;

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Source indicator */}
      {source === "employer" && !dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700">
          <Settings2 className="h-4 w-4 shrink-0" />
          {t("usingEmployerDefaultWorkflow")}
        </div>
      )}

      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {t("youHaveUnsavedChanges")}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Pipeline Preview */}
      <div className="card-base panel-body">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="heading-label font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" /> {t("pipelinePreview")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("activeCandidatePathForThisJob")}</p>
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
                  <span className={`h-2 w-2 rounded-full ${STAGE_DOT_CLASS[stage.id as keyof typeof STAGE_DOT_CLASS] ?? "bg-gray-400"}`} />
                  {stageLabel(stage)}
                </div>
                {index < activeStages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noActiveStagesEnableAtLeastOneStage")}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Stages builder */}
        <div className="card-base space-y-3 sm:space-y-4 panel-body">
          <div className="flex items-center justify-between">
            <h3 className="heading-label font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-sky-600" /> {t("pipelineStages")}
            </h3>
            <div className="flex items-center gap-2">
              {missingStages.length > 0 ? (
                <>
                  <select
                    aria-label={tp("restoreStage")}
                    value={restoreId}
                    onChange={(e) => setRestoreId(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="">{tp("restoreStagePlaceholder")}</option>
                    {missingStages.map((s) => (
                      <option key={s.id} value={s.id}>{stageLabel(s)}</option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm" onClick={restoreStage} disabled={!restoreId} className="gap-1.5 h-8">
                    <Plus className="h-3.5 w-3.5" /> {tp("restoreStage")}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{tp("allStagesPresent")}</span>
              )}
            </div>
          </div>

          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Settings2 className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">{t("noStages")}</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">{t("createYourPipelineOrUseTheDefaults")}</p>
              <Button size="sm" variant="outline" onClick={() => { setStages(DEFAULT_STAGES); markDirty(); }} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> {t("useDefaultPipeline")}
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
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${STAGE_DOT_CLASS[stage.id as keyof typeof STAGE_DOT_CLASS] ?? "bg-gray-400"}`} />
                        <span className="truncate text-sm font-semibold text-foreground">{stageLabel(stage)}</span>
                        <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {stage.enabled ? "On" : "Off"}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t("autoProgress")}</span>
                          <Switch checked={stage.autoProgress} onCheckedChange={() => toggleStage(stage.id, "autoProgress")} disabled={!stage.enabled} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t("active")}</span>
                          <Switch checked={stage.enabled} onCheckedChange={() => toggleStage(stage.id, "enabled")} />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeStage(stage.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100" title={t("removeStage")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Automation settings */}
        <div className="card-base space-y-3 sm:space-y-5 panel-body">
          <h3 className="heading-label font-semibold text-foreground">{t("automationRules")}</h3>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
              <Sparkles className="h-4 w-4 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{t("aiAutoScreening")}</p>
                <Switch checked={aiAutoScreen} onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }} />
              </div>
              <p className="text-xs text-muted-foreground">{t("autoScoreAndRankNewApplications")}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
              <Bell className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{t("notifyCandidates")}</p>
                <Switch checked={notifyOnStageChange} onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }} />
              </div>
              <p className="text-xs text-muted-foreground">{t("sendAlertsOnStageChanges")}</p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-medium text-foreground">{t("autoRejectThreshold")}</p>
                  <span className="text-base font-bold text-sky-700">{autoRejectBelow}%</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("rejectBelowMatchScore", { percent: autoRejectBelow })}
                </p>
                <input
                  type="range" min={0} max={80} step={5}
                  value={autoRejectBelow}
                  onChange={(e) => { setAutoRejectBelow(parseInt(e.target.value)); markDirty(); }}
                  className="mt-3 w-full cursor-pointer accent-sky-600"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{t("percentOff")}</span>
                  <span>{t("percentDefault")}</span>
                  <span>{t("percentStrict")}</span>
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
            {saveWorkflow.isPending ? t("saving") : saved ? t("saved") : t("saveWorkflowForThisJob")}
          </Button>
        </div>
      </div>
    </div>
  );
}
