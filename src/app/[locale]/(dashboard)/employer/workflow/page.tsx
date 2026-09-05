"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, ChevronDown, ChevronUp,
  Save, Loader2, CheckCircle, Plus, Trash2, Sparkles, Bell, ShieldAlert, Info,
  BookTemplate, Copy,
} from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkflow, useSaveWorkflow, type WorkflowStage } from "@/hooks/useWorkflow";
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
      <div className="page-container">
        <div className="h-40 animate-pulse rounded-3xl border border-border bg-background/70" />
        <div className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl border border-border bg-background/70" />
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
  return (
    <FeatureGate feature="workflowCustomization">
    <div className="page-container">
      <WorkspaceHeader
        title={t("title")}
        context={t("description")}
        actions={
          /* All three stay on one row. Phones use shorter labels rather than a
             squeezed pill: forcing the full text into a flex-1 button made the
             label spill outside its own pill. */
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 sm:w-auto sm:gap-2 [&>button]:min-w-0 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:text-xs sm:[&>button]:px-3 sm:[&>button]:text-sm [&_svg]:shrink-0">
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
              <span className="sm:hidden">{t("saveAsTemplateShort")}</span>
              <span className="hidden sm:inline">{t("saveAsTemplate")}</span>
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
              {saveWorkflow.isPending ? tc("loading") : saved ? "✓" : (
                <>
                  <span className="sm:hidden">{tc("save")}</span>
                  <span className="hidden sm:inline">{t("saveWorkflow")}</span>
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* ─── Template Selector ─── */}
      {showTemplateSelector && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-3 panel-body">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="heading-label font-semibold text-foreground">{t("loadFromTemplate")}</h3>
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
                  className="rounded-xl border border-border bg-background/80 text-left transition-all hover:border-sky-500/40 hover:bg-sky-500/5 chip-pad"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                    <Badge variant={tpl.scope === "system" ? "outline" : "secondary"} className="text-[11px]">
                      {tpl.scope === "system" ? t("systemTemplate") : t("customTemplate")}
                    </Badge>
                    {tpl.isDefault && <Badge variant="secondary" className="text-[11px]">{t("defaultTemplate")}</Badge>}
                  </div>
                  {tpl.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{tpl.description}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("templateStageSummary", {
                      count: tpl.stages.filter((s) => s.enabled).length,
                      state: tpl.settings.aiAutoScreen ? t("aiOn") : t("aiOff"),
                    })}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-background/60 text-center text-sm text-muted-foreground card-pad">
              {t("noTemplates")}
            </p>
          )}
        </section>
      )}

      {/* ─── Save as Template ─── */}
      {showSaveAsTemplate && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 panel-body">
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
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-status-selected">
          <CheckCircle className="h-4 w-4" />
          {t("templateSaved")}
        </div>
      )}

      {/* Unsaved changes banner */}
      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-status-shortlisted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {t("unsavedChanges")}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-status-rejected">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* ─── Pipeline Stages ─── */}
        <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body">
          <div className="flex min-w-0 flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("workflowBuilder")}</p>
              <h3 className="heading-subsection mt-2 flex items-center gap-2 font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-status-applied" /> {t("pipelineStages")}
              </h3>
              {/* Phones show only the live counts — the instructional sentence
                  wrapped to three lines next to the Add stage button and pushed
                  the first stage off screen. */}
              <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                {t("builderDesc")}
              </p>
              {/* Live counts as one line. They used to be a second full header
                  with three metric tiles that repeated the stage list below. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {activeStages.length} {t("activeStages")}
                <span className="px-1.5 text-border">•</span>
                {automatedStages} {t("automatedSteps")}
                <span className="px-1.5 text-border">•</span>
                {notifyOnStageChange ? t("alertsEnabled") : t("alertsDisabled")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingStage(!addingStage)}
              disabled={stages.length >= 20}
              className="w-auto shrink-0 gap-1.5 rounded-xl border-border bg-background/80 hover:bg-background"
            >
              <Plus className="h-3.5 w-3.5" /> {t("addStage")}
            </Button>
          </div>

          {/* Add stage input */}
          {addingStage && (
            <div className="flex flex-col items-stretch gap-2 rounded-3xl border border-dashed border-sky-500/30 bg-sky-500/10 sm:flex-row sm:items-center card-pad">
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
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-background/60 py-16 text-center">
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
                    className={`group rounded-2xl border p-3 transition-all sm:rounded-3xl sm:p-4 ${ stage.enabled ? "border-border bg-background/80 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.45)] hover:border-sky-500/25" : "border-border/80 bg-background/55 opacity-70" }`}
                  >
                    {/* Header: number, name, state, delete. The reorder arrows
                        used to own a full-height rail down the left, which cost
                        ~32px of width on every card and left a dead gap once the
                        controls stacked. They now sit in the footer. */}
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60 text-xs font-semibold text-muted-foreground sm:h-9 sm:w-9 sm:rounded-2xl">
                        {stage.order}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_COLORS[stage.id] ?? "bg-gray-400"}`} />
                        <span className="min-w-0 text-sm font-semibold text-foreground">{getStageLabel(stage)}</span>
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {stage.enabled ? t("enabled") : t("paused")}
                        </span>
                      </div>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="shrink-0 rounded-xl p-2 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                        title={t("removeStage")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Both toggles on ONE line, full card width. Sharing the
                        name's row made each toggle wrap onto a line of its own.
                        The labels are nowrap so they never clip to "Auto Prog…",
                        and the switch is its real 36x20 — a global 44px
                        min-height on dashboard buttons had inflated it. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="whitespace-nowrap" id={`autoProgress-${stage.id}`}>{t("autoProgress")}</span>
                        <Switch
                          className="tap-target-box"
                          checked={stage.autoProgress}
                          onCheckedChange={() => toggleStage(stage.id, "autoProgress")}
                          disabled={!stage.enabled}
                          aria-labelledby={`autoProgress-${stage.id}`}
                        />
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="whitespace-nowrap" id={`stage-enabled-${stage.id}`}>{t("stage")}</span>
                        <Switch
                          className="tap-target-box"
                          checked={stage.enabled}
                          onCheckedChange={() => toggleStage(stage.id, "enabled")}
                          aria-labelledby={`stage-enabled-${stage.id}`}
                        />
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground sm:mt-3 sm:gap-2 sm:pt-3">
                      <span className="rounded-full bg-background/70 px-2 py-0.5">{t("order", { order: stage.order })}</span>
                      <span className="rounded-full bg-background/70 px-2 py-0.5">
                        {stage.autoProgress ? t("movesAutomatically") : t("manualReviewRequired")}
                      </span>
                      <span className="ms-auto flex items-center gap-0.5">
                        <button
                          onClick={() => moveStage(i, "up")}
                          disabled={i === 0}
                          className="rounded-lg p-1.5 transition-colors hover:bg-background hover:text-foreground disabled:opacity-20"
                          aria-label={`Move ${getStageLabel(stage)} up`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => moveStage(i, "down")}
                          disabled={i === sortedStages.length - 1}
                          className="rounded-lg p-1.5 transition-colors hover:bg-background hover:text-foreground disabled:opacity-20"
                          aria-label={`Move ${getStageLabel(stage)} down`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* ─── Automation Settings ─── */}
        <div className="space-y-4">
          <section className="workspace-panel-surface space-y-5 rounded-3xl panel-body">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("automation")}</p>
              <h3 className="heading-subsection mt-2 font-semibold text-foreground">{t("recruitmentRules")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("rulesDesc")}</p>
            </div>

            {/* AI Auto-Screening */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Sparkles className="h-4 w-4 text-status-interview" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p id="wf-ai-auto-screening" className="truncate text-sm font-medium text-foreground">{t("aiAutoScreening")}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        className="tap-target-box"
                        aria-labelledby="wf-ai-auto-screening"
                        checked={aiAutoScreen}
                        onCheckedChange={(v) => { setAiAutoScreen(v); markDirty(); }}
                      />
                      <Badge
                        variant={aiAutoScreen ? "default" : "secondary"}
                        className="min-w-[4.75rem] justify-center whitespace-nowrap rounded-full px-2 text-[11px]"
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
                  <Bell className="h-4 w-4 text-status-applied" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p id="wf-notify-candidates" className="truncate text-sm font-medium text-foreground">{t("notifyCandidates")}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        className="tap-target-box"
                        aria-labelledby="wf-notify-candidates"
                        checked={notifyOnStageChange}
                        onCheckedChange={(v) => { setNotifyOnStageChange(v); markDirty(); }}
                      />
                      <Badge
                        variant={notifyOnStageChange ? "default" : "secondary"}
                        className="min-w-[4.75rem] justify-center whitespace-nowrap rounded-full px-2 text-[11px]"
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
                  <ShieldAlert className="h-4 w-4 text-status-rejected" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1">
                      <p className="text-sm font-medium text-foreground">{t("autoRejectThreshold")}</p>
                      {/* Guidance moved out of its own card into this popover —
                          it is a footnote about thresholds, not a section. */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("guidanceTitle")}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72">
                          <p className="text-sm font-semibold text-foreground">{t("guidanceTitle")}</p>
                          <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">{t("guidanceDesc")}</p>
                        </PopoverContent>
                      </Popover>
                    </span>
                    <span className="text-lg font-bold text-status-applied">{autoRejectBelow}%</span>
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
                aria-label={t("autoRejectThreshold")}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t("thresholdOff")}</span>
                <span>{t("thresholdDefault")}</span>
                <span>{t("thresholdStrict")}</span>
              </div>
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
