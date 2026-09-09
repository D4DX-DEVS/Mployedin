"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sliders, Save, RotateCcw, Loader2, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJobMatchingWeights, useSaveJobMatchingWeights, type MatchingWeights } from "@/hooks/useJobMatchingWeights";
import {
  DEFAULT_MATCHING_WEIGHTS,
  WEIGHT_KEYS,
  WeightBuilderHeader,
  WeightDistributionPanel,
  WeightSliderRow,
  WeightTuningPanel,
  sumWeights,
} from "@/components/features/employer/matching-weights/WeightBuilder";

interface Props { jobId: string; }

/**
 * Setup → Matching weights for one job. Same builder as the employer-wide
 * page (`WeightBuilder.tsx`); only the source banner and the save verb are
 * job-specific. The three summary tiles that used to sit above the sliders
 * restated the total chip and the "Top priority" line and are gone.
 */
export function JobMatchingWeightsTab({ jobId }: Props) {
  const t = useTranslations("jobMatchingWeightsTab");
  const tw = useTranslations("employerMatchingWeights");
  const { data: serverData, isLoading: loading } = useJobMatchingWeights(jobId);
  const saveWeights = useSaveJobMatchingWeights(jobId);

  const [weights, setWeights] = useState<MatchingWeights>(DEFAULT_MATCHING_WEIGHTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"job" | "employer">("employer");

  useEffect(() => {
    if (serverData) {
      setWeights(serverData.weights);
      setSource(serverData.source);
    }
  }, [serverData]);

  const total = sumWeights(weights);
  const isTotalValid = total === 100;

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

  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="h-12 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-96 animate-pulse rounded-3xl border border-border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {source === "employer" && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700">
          <Sliders className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t("usingEmployerDefaults")}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-status-rejected">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t("dismiss")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-500/10">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        <section className="workspace-panel-surface space-y-5 rounded-3xl panel-body">
          <WeightBuilderHeader weights={weights} total={total} />

          {WEIGHT_KEYS.map((key) => (
            <WeightSliderRow
              key={key}
              weightKey={key}
              idPrefix="job-weight"
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
              {saveWeights.isPending ? tw("saving") : saved ? t("saved") : t("saveWeightsForThisJob")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWeights(DEFAULT_MATCHING_WEIGHTS)}
              className="gap-2 rounded-xl border-border bg-background/80 hover:bg-background"
            >
              <RotateCcw className="h-4 w-4" /> {tw("resetDefaults")}
            </Button>
            <p className="text-sm text-muted-foreground">{tw("keepStrongest")}</p>
          </div>
        </section>

        <div className="space-y-5">
          <WeightDistributionPanel weights={weights} total={total} />
          <WeightTuningPanel />
        </div>
      </div>
    </div>
  );
}
