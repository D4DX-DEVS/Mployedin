"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

const SCORE_CRITERIA_KEYS = [
  { key: "technicalSkills" as const, labelKey: "technicalSkills", descKey: "technicalSkillsDesc" },
  { key: "communication" as const, labelKey: "communication", descKey: "communicationDesc" },
  { key: "cultureFit" as const, labelKey: "cultureFit", descKey: "cultureFitDesc" },
  { key: "problemSolving" as const, labelKey: "problemSolving", descKey: "problemSolvingDesc" },
  { key: "motivation" as const, labelKey: "motivation", descKey: "motivationDesc" },
];

const RECOMMENDATION_KEYS = [
  { value: "strong_yes", labelKey: "strongYes", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "yes", labelKey: "yes", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "neutral", labelKey: "neutral", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "no", labelKey: "no", color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "strong_no", labelKey: "strongNo", color: "bg-red-100 text-red-700 border-red-300" },
];

export function ScorecardForm({
  interviewId,
  onSubmit,
  onCancel,
  isLoading = false,
  existingScorecard,
}: ScorecardFormProps) {
  const t = useTranslations("scorecard");
  const tc = useTranslations("common");
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
    <form onSubmit={handleSubmit} className="space-y-6 bg-card border border-border rounded-lg panel-body">
      {/* Header */}
      <div>
        <h3 className="heading-subsection font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      {/* Score Criteria */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">{t("scoreCriteria")}</h4>
        {SCORE_CRITERIA_KEYS.map((criterion) => (
          <div key={criterion.key}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="font-medium text-sm">{t(criterion.labelKey)}</label>
                <p className="text-xs text-muted-foreground">{t(criterion.descKey)}</p>
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
        <span className="font-medium">{t("overallScore")}</span>
        <span className={`text-2xl font-bold ${getScoreBadgeColor(overallScore)}`}>
          {overallScore.toFixed(1)}/5
        </span>
      </div>

      {/* Recommendation */}
      <div className="space-y-3">
        <label className="font-medium text-sm">{t("recommendation")}</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {RECOMMENDATION_KEYS.map((rec) => (
            <button
              key={rec.value}
              type="button"
              onClick={() => setRecommendation(rec.value)}
              className={`chip-pad rounded-lg font-medium text-sm border-2 transition-all ${
                recommendation === rec.value
                  ? `${rec.color} border-current`
                  : "bg-muted text-muted-foreground border-muted"
              }`}
            >
              {t(rec.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div>
        <label className="font-medium text-sm block mb-2">
          {t("strengths")} <span className="text-muted-foreground text-xs">{t("maxChars", { max: 1000 })}</span>
        </label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value.slice(0, 1000))}
          placeholder={t("strengthsPlaceholder")}
          className="w-full h-20 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad"
        />
        <div className="text-xs text-muted-foreground text-right mt-1">
          {strengths.length}/1000
        </div>
      </div>

      {/* Concerns */}
      <div>
        <label className="font-medium text-sm block mb-2">
          {t("concerns")} <span className="text-muted-foreground text-xs">{t("maxChars", { max: 1000 })}</span>
        </label>
        <textarea
          value={concerns}
          onChange={(e) => setConcerns(e.target.value.slice(0, 1000))}
          placeholder={t("concernsPlaceholder")}
          className="w-full h-20 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad"
        />
        <div className="text-xs text-muted-foreground text-right mt-1">
          {concerns.length}/1000
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="font-medium text-sm block mb-2">
          {t("additionalNotes")} <span className="text-muted-foreground text-xs">{t("maxChars", { max: 3000 })}</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 3000))}
          placeholder={t("additionalNotesPlaceholder")}
          className="w-full h-24 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad"
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
            {tc("cancel")}
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || isLoading}
          className="min-w-[120px]"
        >
          {submitting || isLoading ? tc("saving") : t("saveScorecard")}
        </Button>
      </div>
    </form>
  );
}
