"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, ChevronDown, ChevronUp,
  Save, Loader2, CheckCircle, Plus, Trash2, ArrowRight, Sparkles, Bell, ShieldAlert,
  BookTemplate, Copy,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWorkflow, useSaveWorkflow, type WorkflowStage } from "@/hooks/useWorkflow";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import {
  useEmployerWorkflowTemplates,
  useCreateEmployerWorkflowTemplate,
  type WorkflowTemplateItem,
} from "@/hooks/useWorkflowTemplates";

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
  new: "bg-sky-500",
  screening: "bg-indigo-500",
  shortlisted: "bg-amber-500",
  interview_scheduled: "bg-purple-500",
  interview_completed: "bg-indigo-500",
  offer_extended: "bg-emerald-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
};

export default function EmployerWorkflowPage() {
  const t = useTranslations("employerWorkflow");
  const tc = useTranslations("employerCommon");
  const { data: serverData, isLoading: loading, error: fetchError } = useWorkflow();
  const saveWorkflow = useSaveWorkflow();
  const { data: templates, isLoading: templatesLoading } = useEmployerWorkflowTemplates();
  const createTemplate = useCreateEmployerWorkflowTemplate();

  const [stages, setStages] = useState<WorkflowStage[]>(DEFAULT_STAGES);
  const [aiAutoScreen, setAiAutoScreen] = useState(true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(true);
  const [autoRejectBelow, setAutoRejectBelow] = useState(40);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);

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
    if (fetchError) setError(t("loadingError"));
  }, [fetchError, t]);

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
      setError(t("saveError"));
    }
  };

  const applyTemplate = (tpl: WorkflowTemplateItem) => {
    setStages(tpl.stages);
    setAiAutoScreen(tpl.settings.aiAutoScreen);
    setNotifyOnStageChange(tpl.settings.notifyOnStageChange);
    setAutoRejectBelow(tpl.settings.autoRejectBelow);
    setShowTemplateSelector(false);
    markDirty();
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await createTemplate.mutateAsync({
        name: templateName.trim(),
        stages,
        settings: { aiAutoScreen, notifyOnStageChange, autoRejectBelow },
      });
      setTemplateSaved(true);
      setShowSaveAsTemplate(false);
      setTemplateName("");
      setTimeout(() => setTemplateSaved(false), 3000);
    } catch {
      setError(t("templateSaveError"));
    }
  };

  if (loading)
    return (
      <div className="page-container space-y-4">
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
  const getStageLabel = (stage: WorkflowStage) => {
    const labels: Record<string, string> = {
      new: t("newApplication"),
      screening: t("aiScreening"),
      shortlisted: t("shortlisted"),
      interview_scheduled: t("interview"),
      interview_completed: t("interviewCompleted"),
      offer_extended: t("offerExtended"),
      accepted: t("accepted"),
      rejected: t("rejected"),
    };
    return labels[stage.id] ?? stage.label;
  };
  const saveStateLabel = saveWorkflow.isPending
    ? t("savingChanges")
    : saved
      ? t("workflowSaved")
      : dirty
        ? t("unsavedEdits")
        : t("liveConfig");

  return (
    <FeatureGate feature="workflowCustomization">
    <div className="page-container space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateSelector(!showTemplateSelector)}
              className="gap-1.5 rounded-xl border-border"
            >
              <BookTemplate className="h-4 w-4" />
              {t("templates")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveAsTemplate(!showSaveAsTemplate)}
              className="gap-1.5 rounded-xl border-border"
            >
              <Copy className="h-4 w-4" />
              {t("saveAsTemplate")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveWorkflow.isPending || !dirty}
              className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              size="sm"
            >
              {saveWorkflow.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveWorkflow.isPending ? tc("loading") : saved ? "✓" : t("saveWorkflow")}
            </Button>
          </div>
        }
      />

      {/* ─── Template Selector ─── */}
      {showTemplateSelector && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("loadFromTemplate")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("loadFromTemplateDesc")}</p>
            </div>
            <button onClick={() => setShowTemplateSelector(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>
          {templatesLoading ? (
            <div className="h-16 animate-pulse rounded-xl border border-border bg-background/70" />
          ) : templates && templates.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => (
                <button
                  key={tpl._id}
                  onClick={() => applyTemplate(tpl)}
                  className="rounded-xl border border-border bg-background/80 p-3 text-left transition-all hover:border-sky-500/40 hover:bg-sky-500/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                    <Badge variant={tpl.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                      {tpl.scope === "system" ? t("systemTemplate") : t("customTemplate")}
                    </Badge>
                    {tpl.isDefault && <Badge variant="secondary" className="text-[10px]">{t("defaultTemplate")}</Badge>}
                  </div>
                  {tpl.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{tpl.description}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {t("templateStageSummary", {
                      count: tpl.stages.filter((s) => s.enabled).length,
                      state: tpl.settings.aiAutoScreen ? t("aiOn") : t("aiOff"),
                    })}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
              {t("noTemplates")}
            </p>
          )}
        </section>
      )}

      {/* ─── Save as Template ─── */}
      {showSaveAsTemplate && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t("templateNamePlaceholder")}
              maxLength={100}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSaveAsTemplate()}
            />
            <Button
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || createTemplate.isPending}
              className="gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              size="sm"
            >
              {createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowSaveAsTemplate(false); setTemplateName(""); }} className="rounded-xl">
              {t("cancel")}
            </Button>
          </div>
        </section>
      )}

      {/* Template saved banner */}
      {templateSaved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-status-selected dark:text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          {t("templateSaved")}
        </div>
      )}

      {/* Unsaved changes banner */}
      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-status-shortlisted dark:text-amber-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {t("unsavedChanges")}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-status-rejected dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200">✕</button>
        </div>
      )}

      <DashboardPageHeader
        headingLevel={2}
        icon={Settings2}
        eyebrow={t("pipelineAutomation")}
        title={t("pipelineAutomationDesc")}
        description={t("reorderStages")}
        summary={{ label: t("pipelinePreview"), value: `${activeStages.length} ${t("live")}`, note: t("pipelinePreviewDesc") }}
        metrics={[
          { label: t("activeStages"), value: activeStages.length, note: t("activeStagesDesc"), icon: Settings2 },
          { label: t("automatedSteps"), value: automatedStages, note: t("automatedStepsDesc"), icon: Sparkles },
          { label: saveStateLabel, value: notifyOnStageChange ? t("alertsEnabled") : t("alertsDisabled"), note: t("liveConfigDesc"), icon: Bell },
        ]}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* ─── Pipeline Stages ─── */}
        <section className="workspace-panel-surface space-y-4 rounded-[28px] p-4 sm:p-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("workflowBuilder")}</p>
              <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-status-applied" /> {t("pipelineStages")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("builderDesc")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingStage(!addingStage)}
              disabled={stages.length >= 20}
              className="w-full gap-1.5 rounded-xl border-border bg-background/80 hover:bg-background sm:w-auto"
            >
              <Plus className="h-3.5 w-3.5" /> {t("addStage")}
            </Button>
          </div>

          {/* Add stage input */}
          {addingStage && (
            <div className="flex flex-col items-stretch gap-2 rounded-[22px] border border-dashed border-sky-500/30 bg-sky-500/10 p-4 sm:flex-row sm:items-center">
              <Input
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder={t("stageNamePlaceholder")}
                className="h-10 flex-1 border-border bg-background/80"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && addStage()}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={addStage}
                  disabled={!newStageLabel.trim()}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none"
                >
                  {t("add")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddingStage(false); setNewStageLabel(""); }}
                  className="flex-1 rounded-xl text-muted-foreground hover:bg-background/70 sm:flex-none"
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}

          {/* Stages list */}
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-background/60 py-16 text-center">
              <Settings2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">{t("noStages")}</p>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                {t("noStagesDesc")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setStages(DEFAULT_STAGES); markDirty(); }}
                className="gap-1.5 rounded-xl border-border bg-background/80 hover:bg-background"
              >
                <Plus className="h-3.5 w-3.5" /> {t("useDefaultPipeline")}
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
                          <span className="truncate text-sm font-semibold text-foreground">{getStageLabel(stage)}</span>
                          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {stage.enabled ? t("enabled") : t("paused")}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t("autoProgress")}</span>
                            <Switch
                              checked={stage.autoProgress}
                              onCheckedChange={() => toggleStage(stage.id, "autoProgress")}
                              disabled={!stage.enabled}
                              className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 rtl:data-[state=checked]:[&>span]:-translate-x-5 [&>span]:h-5 [&>span]:w-5"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t("stage")}</span>
                            <Switch
                              checked={stage.enabled}
                              onCheckedChange={() => toggleStage(stage.id, "enabled")}
                              className="h-6 w-11 data-[state=checked]:[&>span]:translate-x-5 rtl:data-[state=checked]:[&>span]:-translate-x-5 [&>span]:h-5 [&>span]:w-5"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:text-red-300"
                        title={t("removeStage")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-background/70 px-2.5 py-1">{t("order", { order: stage.order })}</span>
                      <span className="rounded-full bg-background/70 px-2.5 py-1">
                        {stage.autoProgress ? t("movesAutomatically") : t("manualReviewRequired")}
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("automation")}</p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{t("recruitmentRules")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("rulesDesc")}</p>
            </div>

            {/* AI Auto-Screening */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Sparkles className="h-4 w-4 text-status-interview dark:text-violet-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{t("aiAutoScreening")}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={aiAutoScreen}
                        onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }}
                      />
                      <Badge
                        variant={aiAutoScreen ? "default" : "secondary"}
                        className="w-16 justify-center rounded-full text-[10px]"
                      >
                        {aiAutoScreen ? t("enabled") : t("disabled")}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("aiAutoScreeningDesc")}</p>
                </div>
              </div>
            </div>

            {/* Notify Candidates */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500/10">
                  <Bell className="h-4 w-4 text-status-applied dark:text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{t("notifyCandidates")}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={notifyOnStageChange}
                        onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }}
                      />
                      <Badge
                        variant={notifyOnStageChange ? "default" : "secondary"}
                        className="w-16 justify-center rounded-full text-[10px]"
                      >
                        {notifyOnStageChange ? t("enabled") : t("disabled")}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("notifyCandidatesDesc")}</p>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border/60" />

            {/* Auto-reject slider */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
                  <ShieldAlert className="h-4 w-4 text-status-rejected dark:text-red-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{t("autoRejectThreshold")}</p>
                    <span className="text-lg font-bold text-status-applied dark:text-sky-300">{autoRejectBelow}%</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.rich("autoRejectThresholdDesc", {
                      value: autoRejectBelow,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
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
                <span>{t("thresholdOff")}</span>
                <span>{t("thresholdDefault")}</span>
                <span>{t("thresholdStrict")}</span>
              </div>
            </div>

            <div className="rounded-[22px] border border-border bg-background/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("guidance")}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{t("guidanceTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("guidanceDesc")}
              </p>
            </div>
          </section>

          {/* Mobile save button */}
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 lg:hidden disabled:bg-muted disabled:text-muted-foreground"
          >
            {saveWorkflow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveWorkflow.isPending ? t("saving") : saved ? t("saved") : t("saveWorkflow")}
          </Button>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}
