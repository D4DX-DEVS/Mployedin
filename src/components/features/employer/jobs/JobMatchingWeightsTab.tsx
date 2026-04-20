"use client";

import { useState, useEffect } from "react";
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
  skills: 27, experience: 23, education: 13, location: 9,
  salary: 9, languages: 5, availability: 4, behaviorSignals: 10,
};

const WEIGHT_LABELS: Record<keyof MatchingWeights, string> = {
  skills: "Skills Match", experience: "Years of Experience",
  education: "Education Level", location: "Location Preference",
  salary: "Salary Expectation", languages: "Language Match",
  availability: "Availability", behaviorSignals: "Behavior Signals",
};

const WEIGHT_DESCRIPTIONS: Record<keyof MatchingWeights, string> = {
  skills: "How closely the candidate's technical skills match the job requirements",
  experience: "Weight given to years of relevant work experience",
  education: "Degree level and field of study relevance",
  location: "Candidate's location vs. job country/city preferences",
  salary: "Candidate's salary expectations vs. offered range",
  languages: "Match on required language proficiencies",
  availability: "Immediate availability for joining",
  behaviorSignals: "AI-inferred soft skills, communication style, and culture fit signals",
};

interface Props { jobId: string; }

export function JobMatchingWeightsTab({ jobId }: Props) {
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
      setError("Failed to save matching weights");
    }
  };

  const isTotalValid = total === 100;
  const weightKeys = Object.keys(weights) as Array<keyof MatchingWeights>;
  const topPriority = weightKeys.reduce((highest, key) =>
    weights[key] > weights[highest] ? key : highest, weightKeys[0]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Source indicator */}
      {source === "employer" && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200">
          <Sliders className="h-4 w-4 shrink-0" />
          Using employer default weights. Customise below to set job-specific scoring.
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-base p-4">
          <Scale className="h-5 w-5 text-sky-600 dark:text-sky-300" />
          <p className="mt-2 text-sm font-semibold text-foreground">Total at {total}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Must total 100% before saving.</p>
        </div>
        <div className="card-base p-4">
          <Target className="h-5 w-5 text-sky-600 dark:text-sky-300" />
          <p className="mt-2 text-sm font-semibold text-foreground">Top: {WEIGHT_LABELS[topPriority]}</p>
          <p className="mt-1 text-xs text-muted-foreground">Strongest influence at {weights[topPriority]}%.</p>
        </div>
        <div className="card-base p-4">
          <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-300" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            {saveWeights.isPending ? "Saving…" : saved ? "Weights saved" : "Ready to update"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Scoring updates after you save.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        {/* Weight sliders */}
        <div className="card-base p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sliders className="h-4 w-4 text-sky-600" /> Weight Configuration
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isTotalValid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-300"}`}>
              {total}% {isTotalValid ? "✓" : "Need 100%"}
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
              {saveWeights.isPending ? "Saving…" : saved ? "Saved!" : "Save Weights for this Job"}
            </Button>
            <Button variant="outline" onClick={() => setWeights(DEFAULT_WEIGHTS)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Reset Defaults
            </Button>
          </div>
        </div>

        {/* Distribution overview */}
        <div className="space-y-4">
          <div className="card-base p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Weight Distribution</h3>
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
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
              {isTotalValid
                ? "✓ Weights balanced. Candidates will be ranked by these priorities."
                : `⚠ Total is ${total}%. Adjust to 100%.`}
            </div>
          </div>

          <div className="card-base p-5">
            <Sparkles className="h-4 w-4 text-sky-600 mb-2" />
            <h4 className="text-sm font-semibold text-foreground">Tuning Tip</h4>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              Increase skills and experience for technical roles. Raise behavior signals for client-facing positions. Keep salary and location lighter unless they are strict filters.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
