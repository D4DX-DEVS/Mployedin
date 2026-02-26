"use client";

import { useState, useEffect } from "react";
import { Sliders, Save, RotateCcw, Loader2, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

interface MatchingWeights {
  skills: number;
  experience: number;
  education: number;
  location: number;
  salary: number;
  languages: number;
  availability: number;
}

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 35,
  experience: 25,
  education: 10,
  location: 10,
  salary: 10,
  languages: 5,
  availability: 5,
};

const WEIGHT_LABELS: Record<keyof MatchingWeights, string> = {
  skills: "Skills Match",
  experience: "Years of Experience",
  education: "Education Level",
  location: "Location Preference",
  salary: "Salary Expectation",
  languages: "Language Match",
  availability: "Availability",
};

const WEIGHT_DESCRIPTIONS: Record<keyof MatchingWeights, string> = {
  skills: "How closely the candidate's technical skills match the job requirements",
  experience: "Weight given to years of relevant work experience",
  education: "Degree level and field of study relevance",
  location: "Candidate's location vs. job country/city preferences",
  salary: "Candidate's salary expectations vs. offered range",
  languages: "Match on required language proficiencies",
  availability: "Immediate availability for joining",
};

export default function EmployerMatchingWeightsPage() {
  const [weights, setWeights] = useState<MatchingWeights>(DEFAULT_WEIGHTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [total, setTotal] = useState(100);

  useEffect(() => {
    setTotal(Object.values(weights).reduce((a, b) => a + b, 0));
  }, [weights]);

  const updateWeight = (key: keyof MatchingWeights, value: number) => {
    setSaved(false);
    setWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, value)) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/employers/matching-weights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const isTotalValid = total === 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Matching Weights"
        description="Customise how candidates are scored and ranked for your roles"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders */}
        <div className="lg:col-span-2 card-base space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" /> Weight Configuration
            </h3>
            <span className={`text-sm font-medium ${isTotalValid ? "text-emerald-600" : "text-red-500"}`}>
              Total: {total}% {isTotalValid ? "✓" : "(must equal 100%)"}
            </span>
          </div>

          {(Object.keys(weights) as Array<keyof MatchingWeights>).map((key) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{WEIGHT_LABELS[key]}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0} max={100}
                    value={weights[key]}
                    onChange={e => updateWeight(key, parseInt(e.target.value) || 0)}
                    className="w-16 text-center input-field py-1 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0} max={100} step={5}
                value={weights[key]}
                onChange={e => updateWeight(key, parseInt(e.target.value))}
                className="w-full accent-primary h-1.5 cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">{WEIGHT_DESCRIPTIONS[key]}</p>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2 border-t">
            <button onClick={handleSave} disabled={saving || !isTotalValid}
              className="btn-primary flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : saved ? "Saved!" : "Save Weights"}
            </button>
            <button onClick={() => setWeights(DEFAULT_WEIGHTS)}
              className="btn-outline flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Reset Defaults
            </button>
          </div>
        </div>

        {/* Visualization */}
        <div className="card-base space-y-4">
          <h3 className="text-sm font-semibold">Weight Distribution</h3>
          <div className="space-y-3">
            {(Object.keys(weights) as Array<keyof MatchingWeights>).map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{WEIGHT_LABELS[key]}</span>
                  <span className="font-medium">{weights[key]}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${weights[key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className={`mt-4 p-3 rounded-lg text-xs ${isTotalValid
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
          }`}>
            {isTotalValid
              ? "✓ Weights are balanced correctly. Candidates will be ranked by these priorities."
              : `⚠ Total is ${total}%. Adjust weights to equal exactly 100%.`}
          </div>
        </div>
      </div>
    </div>
  );
}
