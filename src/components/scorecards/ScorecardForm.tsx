"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Score {
  technicalSkills: number;
  communication: number;
  cultureFit: number;
  problemSolving: number;
  motivation: number;
}

interface ScorecardFormProps {
  interviewId: string;
  onSubmit: (data: {
    scores: Score;
    recommendation: string;
    notes?: string;
    strengths?: string;
    concerns?: string;
  }) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  existingScorecard?: {
    scores: Score;
    recommendation: string;
    notes?: string;
    strengths?: string;
    concerns?: string;
  };
}

const SCORE_CRITERIA = [
  { key: "technicalSkills" as const, label: "Technical Skills", description: "Relevant technical knowledge and skills" },
  { key: "communication" as const, label: "Communication", description: "Clarity, listening, and expression" },
  { key: "cultureFit" as const, label: "Culture Fit", description: "Alignment with team values" },
  { key: "problemSolving" as const, label: "Problem Solving", description: "Analytical thinking and approach" },
  { key: "motivation" as const, label: "Motivation", description: "Enthusiasm and drive" },
];

const RECOMMENDATIONS = [
  { value: "strong_yes", label: "Strong Yes", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "yes", label: "Yes", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "neutral", label: "Neutral", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "no", label: "No", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "strong_no", label: "Strong No", color: "bg-red-100 text-red-700 border-red-300" },
];

export function ScorecardForm({
  interviewId,
  onSubmit,
  onCancel,
  isLoading = false,
  existingScorecard,
}: ScorecardFormProps) {
  const [scores, setScores] = useState<Score>(
    existingScorecard?.scores || {
      technicalSkills: 3,
      communication: 3,
      cultureFit: 3,
      problemSolving: 3,
      motivation: 3,
    }
  );

  const [recommendation, setRecommendation] = useState(
    existingScorecard?.recommendation || "neutral"
  );

  const [notes, setNotes] = useState(existingScorecard?.notes || "");
  const [strengths, setStrengths] = useState(existingScorecard?.strengths || "");
  const [concerns, setConcerns] = useState(existingScorecard?.concerns || "");
  const [submitting, setSubmitting] = useState(false);

  const overallScore =
    (scores.technicalSkills +
      scores.communication +
      scores.cultureFit +
      scores.problemSolving +
      scores.motivation) /
    5;

  const getScoreBadgeColor = (score: number) => {
    if (score >= 4.5) return "bg-emerald-100 text-emerald-700";
    if (score >= 3.5) return "bg-green-100 text-green-700";
    if (score >= 2.5) return "bg-amber-100 text-amber-700";
    if (score >= 1.5) return "bg-orange-100 text-orange-700";
    return "bg-red-100 text-red-700";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        scores,
        recommendation,
        notes: notes || undefined,
        strengths: strengths || undefined,
        concerns: concerns || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-card border border-border rounded-lg p-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Interview Scorecard</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Evaluate the candidate across key dimensions
        </p>
      </div>

      {/* Score Criteria */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">Score Each Criterion (1-5)</h4>
        {SCORE_CRITERIA.map((criterion) => (
          <div key={criterion.key}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="font-medium text-sm">{criterion.label}</label>
                <p className="text-xs text-muted-foreground">{criterion.description}</p>
              </div>
              <Badge className={getScoreBadgeColor(scores[criterion.key])}>
                {scores[criterion.key]}/5
              </Badge>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() =>
                    setScores((prev) => ({ ...prev, [criterion.key]: score }))
                  }
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                    scores[criterion.key] === score
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/50"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Overall Score Display */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <span className="font-medium">Overall Score</span>
        <span className={`text-2xl font-bold ${getScoreBadgeColor(overallScore)}`}>
          {overallScore.toFixed(1)}/5
        </span>
      </div>

      {/* Recommendation */}
      <div className="space-y-3">
        <label className="font-medium text-sm">Recommendation</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {RECOMMENDATIONS.map((rec) => (
            <button
              key={rec.value}
              type="button"
              onClick={() => setRecommendation(rec.value)}
              className={`py-2 px-3 rounded-lg font-medium text-sm border-2 transition-all ${
                recommendation === rec.value
                  ? `${rec.color} border-current`
                  : "bg-muted text-muted-foreground border-muted"
              }`}
            >
              {rec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div>
        <label className="font-medium text-sm block mb-2">
          Strengths <span className="text-muted-foreground text-xs">(max 1000 chars)</span>
        </label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value.slice(0, 1000))}
          placeholder="What are the candidate's key strengths?"
          className="w-full h-20 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
        />
        <div className="text-xs text-muted-foreground text-right mt-1">
          {strengths.length}/1000
        </div>
      </div>

      {/* Concerns */}
      <div>
        <label className="font-medium text-sm block mb-2">
          Concerns <span className="text-muted-foreground text-xs">(max 1000 chars)</span>
        </label>
        <textarea
          value={concerns}
          onChange={(e) => setConcerns(e.target.value.slice(0, 1000))}
          placeholder="Any concerns or areas for improvement?"
          className="w-full h-20 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
        />
        <div className="text-xs text-muted-foreground text-right mt-1">
          {concerns.length}/1000
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="font-medium text-sm block mb-2">
          Additional Notes <span className="text-muted-foreground text-xs">(max 3000 chars)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 3000))}
          placeholder="Any additional comments or observations?"
          className="w-full h-24 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
        />
        <div className="text-xs text-muted-foreground text-right mt-1">
          {notes.length}/3000
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end border-t border-border pt-6">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting || isLoading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || isLoading}
          className="min-w-[120px]"
        >
          {submitting || isLoading ? "Saving..." : "Save Scorecard"}
        </Button>
      </div>
    </form>
  );
}
