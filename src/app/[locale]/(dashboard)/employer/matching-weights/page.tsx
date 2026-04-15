"use client";

import { useState, useEffect } from "react";
import { Sliders, Save, RotateCcw, Loader2, CheckCircle, Sparkles, Target, Scale, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMatchingWeights, useSaveMatchingWeights, type MatchingWeights } from "@/hooks/useMatchingWeights";

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

const WEIGHT_LABELS: Record<keyof MatchingWeights, string> = {
  skills: "Skills Match",
  experience: "Years of Experience",
  education: "Education Level",
  location: "Location Preference",
  salary: "Salary Expectation",
  languages: "Language Match",
  availability: "Availability",
  behaviorSignals: "Behavior Signals",
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

export default function EmployerMatchingWeightsPage() {
  const { data: serverWeights, isLoading: loading } = useMatchingWeights();
  const saveWeights = useSaveMatchingWeights();

  const [weights, setWeights] = useState<MatchingWeights>(DEFAULT_WEIGHTS);
  const [saved, setSaved] = useState(false);
  const [total, setTotal] = useState(100);
  const [error, setError] = useState<string | null>(null);

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

  const isTotalValid = total === 100;
  const weightKeys = Object.keys(weights) as Array<keyof MatchingWeights>;
  const topPriority = weightKeys.reduce((highest, key) => (
    weights[key] > weights[highest] ? key : highest
  ), weightKeys[0]);
  const saveStateLabel = saveWeights.isPending ? "Saving changes" : saved ? "Weights saved" : "Ready to update";

  if (loading) return (
    <div className="page-container space-y-4">
      <div className="h-40 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
        <div className="h-[28rem] animate-pulse rounded-[28px] border border-slate-200 bg-slate-100" />
        <div className="h-[28rem] animate-pulse rounded-[28px] border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="AI Matching Weights"
        description="Customise how candidates are scored and ranked for your roles"
      />

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-[0_18px_40px_-34px_rgba(220,38,38,0.5)]">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_42%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-7 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.35)]">
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
              <Sparkles className="h-4 w-4" />
              Ranking controls
            </div>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950">
              Tune how the platform prioritises skills, experience, and fit before recruiters review each shortlist.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Adjust the scoring mix for every employer role, keep the total balanced at 100%, and preview the weight distribution before saving.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                <Scale className="h-5 w-5 text-sky-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Total at {total}%</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">The scoring model must total exactly 100% before it can be saved.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                <Target className="h-5 w-5 text-sky-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Top priority: {WEIGHT_LABELS[topPriority]}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Current strongest influence in ranking is set to {weights[topPriority]}%.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                <BarChart3 className="h-5 w-5 text-sky-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">{saveStateLabel}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Recruiter scoring updates only after you save the final distribution.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/85 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scoring preview</p>
            <p className="mt-2 text-sm text-slate-600">High-weight criteria have the most impact when candidates are ranked inside your workflow.</p>
            <div className="mt-5 space-y-3">
              {weightKeys.slice().sort((a, b) => weights[b] - weights[a]).slice(0, 4).map((key) => (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-900">
                    <span>{WEIGHT_LABELS[key]}</span>
                    <span>{weights[key]}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
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
        <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Weight builder</p>
              <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Sliders className="h-4 w-4 text-sky-600" /> Weight configuration
              </h3>
              <p className="mt-1 text-sm text-slate-600">Adjust percentages for each scoring signal. The total must stay at 100%.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isTotalValid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              Total: {total}% {isTotalValid ? "✓" : "Need 100%"}
            </span>
          </div>

          {weightKeys.map((key) => (
            <div key={key} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <label className="text-sm font-semibold text-slate-900">{WEIGHT_LABELS[key]}</label>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{WEIGHT_DESCRIPTIONS[key]}</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, parseInt(e.target.value) || 0)}
                    className="h-10 w-20 border-slate-200 bg-white text-center text-sm"
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">%</span>
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

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveWeights.isPending || !isTotalValid}
              className="gap-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300"
            >
              {saveWeights.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saveWeights.isPending ? "Saving…" : saved ? "Saved!" : "Save Weights"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWeights(DEFAULT_WEIGHTS)}
              className="gap-2 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> Reset Defaults
            </Button>
            <p className="text-sm text-slate-500">Keep the strongest weights for the signals recruiters trust most.</p>
          </div>
        </section>

        {/* Visualization */}
        <div className="space-y-5">
          <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Distribution</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">Weight overview</h3>
            </div>
            <div className="space-y-3">
              {weightKeys.map((key) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{WEIGHT_LABELS[key]}</span>
                    <span className="font-medium text-slate-900">{weights[key]}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all duration-300"
                      style={{ width: `${weights[key]}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-4 rounded-2xl p-4 text-sm ${isTotalValid
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
            }`}>
              {isTotalValid
                ? "✓ Weights are balanced correctly. Candidates will be ranked by these priorities."
                : `⚠ Total is ${total}%. Adjust weights to equal exactly 100%.`}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.9),_rgba(255,255,255,1))] p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.28)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tuning guidance</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">Start with recruiter intent, not a perfect formula.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Increase skills and experience for technical hiring, raise behavior signals for client-facing roles, and keep salary or location lighter unless they are strict filters.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
