"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Users,
  ThumbsUp,
  ThumbsDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Pause,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/ui/intlFormat";

// ── Types ──────────────────────────────────────────────────────────
interface ScorecardScores {
  technicalSkills: number;
  communication: number;
  cultureFit: number;
  problemSolving: number;
  motivation: number;
}

interface EvaluatorScorecard {
  _id: string;
  evaluatedBy: { _id: string; name: string; email: string };
  evaluatorName?: string;
  evaluatorRole?: string;
  scores: ScorecardScores;
  overallScore: number;
  recommendation: string;
  strengths?: string;
  concerns?: string;
  notes?: string;
  createdAt: string;
  interviewId?: { scheduledAt: string; interviewRound: number; type: string };
}

interface Consensus {
  totalEvaluators: number;
  averageScores: ScorecardScores;
  averageOverall: number;
  recommendationDistribution: Record<string, number>;
  suggestedDecision: string;
  isUnanimous: boolean;
  hasStrongDisagreement: boolean;
  unanimousRecommendation: string | null;
}

interface HiringDecisionRecord {
  _id: string;
  outcome: string;
  reasoning?: string;
  overriddenConsensus?: boolean;
  decidedBy: { name: string; email: string };
  createdAt: string;
  consensusSummary?: { totalEvaluators: number; averageOverall: number; suggestedDecision: string };
}

// Labels are now derived from translations inside components

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: "bg-emerald-100 text-emerald-700 border-emerald-300",
  yes: "bg-green-100 text-green-700 border-green-300",
  neutral: "bg-amber-100 text-amber-700 border-amber-300",
  no: "bg-orange-100 text-orange-700 border-orange-300",
  strong_no: "bg-red-100 text-red-700 border-red-300",
};

const OUTCOME_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  advance: { icon: ArrowRight, color: "text-blue-600" },
  hire: { icon: CheckCircle2, color: "text-emerald-600" },
  reject: { icon: XCircle, color: "text-red-600" },
  hold: { icon: Pause, color: "text-amber-600" },
  no_decision: { icon: Minus, color: "text-muted-foreground" },
};

// ── Main Page ──────────────────────────────────────────────────────
export default function HiringPanelPage() {
  const t = useTranslations("employerPanel");
  const { id } = useParams<{ id: string }>();
  const [scorecards, setScorecards] = useState<EvaluatorScorecard[]>([]);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [decisions, setDecisions] = useState<HiringDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [reasoning, setReasoning] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [consensusRes, decisionsRes] = await Promise.all([
        fetch(`/api/scorecards/consensus?applicationId=${id}`),
        fetch(`/api/hiring-decisions?applicationId=${id}`),
      ]);

      if (consensusRes.ok) {
        const data = await consensusRes.json();
        setScorecards(data.scorecards ?? []);
        setConsensus(data.consensus);
      }
      if (decisionsRes.ok) {
        const data = await decisionsRes.json();
        setDecisions(data.decisions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    document.title = t("docTitle");
  }, [t]);

  async function handleSubmitDecision() {
    if (!selectedOutcome) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hiring-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: id,
          outcome: selectedOutcome,
          reasoning: reasoning.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const RECOMMENDATION_LABELS: Record<string, string> = {
    strong_yes: t("strongYes"),
    yes: t("yes"),
    neutral: t("neutral"),
    no: t("no"),
    strong_no: t("strongNo"),
  };

  const OUTCOME_LABELS: Record<string, string> = {
    advance: t("advanceToNext"),
    hire: t("hire"),
    reject: t("reject"),
    hold: t("hold"),
    no_decision: t("noDecision"),
  };

  if (loading) {
    return (
      <div className="page-container">
        <PageHeader title={t("title")} description={t("loading")} />
        <div className="space-y-3 sm:space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-5xl">
      <PageHeader
        title={t("title")}
        description={t("description", { count: scorecards.length })}
      />

      {/* ── Consensus Summary ─────────────────────────────────────── */}
      {consensus && (
        <section className="card-base rounded-2xl border mb-6 space-y-3 sm:space-y-4 panel-body">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t("panelConsensus")}</h2>
            {consensus.isUnanimous && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                {t("unanimous")}
              </Badge>
            )}
            {consensus.hasStrongDisagreement && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t("disagreement")}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-muted/20 p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{consensus.totalEvaluators}</div>
              <div className="text-xs text-muted-foreground">{t("evaluators")}</div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{consensus.averageOverall}{t("outOf5")}</div>
              <div className="text-xs text-muted-foreground">{t("avgScoreLabel")}</div>
            </div>
            <div className="col-span-2 rounded-xl border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground mb-2">{t("recommendationDist")}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(consensus.recommendationDistribution)
                  .filter(([, count]) => count > 0)
                  .map(([rec, count]) => (
                    <Badge
                      key={rec}
                      variant="outline"
                      className={cn("text-xs", RECOMMENDATION_COLORS[rec])}
                    >
                      {RECOMMENDATION_LABELS[rec]} ({count})
                    </Badge>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
            <Star className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {t("suggestedDecision")}:{" "}
              <span className={cn("font-semibold", RECOMMENDATION_COLORS[consensus.suggestedDecision]?.replace("bg-", "text-").split(" ")[1])}>
                {RECOMMENDATION_LABELS[consensus.suggestedDecision]}
              </span>
            </span>
          </div>

          {/* Average Scores Breakdown */}
          <div className="grid grid-cols-5 gap-2">
            {(Object.entries(consensus.averageScores) as [string, number][]).map(([key, val]) => (
              <div key={key} className="rounded-lg border p-2 text-center">
                <div className="text-sm font-semibold">{val}</div>
                <div className="text-[10px] text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Individual Evaluator Scorecards ───────────────────────── */}
      <section className="space-y-3 mb-6">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t("individualEvals", { count: scorecards.length })}
        </h2>
        {scorecards.length === 0 ? (
          <div className="card-base rounded-xl border p-8 text-center text-muted-foreground">
            {t("emptyState")}
          </div>
        ) : (
          <div className="space-y-3">
            {scorecards.map((sc) => (
              <EvaluatorCard key={sc._id} scorecard={sc} />
            ))}
          </div>
        )}
      </section>

      {/* ── Past Decisions ────────────────────────────────────────── */}
      {decisions.length > 0 && (
        <section className="space-y-3 mb-6">
          <h2 className="text-base font-semibold">{t("pastDecisions")}</h2>
          <div className="space-y-2">
            {decisions.map((d) => {
              const iconConfig = OUTCOME_ICONS[d.outcome] ?? OUTCOME_ICONS.no_decision;
              const Icon = iconConfig.icon;
              return (
                <div key={d._id} className="card-base rounded-xl border flex items-start gap-3 panel-body">
                  <Icon className={cn("h-5 w-5 mt-0.5", iconConfig.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{OUTCOME_LABELS[d.outcome] ?? OUTCOME_LABELS.no_decision}</span>
                      {d.overriddenConsensus && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[10px]">
                          {t("overrodeConsensus")}
                        </Badge>
                      )}
                    </div>
                    {d.reasoning && <p className="text-xs text-muted-foreground mt-1">{d.reasoning}</p>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      By {d.decidedBy?.name ?? "Unknown"} · {formatDate(new Date(d.createdAt))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Make Decision ─────────────────────────────────────────── */}
      {!submitted && (
        <section className="card-base rounded-2xl border space-y-3 sm:space-y-4 panel-body">
          <h2 className="text-base font-semibold">{t("recordDecision")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["advance", "hire", "hold", "reject"] as const).map((outcome) => {
              const iconConfig = OUTCOME_ICONS[outcome];
              const Icon = iconConfig.icon;
              const isSelected = selectedOutcome === outcome;
              return (
                <button
                  key={outcome}
                  type="button"
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  )}
                  onClick={() => setSelectedOutcome(outcome)}
                >
                  <Icon className={cn("h-5 w-5", iconConfig.color)} />
                  <span className="text-xs font-medium">{OUTCOME_LABELS[outcome]}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reasoning-textarea" className="text-sm font-medium">
              {t("reasoning")}
            </label>
            <Textarea
              id="reasoning-textarea"
              placeholder={t("reasoningPlaceholder")}
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              maxLength={2000}
              rows={3}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSubmitDecision}
            disabled={!selectedOutcome || submitting}
            className="w-full sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("submitDecision")}
          </Button>
        </section>
      )}

      {submitted && (
        <div className="card-base rounded-2xl border border-emerald-200 bg-emerald-50/50 text-center panel-body">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
          <p className="font-medium text-emerald-700">{t("decisionRecorded")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("decisionSaved")}</p>
        </div>
      )}
    </div>
  );
}

// ── Evaluator Scorecard Card ───────────────────────────────────────
function EvaluatorCard({ scorecard: sc }: { scorecard: EvaluatorScorecard }) {
  const t = useTranslations("employerPanel");
  const name = sc.evaluatorName ?? sc.evaluatedBy?.name ?? "Unknown";
  const role = sc.evaluatorRole ?? "";

  const RECOMMENDATION_LABELS: Record<string, string> = {
    strong_yes: t("strongYes"),
    yes: t("yes"),
    neutral: t("neutral"),
    no: t("no"),
    strong_no: t("strongNo"),
  };

  return (
    <div className="card-base rounded-xl border space-y-3 panel-body">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium">{name}</div>
            {role && <div className="text-[11px] text-muted-foreground">{role}</div>}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("text-xs", RECOMMENDATION_COLORS[sc.recommendation])}
        >
          {RECOMMENDATION_LABELS[sc.recommendation]}
        </Badge>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {(Object.entries(sc.scores) as [string, number][]).map(([key, val]) => (
          <div key={key} className="rounded-lg bg-muted/30 p-1.5 text-center">
            <div className="text-sm font-semibold">{val}{t("outOf5")}</div>
            <div className="text-[9px] text-muted-foreground capitalize leading-tight">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{t("overall")}: <strong className="text-foreground">{sc.overallScore.toFixed(1)}{t("outOf5")}</strong></span>
        <span>·</span>
        <span>{formatDate(new Date(sc.createdAt))}</span>
      </div>

      {(sc.strengths || sc.concerns) && (
        <div className="grid grid-cols-2 gap-2">
          {sc.strengths && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 mb-1">
                <ThumbsUp className="h-3 w-3" /> {t("strengthsLabel")}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-3">{sc.strengths}</p>
            </div>
          )}
          {sc.concerns && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-red-700 mb-1">
                <ThumbsDown className="h-3 w-3" /> {t("concerns")}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-3">{sc.concerns}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
