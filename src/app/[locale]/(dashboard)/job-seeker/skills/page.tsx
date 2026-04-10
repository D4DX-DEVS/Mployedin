"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Plus,
  Loader2,
  TrendingUp,
  BookOpen,
  Target,
  Briefcase,
  BrainCircuit,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  X,
  Clock,
  Zap,
  ChevronRight,
  Flame,
} from "lucide-react";

/* ── Interfaces ── */

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

/* ── Constants ── */

const POPULAR_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Data Analyst",
];

/* ── Radial Progress Component ── */

function RadialProgress({
  value,
  size = 160,
  stroke = 12,
  className = "",
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color =
    value >= 75 ? "#10b981" : value >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border) / 0.3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {value}%
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          Ready
        </span>
      </div>
    </div>
  );
}

/* ── Skill Bar Component ── */

function SkillBar({
  label,
  level,
  isStrength,
}: {
  label: string;
  level: number;
  isStrength: boolean;
}) {
  const color = isStrength
    ? "bg-emerald-500"
    : level >= 60
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="ml-2 shrink-0 text-muted-foreground">{level}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40">
        <div
          className={`h-2 rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
  );
}

/* ── Seeded random for consistent bar levels ── */

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash % 100) / 100;
}

/* ── Main Page ── */

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
  const [animateScore, setAnimateScore] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const resultsRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  /* ── Load profile (skills + last target role) on mount ── */

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/job-seeker/profile");
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;

        if (Array.isArray(data.skills) && data.skills.length > 0) {
          setMySkills(data.skills);
        }
        if (data.skillsCoachProgress?.lastTargetRole) {
          setTargetRole(data.skillsCoachProgress.lastTargetRole);
        }
        if (data.skillsCoachProgress) {
          setProgress({
            previousOverallScore: data.skillsCoachProgress.previousOverallScore ?? 0,
            lastOverallScore: data.skillsCoachProgress.lastOverallScore ?? 0,
            skillsAdded: data.skillsCoachProgress.skillsAdded ?? 0,
            analysesCount: data.skillsCoachProgress.analysesCount ?? 0,
            lastTargetRole: data.skillsCoachProgress.lastTargetRole ?? "",
            lastAnalysisAt: data.skillsCoachProgress.lastAnalysisAt ?? "",
          });
        }
      } catch {
        // Profile load failed silently — user can still type manually
      } finally {
        setProfileLoaded(true);
        // Mark initial load done after a tick so first skill change doesn't auto-save
        setTimeout(() => { isInitialLoadRef.current = false; }, 100);
      }
    }
    loadProfile();
  }, []);

  /* ── Debounced auto-save skills to profile ── */

  useEffect(() => {
    if (!profileLoaded || isInitialLoadRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch("/api/job-seeker/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills: mySkills }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [mySkills, profileLoaded]);

  /* ── Data fetching ── */

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    setSuggestionsError("");
    try {
      const res = await fetch("/api/ai/skills-suggest");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(
          payload.error ?? "Unable to load skill suggestions.",
        );
      }
      const data = await res.json();
      setSuggestions(
        Array.isArray(data.suggestions) ? data.suggestions : [],
      );
    } catch (error) {
      setSuggestionsError(
        error instanceof Error
          ? error.message
          : "Unable to load skill suggestions.",
      );
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

  /* ── Analyse gap (supports re-scoring with different skills list) ── */

  const analyzeGap = useCallback(
    async (skills?: string[]) => {
      if (!targetRole.trim()) return;
      const skillsToSend = skills ?? mySkills;

      setLoadingGap(true);
      setGapError("");
      setAnimateScore(false);
      try {
        const res = await fetch("/api/ai/skills-gap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRole, currentSkills: skillsToSend }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            data.error ?? "Unable to analyze your skill gap right now.",
          );

        setGapResult(data.analysis ?? null);
        setProgress(data.progress ?? null);
        await loadMatchingJobsCount();

        setAnimateScore(true);
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          100,
        );
      } catch (error) {
        setGapError(
          error instanceof Error
            ? error.message
            : "Unable to analyze your skill gap right now.",
        );
        setGapResult(null);
      } finally {
        setLoadingGap(false);
      }
    },
    [targetRole, mySkills, loadMatchingJobsCount],
  );

  /* ── Skill management (auto re-score when results exist) ── */

  const addSkill = () => {
    const normalized = newSkill.trim();
    if (!normalized) return;
    if (
      mySkills.some(
        (skill) => skill.toLowerCase() === normalized.toLowerCase(),
      )
    )
      return;

    const updated = [...mySkills, normalized];
    setMySkills(updated);
    setNewSkill("");
    if (gapResult && targetRole.trim()) analyzeGap(updated);
  };

  const addSuggestedSkill = (skill: string) => {
    if (mySkills.some((item) => item.toLowerCase() === skill.toLowerCase()))
      return;
    const updated = [...mySkills, skill];
    setMySkills(updated);
    if (gapResult && targetRole.trim()) analyzeGap(updated);
  };

  const removeSkill = (skill: string) => {
    const updated = mySkills.filter((item) => item !== skill);
    setMySkills(updated);
    if (gapResult && targetRole.trim()) analyzeGap(updated);
  };

  /* ── Helpers ── */

  const priorityColor = (priority: "high" | "medium" | "low") => {
    if (priority === "high") return "bg-red-100 text-red-700 border-red-200";
    if (priority === "medium")
      return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const priorityDot = (priority: "high" | "medium" | "low") => {
    if (priority === "high") return "bg-red-500";
    if (priority === "medium") return "bg-amber-500";
    return "bg-blue-500";
  };

  const scoreDelta = progress
    ? progress.lastOverallScore - progress.previousOverallScore
    : 0;
  const improvement = gapResult
    ? gapResult.projectedScore - gapResult.overallScore
    : 0;

  const impactSuggestions = gapResult
    ? gapResult.criticalGaps.slice(0, 3).map((gap) => ({
        skill: gap.skill,
        boost:
          gap.priority === "high" ? 8 : gap.priority === "medium" ? 5 : 3,
        priority: gap.priority,
        reason: gap.reason,
        learningPath: gap.learningPath,
      }))
    : [];

  // Build skill bars from gap result using seeded random for stability
  const skillBars = gapResult
    ? [
        ...gapResult.existingStrengths.map((s) => ({
          label: s,
          level: 70 + Math.round(seededRandom(s) * 25),
          isStrength: true,
        })),
        ...gapResult.criticalGaps.map((g) => ({
          label: g.skill,
          level:
            g.priority === "high"
              ? 15 + Math.round(seededRandom(g.skill) * 15)
              : g.priority === "medium"
                ? 35 + Math.round(seededRandom(g.skill) * 15)
                : 50 + Math.round(seededRandom(g.skill) * 10),
          isStrength: false,
        })),
      ].sort((a, b) => b.level - a.level)
    : [];

  /* ── Render ── */

  return (
    <div className="page-container mx-auto max-w-6xl">
      {/* ── PAGE HEADER ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {/* ── STEP 1 & 2: Role + Skills Input ── */}
      {!profileLoaded ? (
        <div className="card-base mb-6 flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">{t("loadingProfile")}</span>
        </div>
      ) : (
      <div className="card-base mb-6 p-5 sm:p-7">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Role */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                1
              </div>
              <label className="text-sm font-semibold">
                {t("targetRole")}
              </label>
            </div>
            <Input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder={t("targetRolePlaceholder")}
              className="h-11"
            />
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setTargetRole(role)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    targetRole === role
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                2
              </div>
              <label className="text-sm font-semibold">
                {t("currentSkills")}
              </label>
              {saveStatus === "saving" && (
                <span className="ml-auto text-[10px] text-muted-foreground animate-pulse">{t("savingSkills")}</span>
              )}
              {saveStatus === "saved" && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />{t("skillsSaved")}
                </span>
              )}
            </div>
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
                className="h-11"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addSkill}
                className="h-11 w-11 shrink-0"
                aria-label={t("addSkillAria")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {mySkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mySkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary animate-in fade-in-0 zoom-in-95 duration-200"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="rounded-full p-0.5 hover:bg-primary/20"
                      aria-label={t("removeSkillAria", { skill })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Analyze button */}
        <div className="mt-6">
          <Button
            type="button"
            className="h-12 w-full text-base font-semibold"
            onClick={() => analyzeGap()}
            disabled={!targetRole.trim() || loadingGap}
          >
            {loadingGap ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {loadingGap ? t("analysing") : t("analyseGap")}
          </Button>
        </div>

        {loadingGap && (
          <div
            className="mt-4 animate-pulse rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm text-primary"
            aria-live="polite"
          >
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
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {gapError}
          </div>
        )}
      </div>
      )}

      {/* ── RESULTS DASHBOARD ── */}
      {!gapResult ? (
        <div className="card-base p-8 text-center sm:p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
            <Target className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t("resultsEmpty")}
          </p>
        </div>
      ) : (
        <div
          ref={resultsRef}
          className={`space-y-6 ${animateScore ? "animate-in fade-in-0 slide-in-from-bottom-4 duration-500" : ""}`}
        >
          {/* ── HERO SCORE BANNER ── */}
          <div className="card-base overflow-hidden p-0">
            <div className="bg-gradient-to-br from-primary/5 via-background to-primary/[0.02] p-6 sm:p-8">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
                <RadialProgress
                  value={gapResult.overallScore}
                  className="shrink-0"
                />

                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <div>
                    <h2 className="text-xl font-bold">
                      {targetRole} {t("readinessScore")}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {gapResult.summary}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
                    {improvement > 0 && (
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        <TrendingUp className="h-3.5 w-3.5" />+{improvement}%{" "}
                        {t("possibleImprovement")}
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">
                      <Clock className="h-3.5 w-3.5" />
                      {gapResult.estimatedTimeToReady}
                    </div>
                    {progress && scoreDelta !== 0 && (
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${scoreDelta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {scoreDelta > 0 ? "+" : ""}
                        {scoreDelta}% {t("sinceLastAnalysis")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── MAIN GRID ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT COLUMN */}
            <div className="space-y-6 lg:col-span-7">
              {/* Gap Visualization Bars */}
              {skillBars.length > 0 && (
                <div className="card-base p-5 sm:p-6">
                  <h3 className="mb-4 text-sm font-semibold">
                    {t("gapVisualization")}
                  </h3>
                  <div className="space-y-3">
                    {skillBars.map((bar) => (
                      <SkillBar
                        key={bar.label}
                        label={bar.label}
                        level={bar.level}
                        isStrength={bar.isStrength}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {t("strengths")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {t("mediumGap")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {t("criticalGaps")}
                    </span>
                  </div>
                </div>
              )}

              {/* Top 3 Actions — "Do This Next" */}
              {impactSuggestions.length > 0 && (
                <div className="card-base p-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold">
                      {t("doThisNext")}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {impactSuggestions.map((action, idx) => (
                      <div
                        key={action.skill}
                        className="group relative rounded-xl border border-border/60 bg-background p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${idx === 0 ? "bg-orange-500" : idx === 1 ? "bg-amber-500" : "bg-blue-500"}`}
                          >
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">
                                {action.skill}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityColor(action.priority)}`}
                              >
                                {action.priority}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {action.reason}
                            </p>
                            <div className="mt-2 flex items-center gap-3 text-xs">
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                                <TrendingUp className="h-3 w-3" />+
                                {action.boost}% {t("matchImpact")}
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 opacity-70 group-hover:opacity-100"
                            onClick={() => addSuggestedSkill(action.skill)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("addSkill")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {gapResult.projectedScore > gapResult.overallScore && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700">
                      {t("projectedScore", {
                        score: gapResult.projectedScore,
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {gapResult.recommendations.length > 0 && (
                <div className="card-base p-5 sm:p-6">
                  <h3 className="mb-3 text-sm font-semibold">
                    {t("recommendations")}
                  </h3>
                  <ul className="space-y-2">
                    {gapResult.recommendations.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6 lg:col-span-5">
              {/* Recommended Skills (compact chips) */}
              <div className="card-base p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      {t("recommendedForYou")}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={loadSuggestions}
                    disabled={loadingSuggestions}
                    className="h-7 px-2 text-xs"
                  >
                    {loadingSuggestions ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {loadingSuggestions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-8 animate-pulse rounded-full bg-muted/40"
                      />
                    ))}
                  </div>
                ) : suggestionsError ? (
                  <p role="alert" className="text-xs text-red-600">
                    {suggestionsError}
                  </p>
                ) : suggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("completeProfile")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => {
                      const alreadyAdded = mySkills.some(
                        (ms) =>
                          ms.toLowerCase() === s.skill.toLowerCase(),
                      );
                      return (
                        <button
                          key={s.skill}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => addSuggestedSkill(s.skill)}
                          className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                            alreadyAdded
                              ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-600"
                              : `${priorityColor(s.priority)} cursor-pointer hover:shadow-sm`
                          }`}
                          title={s.reason}
                        >
                          {alreadyAdded ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                          )}
                          {s.skill}
                          <span
                            className={`ml-0.5 inline-block h-1.5 w-1.5 rounded-full ${alreadyAdded ? "bg-emerald-500" : priorityDot(s.priority)}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Learning Path (Timeline) */}
              {gapResult.criticalGaps.length > 0 && (
                <div className="card-base p-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      {t("learningPath")}
                    </h3>
                  </div>
                  <div className="relative ml-3">
                    <div className="absolute bottom-2 left-0 top-2 w-px bg-border" />
                    {gapResult.criticalGaps.map((gap, idx) => (
                      <div
                        key={gap.skill}
                        className="relative pb-5 pl-6 last:pb-0"
                      >
                        <div
                          className={`absolute left-0 top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background ${idx === 0 ? "bg-primary" : "bg-muted-foreground/30"}`}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {t("week")} {idx + 1}
                            </span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-xs font-semibold">
                              {gap.skill}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {gap.learningPath}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Growth Stats */}
              {progress && (
                <div className="card-base p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      {t("growthTracking")}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-muted/30 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t("skillsAdded")}
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {progress.skillsAdded}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t("scoreChange")}
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold ${scoreDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {scoreDelta >= 0 ? "+" : ""}
                        {scoreDelta}%
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t("analyses")}
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {progress.analysesCount}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Job Match CTA */}
              <div className="card-base overflow-hidden p-0">
                <div className="bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-foreground sm:p-6">
                  <div className="mb-1 flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    <h3 className="text-base font-bold">
                      {t("matchingJobs")}
                    </h3>
                  </div>
                  <p className="mb-4 text-sm opacity-90">
                    {loadingJobsCount
                      ? t("loadingJobs")
                      : t("totalMatches", { count: matchingJobsCount })}
                  </p>
                  <Link href={`/${locale}/job-seeker/jobs`}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 w-full justify-between text-sm font-semibold"
                    >
                      <span>{t("viewMatchingJobs")}</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
