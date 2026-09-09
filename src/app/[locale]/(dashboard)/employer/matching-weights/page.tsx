"use client";

import { useTranslations } from "next-intl";

import { useState, useEffect } from "react";
import { Save, RotateCcw, Loader2, CheckCircle, BookTemplate, Copy } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { useMatchingWeights, useSaveMatchingWeights, type MatchingWeights } from "@/hooks/useMatchingWeights";
import {
  WEIGHT_LABEL_KEYS,
  WeightBuilderHeader,
  WeightDistributionPanel,
  WeightSliderRow,
  WeightTuningPanel,
} from "@/components/features/employer/matching-weights/WeightBuilder";
import {
  useEmployerMatchingWeightTemplates,
  useCreateEmployerMatchingWeightTemplate,
  type MatchingWeightTemplateItem,
} from "@/hooks/useMatchingWeightTemplates";

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 40,
  experience: 30,
  education: 15,
  industryExperience: 10,
  preferredQualifications: 5,
};

export default function EmployerMatchingWeightsPage() {
  const t = useTranslations("employerMatchingWeights");
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

  // Seed local state from server data. Pick only known keys so a stale
  // legacy 8-key payload can never leak unknown keys into render.
  useEffect(() => {
    if (!serverWeights) return;
    setWeights((prev) => {
      const next = { ...DEFAULT_WEIGHTS };
      for (const k of Object.keys(next) as Array<keyof MatchingWeights>) {
        if (typeof serverWeights[k] === "number") next[k] = serverWeights[k];
      }
      return { ...prev, ...next };
    });
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

  if (loading) return (
    <div className="page-container">
      <div className="h-40 animate-pulse rounded-3xl border border-border bg-background/70" />
      <div className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
        <div className="h-[28rem] animate-pulse rounded-3xl border border-border bg-background/70" />
        <div className="h-[28rem] animate-pulse rounded-3xl border border-border bg-background/70" />
      </div>
    </div>
  );

  return (
    <FeatureGate feature="matchingWeightCustomization">
    <div className="page-container">
      <WorkspaceHeader
        title={t("title")}
        context={t("description")}
        actions={
          /* One row. Phones use a shorter label rather than a squeezed pill —
             the full text in a flex-1 button spilled outside its own pill. */
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
          </div>
        }
      />

      {/* ─── Template Selector ─── */}
      {showTemplateSelector && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-3 panel-body">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="heading-label font-semibold text-foreground">Load from Template</h3>
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
                    className="rounded-xl border border-border bg-background/80 text-left transition-all hover:border-sky-500/40 hover:bg-sky-500/5 chip-pad"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                      <Badge variant={tpl.scope === "system" ? "outline" : "secondary"} className="text-[11px]">
                        {tpl.scope === "system" ? "System" : "Custom"}
                      </Badge>
                    </div>
                    {tpl.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{tpl.description}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Top: {t(WEIGHT_LABEL_KEYS[topKey])} ({tpl.weights[topKey]}%)
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-background/60 text-center text-sm text-muted-foreground card-pad">
              No matching weight templates available yet.
            </p>
          )}
        </section>
      )}

      {/* ─── Save as Template ─── */}
      {showSaveAsTemplate && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 panel-body">
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
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-status-selected">
          <CheckCircle className="h-4 w-4" />
          {t("templateSavedSuccess")}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-status-rejected">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Sliders */}
        <section className="workspace-panel-surface space-y-5 rounded-3xl panel-body">
          {/* Header, rows and the right-hand panels are shared with the job's
              Setup tab (WeightBuilder.tsx) so the two screens stay identical. */}
          <WeightBuilderHeader weights={weights} total={total} />

          {weightKeys.map((key) => (
            <WeightSliderRow
              key={key}
              weightKey={key}
              value={weights[key]}
              onChange={(value) => updateWeight(key, value)}
            />
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveWeights.isPending || !isTotalValid}
              className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
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
            <p className="text-sm text-muted-foreground">{t("keepStrongest")}</p>
          </div>
        </section>

        {/* Visualization */}
        <div className="space-y-5">
          <WeightDistributionPanel weights={weights} total={total} />
          <WeightTuningPanel />
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}
