"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect } from "react";
import { Sliders, Save, RotateCcw, Loader2, CheckCircle, Sparkles, Target, Scale, BarChart3, BookTemplate, Copy } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { useMatchingWeights, useSaveMatchingWeights, type MatchingWeights } from "@/hooks/useMatchingWeights";
import {
  useEmployerMatchingWeightTemplates,
  useCreateEmployerMatchingWeightTemplate,
  type MatchingWeightTemplateItem,
} from "@/hooks/useMatchingWeightTemplates";

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 27,
  experience: 23,
  education: 13,
  location: 9,
  salary: 9,
  languages: 5,
  availability: 4,
  behaviorSignals: 10,
};

const WEIGHT_LABEL_KEYS: Record<keyof MatchingWeights, string> = {
  skills: "skillsMatch",
  experience: "yearsOfExperience",
  education: "educationLevel",
  location: "locationPreference",
  salary: "salaryExpectation",
  languages: "languageMatch",
  availability: "availability",
  behaviorSignals: "behaviorSignals",
};

const WEIGHT_DESC_KEYS: Record<keyof MatchingWeights, string> = {
  skills: "skillsMatchDesc",
  experience: "yearsOfExperienceDesc",
  education: "educationLevelDesc",
  location: "locationPreferenceDesc",
  salary: "salaryExpectationDesc",
  languages: "languageMatchDesc",
  availability: "availabilityDesc",
  behaviorSignals: "behaviorSignalsDesc",
};

export default function EmployerMatchingWeightsPage() {
  const t = useTranslations("employerMatchingWeights");
  const tc = useTranslations("employerCommon");
  const { data: serverWeights, isLoading: loading } = useMatchingWeights();
  const saveWeights = useSaveMatchingWeights();
  const { data: templates, isLoading: templatesLoading } = useEmployerMatchingWeightTemplates();
  const createTemplate = useCreateEmployerMatchingWeightTemplate();

  const [weights, setWeights] = useState<MatchingWeights>(DEFAULT_WEIGHTS);
  const [saved, setSaved] = useState(false);
  const [total, setTotal] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);

  // Seed local state from server data
  useEffect(() => {
    if (serverWeights) setWeights(serverWeights);
  }, [serverWeights]);

  useEffect(() => {
    setTotal(Object.values(weights).reduce((a, b) => a + b, 0));
  }, [weights]);

  const updateWeight = (key: keyof MatchingWeights, value: number) => {
    setSaved(false);
    setError(null);
    setWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, value)) }));
  };

  const handleSave = async () => {
    try {
      await saveWeights.mutateAsync(weights);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save matching weights");
    }
  };

  const applyTemplate = (tpl: MatchingWeightTemplateItem) => {
    setWeights(tpl.weights);
    setShowTemplateSelector(false);
    setSaved(false);
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await createTemplate.mutateAsync({
        name: templateName.trim(),
        weights,
      });
      setTemplateSaved(true);
      setShowSaveAsTemplate(false);
      setTemplateName("");
      setTimeout(() => setTemplateSaved(false), 3000);
    } catch {
      setError("Failed to save template");
    }
  };

  const isTotalValid = total === 100;
  const weightKeys = Object.keys(weights) as Array<keyof MatchingWeights>;
  const topPriority = weightKeys.reduce((highest, key) => (
    weights[key] > weights[highest] ? key : highest
  ), weightKeys[0]);
  const saveStateLabel = saveWeights.isPending ? "Saving changes" : saved ? "Weights saved" : "Ready to update";

  if (loading) return (
    <div className="page-container employer-legacy-surface space-y-4">
      <div className="h-40 animate-pulse rounded-[28px] border border-border bg-background/70" />
      <div className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
        <div className="h-[28rem] animate-pulse rounded-[28px] border border-border bg-background/70" />
        <div className="h-[28rem] animate-pulse rounded-[28px] border border-border bg-background/70" />
      </div>
    </div>
  );

  return (
    <FeatureGate feature="matchingWeightCustomization">
    <div className="page-container employer-legacy-surface space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
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
          </div>
        }
      />

      {/* ─── Template Selector ─── */}
      {showTemplateSelector && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Load from Template</h3>
              <p className="mt-1 text-xs text-muted-foreground">Select a matching weight preset to apply</p>
            </div>
            <button onClick={() => setShowTemplateSelector(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>
          {templatesLoading ? (
            <div className="h-16 animate-pulse rounded-xl border border-border bg-background/70" />
          ) : templates && templates.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => {
                const wKeys = Object.keys(tpl.weights) as Array<keyof MatchingWeights>;
                const topKey = wKeys.reduce((h, k) => (tpl.weights[k] > tpl.weights[h] ? k : h), wKeys[0]);
                return (
                  <button
                    key={tpl._id}
                    onClick={() => applyTemplate(tpl)}
                    className="rounded-xl border border-border bg-background/80 p-3 text-left transition-all hover:border-sky-500/40 hover:bg-sky-500/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                      <Badge variant={tpl.scope === "system" ? "outline" : "secondary"} className="text-[10px]">
                        {tpl.scope === "system" ? "System" : "Custom"}
                      </Badge>
                    </div>
                    {tpl.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{tpl.description}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Top: {t(WEIGHT_LABEL_KEYS[topKey])} ({tpl.weights[topKey]}%)
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
              No matching weight templates available yet.
            </p>
          )}
        </section>
      )}

      {/* ─── Save as Template ─── */}
      {showSaveAsTemplate && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name (e.g. Tech Roles — Skills Heavy)"
              maxLength={100}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSaveAsTemplate()}
            />
            <Button
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || !isTotalValid || createTemplate.isPending}
              className="gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              size="sm"
            >
              {createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowSaveAsTemplate(false); setTemplateName(""); }} className="rounded-xl">
              Cancel
            </Button>
          </div>
        </section>
      )}

      {/* Template saved banner */}
      {templateSaved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          Matching weights saved as template successfully!
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200">✕</button>
        </div>
      )}

      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-7">
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Sparkles className="h-4 w-4" />
              {t("rankingControls")}
            </div>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground">
              {t("rankingControlsDesc")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("totalAllocation")}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="workspace-glass-panel rounded-2xl p-4">
                <Scale className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{t("totalAt")} {total}%</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("totalMustBe100")}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <Target className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{t("topPriority")} {t(WEIGHT_LABEL_KEYS[topPriority])}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("currentStrongest")} {weights[topPriority]}%.</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4">
                <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <p className="mt-3 text-sm font-semibold text-foreground">{saveStateLabel}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("readyToUpdateDesc")}</p>
              </div>
            </div>
          </div>

          <div className="workspace-glass-panel rounded-[24px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("scoringPreview")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("scoringPreviewDesc")}</p>
            <div className="mt-5 space-y-3">
              {weightKeys.slice().sort((a, b) => weights[b] - weights[a]).slice(0, 4).map((key) => (
                <div key={key} className="rounded-2xl border border-border bg-background/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                    <span>{t(WEIGHT_LABEL_KEYS[key])}</span>
                    <span>{weights[key]}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
                    <div className="h-full rounded-full bg-sky-600 transition-all duration-300" style={{ width: `${weights[key]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Sliders */}
        <section className="workspace-panel-surface space-y-5 rounded-[28px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("weightBuilder")}</p>
              <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Sliders className="h-4 w-4 text-sky-600" /> Weight configuration
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">Adjust percentages for each scoring signal. The total must stay at 100%.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isTotalValid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-300"}`}>
              Total: {total}% {isTotalValid ? "✓" : "Need 100%"}
            </span>
          </div>

          {weightKeys.map((key) => (
            <div key={key} className="rounded-[22px] border border-border bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <label className="text-sm font-semibold text-foreground">{t(WEIGHT_LABEL_KEYS[key])}</label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(WEIGHT_DESC_KEYS[key])}</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, parseInt(e.target.value) || 0)}
                    className="h-10 w-20 border-border bg-background/80 text-center text-sm"
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[key]}
                onChange={(e) => updateWeight(key, parseInt(e.target.value))}
                className="mt-4 h-1.5 w-full cursor-pointer accent-sky-600"
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveWeights.isPending || !isTotalValid}
              className="gap-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300"
            >
              {saveWeights.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saveWeights.isPending ? t("saving") : saved ? "✓" : t("save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWeights(DEFAULT_WEIGHTS)}
              className="gap-2 rounded-xl border-border bg-background/80 hover:bg-background"
            >
              <RotateCcw className="h-4 w-4" /> {t("resetDefaults")}
            </Button>
            <p className="text-sm text-muted-foreground">Keep the strongest weights for the signals recruiters trust most.</p>
          </div>
        </section>

        {/* Visualization */}
        <div className="space-y-5">
          <section className="workspace-panel-surface space-y-4 rounded-[28px] p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Distribution</p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">Weight overview</h3>
            </div>
            <div className="space-y-3">
              {weightKeys.map((key) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t(WEIGHT_LABEL_KEYS[key])}</span>
                    <span className="font-medium text-foreground">{weights[key]}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all duration-300"
                      style={{ width: `${weights[key]}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-4 rounded-2xl p-4 text-sm ${isTotalValid
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}>
              {isTotalValid
                ? "✓ Weights are balanced correctly. Candidates will be ranked by these priorities."
                : `⚠ Total is ${total}%. Adjust weights to equal exactly 100%.`}
            </div>
          </section>

          <section className="rounded-[28px] border border-border bg-background/60 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.28)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tuning guidance</p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">Start with recruiter intent, not a perfect formula.</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Increase skills and experience for technical hiring, raise behavior signals for client-facing roles, and keep salary or location lighter unless they are strict filters.
            </p>
          </section>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}
