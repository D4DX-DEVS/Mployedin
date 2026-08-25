"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sliders, Save, RotateCcw, Loader2, CheckCircle,
  Sparkles, Target, Scale, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useJobMatchingWeights, useSaveJobMatchingWeights,
  type MatchingWeights,
} from "@/hooks/useJobMatchingWeights";

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 40, experience: 30, education: 15,
  industryExperience: 10, preferredQualifications: 5,
};

const WEIGHT_LABELS: Record<keyof MatchingWeights, string> = {
  skills: "Skills Match", experience: "Relevant Experience",
  education: "Education & Certifications",
  industryExperience: "Role / Industry Experience",
  preferredQualifications: "Preferred Qualifications",
};

const WEIGHT_DESCRIPTIONS: Record<keyof MatchingWeights, string> = {
  skills: "How closely the candidate's technical skills match the job requirements",
  experience: "Depth and relevance of experience for this specific role, not just total years",
  education: "Degree, field of study, licenses and certifications relevant to the role",
  industryExperience: "Experience in the same role type or industry",
  preferredQualifications: "Nice-to-have qualifications listed on the job",
};

interface Props { jobId: string; }

export function JobMatchingWeightsTab({ jobId }: Props) {
  const t = useTranslations("jobMatchingWeightsTab");
  const { data: serverData, isLoading: loading } = useJobMatchingWeights(jobId);
  const saveWeights = useSaveJobMatchingWeights(jobId);

  const [weights, setWeights] = useState<MatchingWeights>(DEFAULT_WEIGHTS);
  const [saved, setSaved] = useState(false);
  const [total, setTotal] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"job" | "employer">("employer");

  useEffect(() => {
    if (serverData) {
      setWeights(serverData.weights);
      setSource(serverData.source);
    }
  }, [serverData]);

  useEffect(() => {
    setTotal(Object.values(weights).reduce((a, b) => a + b, 0));
  }, [weights]);

  const updateWeight = (key: keyof MatchingWeights, value: number) => {
    setSaved(false);
    setError(null);
    setWeights((w) => ({ ...w, [key]: Math.max(0, Math.min(100, value)) }));
  };

  const handleSave = async () => {
    try {
      await saveWeights.mutateAsync(weights);
      setSaved(true);
      setError(null);
      setSource("job");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t("failedToSaveMatchingWeights"));
    }
  };

  const isTotalValid = total === 100;
  const weightKeys = Object.keys(weights) as Array<keyof MatchingWeights>;
  const topPriority = weightKeys.reduce((highest, key) =>
    weights[key] > weights[highest] ? key : highest, weightKeys[0]);

  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Source indicator */}
      {source === "employer" && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700">
          <Sliders className="h-4 w-4 shrink-0" />
          Using employer default weights. Customise below to set job-specific scoring.
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-base panel-body">
          <Scale className="h-5 w-5 text-sky-600" />
          <p className="mt-2 text-sm font-semibold text-foreground">{t("totalAt", { total })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("mustTotal100PercentBeforeSaving")}</p>
        </div>
        <div className="card-base panel-body">
          <Target className="h-5 w-5 text-sky-600" />
          <p className="mt-2 text-sm font-semibold text-foreground">{t("top")}: {WEIGHT_LABELS[topPriority]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("strongestInfluenceAt", { percent: weights[topPriority] })}</p>
        </div>
        <div className="card-base panel-body">
          <BarChart3 className="h-5 w-5 text-sky-600" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            {saveWeights.isPending ? t("saving") : saved ? t("weightsSaved") : t("readyToUpdate")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("scoringUpdatesAfterYouSave")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Weight sliders */}
        <div className="card-base space-y-3 sm:space-y-4 panel-body">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sliders className="h-4 w-4 text-sky-600" /> {t("weightConfiguration")}
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isTotalValid ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>
              {total}% {isTotalValid ? "✓" : t("need100Percent")}
            </span>
          </div>

          {weightKeys.map((key) => (
            <div key={key} className="rounded-xl border border-border bg-background/60 p-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-sm">
                  <label className="text-sm font-semibold text-foreground">{WEIGHT_LABELS[key]}</label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{WEIGHT_DESCRIPTIONS[key]}</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <Input
                    type="number" min={0} max={100}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, parseInt(e.target.value) || 0)}
                    className="h-9 w-20 text-center text-sm"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                </div>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={weights[key]}
                onChange={(e) => updateWeight(key, parseInt(e.target.value))}
                className="mt-3 h-1.5 w-full cursor-pointer accent-sky-600"
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
            <Button
              onClick={handleSave}
              disabled={saveWeights.isPending || !isTotalValid}
              className="gap-2 bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300"
            >
              {saveWeights.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saveWeights.isPending ? t("saving") : saved ? t("saved") : t("saveWeightsForThisJob")}
            </Button>
            <Button variant="outline" onClick={() => setWeights(DEFAULT_WEIGHTS)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> {t("resetDefaults")}
            </Button>
          </div>
        </div>

        {/* Distribution overview */}
        <div className="space-y-3 sm:space-y-4">
          <div className="card-base space-y-3 panel-body">
            <h3 className="text-sm font-semibold text-foreground">{t("weightDistribution")}</h3>
            {weightKeys.map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{WEIGHT_LABELS[key]}</span>
                  <span className="font-medium text-foreground">{weights[key]}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div className="h-full rounded-full bg-sky-600 transition-all duration-300" style={{ width: `${weights[key]}%` }} />
                </div>
              </div>
            ))}

            <div className={`mt-3 rounded-xl p-3 text-sm ${isTotalValid
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-amber-500/10 text-amber-700"}`}>
              {isTotalValid
                ? t("weightsBalanced")
                : t("totalIsAdjustTo100", { total })}
            </div>
          </div>

          <div className="card-base panel-body">
            <Sparkles className="h-4 w-4 text-sky-600 mb-2" />
            <h4 className="text-sm font-semibold text-foreground">{t("tuningTip")}</h4>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              {t("tuningTipDescription")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
