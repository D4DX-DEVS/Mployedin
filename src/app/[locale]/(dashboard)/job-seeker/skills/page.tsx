"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Plus,
  Loader2,
  TrendingUp,
  BookOpen,
  Target,
  Rocket,
  Briefcase,
  BrainCircuit,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  X,
} from "lucide-react";

interface SkillSuggestion {
  skill: string;
  category?: "technical" | "soft" | "language" | "certification";
  reason: string;
  priority: "high" | "medium" | "low";
  resourceUrl?: string;
}

interface CriticalGap {
  skill: string;
  priority: "high" | "medium" | "low";
  reason: string;
  learningPath: string;
}

interface SkillsGapResult {
  overallScore: number;
  existingStrengths: string[];
  criticalGaps: CriticalGap[];
  estimatedTimeToReady: string;
  recommendations: string[];
  summary: string;
  projectedScore: number;
}

interface SkillsCoachProgress {
  previousOverallScore: number;
  lastOverallScore: number;
  skillsAdded: number;
  analysesCount: number;
  lastTargetRole: string;
  lastAnalysisAt: string;
}

interface RecommendedJobsPayload {
  items: Array<{ _id: string }>;
  totalMatches: number;
}

const POPULAR_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Data Analyst",
];

export default function JobSeekerSkillsPage() {
  const t = useTranslations("skillsCoach");
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === "string" ? params.locale : "en";

  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [gapResult, setGapResult] = useState<SkillsGapResult | null>(null);
  const [loadingGap, setLoadingGap] = useState(false);
  const [gapError, setGapError] = useState("");
  const [progress, setProgress] = useState<SkillsCoachProgress | null>(null);
  const [matchingJobsCount, setMatchingJobsCount] = useState(0);
  const [loadingJobsCount, setLoadingJobsCount] = useState(false);
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    setSuggestionsError("");
    try {
      const res = await fetch("/api/ai/skills-suggest");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to load skill suggestions.");
      }

      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (error) {
      setSuggestionsError(error instanceof Error ? error.message : "Unable to load skill suggestions.");
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const loadMatchingJobsCount = useCallback(async () => {
    setLoadingJobsCount(true);
    try {
      const res = await fetch("/api/job-seeker/recommended-jobs?limit=1");
      if (!res.ok) {
        setMatchingJobsCount(0);
        return;
      }

      const data = (await res.json()) as RecommendedJobsPayload;
      setMatchingJobsCount(Number(data.totalMatches ?? 0));
    } catch {
      setMatchingJobsCount(0);
    } finally {
      setLoadingJobsCount(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
    loadMatchingJobsCount();
  }, [loadSuggestions, loadMatchingJobsCount]);

  const analyzeGap = async () => {
    if (!targetRole.trim()) return;

    setLoadingGap(true);
    setGapError("");
    try {
      const res = await fetch("/api/ai/skills-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, currentSkills: mySkills }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to analyze your skill gap right now.");
      }

      setGapResult(data.analysis ?? null);
      setProgress(data.progress ?? null);
      await loadMatchingJobsCount();
    } catch (error) {
      setGapError(error instanceof Error ? error.message : "Unable to analyze your skill gap right now.");
      setGapResult(null);
    } finally {
      setLoadingGap(false);
    }
  };

  const addSkill = () => {
    const normalized = newSkill.trim();
    if (!normalized) return;
    if (mySkills.some((skill) => skill.toLowerCase() === normalized.toLowerCase())) return;

    setMySkills((prev) => [...prev, normalized]);
    setNewSkill("");
  };

  const addSuggestedSkill = (skill: string) => {
    if (mySkills.some((item) => item.toLowerCase() === skill.toLowerCase())) return;
    setMySkills((prev) => [...prev, skill]);
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return "text-emerald-600";
    if (score >= 45) return "text-amber-600";
    return "text-red-600";
  };

  const priorityTone = (priority: "high" | "medium" | "low") => {
    if (priority === "high") return "bg-red-50 text-red-700 border-red-200";
    if (priority === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  const scoreDelta = progress ? progress.lastOverallScore - progress.previousOverallScore : 0;
  const impactSuggestions = gapResult
    ? gapResult.criticalGaps.slice(0, 3).map((gap) => ({
        skill: gap.skill,
        boost: gap.priority === "high" ? 8 : gap.priority === "medium" ? 5 : 3,
      }))
    : [];

  return (
    <div className="page-container">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="space-y-6 xl:col-span-7">
          <div className="card-base p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">{t("gapAnalysis")}</h3>
            </div>

            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t("targetRole")}</label>
                <Input
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder={t("targetRolePlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  {POPULAR_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setTargetRole(role)}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t("currentSkills")}</label>
                {mySkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mySkills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => setMySkills((prev) => prev.filter((item) => item !== skill))}
                          className="rounded-full p-0.5 hover:bg-primary/20"
                          aria-label={t("removeSkillAria", { skill })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder={t("addSkillPlaceholder")}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addSkill} aria-label={t("addSkillAria")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                className="h-11 w-full"
                onClick={analyzeGap}
                disabled={!targetRole.trim() || loadingGap}
              >
                {loadingGap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loadingGap ? t("analysing") : t("analyseGap")}
              </Button>

              {loadingGap && (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm text-primary" aria-live="polite">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4" />
                    {t("thinkingState")}
                  </div>
                </div>
              )}

              {gapError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {gapError}
                </div>
              )}
            </div>
          </div>

          <div className="card-base p-4 sm:p-6" aria-live="polite">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">{t("resultsTitle")}</h3>
            </div>

            {!gapResult ? (
              <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-muted/20 p-5 text-sm text-muted-foreground">
                {t("resultsEmpty")}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl border border-border/70 bg-background p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{t("readinessScore")}</span>
                    <span className={`text-xl font-bold ${scoreColor(gapResult.overallScore)}`}>{gapResult.overallScore}%</span>
                  </div>
                  <Progress value={gapResult.overallScore} className="h-2.5" />
                  <p className="mt-2 text-xs text-muted-foreground">{gapResult.summary}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">{t("strengths")}</p>
                    {gapResult.existingStrengths.length === 0 ? (
                      <p className="text-xs text-emerald-700/80">{t("noStrengths")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {gapResult.existingStrengths.map((skill) => (
                          <Badge key={skill} variant="secondary" className="border-emerald-200 bg-white text-emerald-700">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">{t("criticalGaps")}</p>
                    {gapResult.criticalGaps.length === 0 ? (
                      <p className="text-xs text-red-700/80">{t("noCriticalGaps")}</p>
                    ) : (
                      <div className="space-y-2">
                        {gapResult.criticalGaps.map((gap) => (
                          <div key={gap.skill} className="rounded-lg border border-red-100 bg-white px-2.5 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{gap.skill}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${priorityTone(gap.priority)}`}>
                                {gap.priority}
                              </span>
                            </div>
                            <p className="mt-1 text-muted-foreground">{gap.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {gapResult.recommendations.length > 0 && (
                  <div className="rounded-xl border border-border/70 bg-background p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendations")}</p>
                    <ul className="space-y-1.5 text-sm">
                      {gapResult.recommendations.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {t("estimatedTime")}: <span className="font-semibold text-foreground">{gapResult.estimatedTimeToReady}</span>
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6 xl:col-span-5">
          <div className="card-base p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">{t("recommendedForYou")}</h3>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={loadSuggestions} disabled={loadingSuggestions}>
                {loadingSuggestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {t("refresh")}
              </Button>
            </div>

            {loadingSuggestions ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-16 animate-pulse rounded-xl border border-border/80 bg-muted/40" />
                ))}
              </div>
            ) : suggestionsError ? (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {suggestionsError}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
                {t("completeProfile")}
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.skill} className="rounded-xl border border-border/70 bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{suggestion.skill}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${priorityTone(suggestion.priority)}`}>
                        {suggestion.priority}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {suggestion.resourceUrl ? (
                        <a
                          href={suggestion.resourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <BookOpen className="h-3 w-3" />
                          {t("learn")}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("learningResourceSoon")}</span>
                      )}

                      <Button type="button" variant="outline" size="sm" onClick={() => addSuggestedSkill(suggestion.skill)}>
                        <Plus className="h-3.5 w-3.5" />
                        {t("addSkill")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base p-4 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">{t("learningPath")}</h3>
            </div>

            {!gapResult || gapResult.criticalGaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("learningPathEmpty")}</p>
            ) : (
              <ol className="space-y-2">
                {gapResult.criticalGaps.map((gap, index) => (
                  <li key={gap.skill} className="rounded-lg border border-border/70 bg-background p-3 text-sm">
                    <p className="font-semibold">{index + 1}. {gap.skill}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{gap.learningPath}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="card-base p-4 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">{t("aiSuggestions")}</h3>
            </div>

            {!gapResult || impactSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aiSuggestionsEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {impactSuggestions.map((item) => (
                  <div key={item.skill} className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm">
                    <p className="font-medium text-foreground">{t("impactTip", { skill: item.skill, boost: item.boost })}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {t("projectedScore", { score: gapResult.projectedScore })}
                </div>
              </div>
            )}
          </div>

          <div className="card-base p-4 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">{t("growthTracking")}</h3>
            </div>

            {!progress ? (
              <p className="text-sm text-muted-foreground">{t("growthEmpty")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("skillsAdded")}</p>
                  <p className="mt-1 text-lg font-semibold">{progress.skillsAdded}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("scoreChange")}</p>
                  <p className={`mt-1 text-lg font-semibold ${scoreDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {scoreDelta >= 0 ? "+" : ""}{scoreDelta}%
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("analyses")}</p>
                  <p className="mt-1 text-lg font-semibold">{progress.analysesCount}</p>
                </div>
              </div>
            )}
          </div>

          <div className="card-base p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold">{t("matchingJobs")}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {loadingJobsCount ? t("loadingJobs") : t("totalMatches", { count: matchingJobsCount })}
                </p>
              </div>
            </div>

            <Link href={`/${locale}/job-seeker/jobs`} className="mt-4 inline-flex w-full">
              <Button type="button" className="h-10 w-full justify-between">
                <span>{t("viewMatchingJobs")}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
