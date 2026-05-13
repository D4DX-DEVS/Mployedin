"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import {
  Building2, Users, DollarSign, Crosshair, CalendarDays,
  Sparkles, Target, TrendingUp, Trophy, Medal, Star,
  Flame, Crown, AlertTriangle, CheckCircle2, Clock,
  ArrowUpRight, ArrowDownRight, RotateCcw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetItem {
  _id: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
}

interface SummaryCard {
  type: "employer" | "employee" | "finance";
  monthly: { target: number; achieved: number; progress: number } | null;
  yearly: { target: number; achieved: number; progress: number } | null;
}

interface LeaderboardEntry {
  agentId: string;
  name: string;
  email: string;
  avgPerformance: number;
  targetsCount: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-6 w-6" />,
  employee: <Users className="h-6 w-6" />,
  finance: <DollarSign className="h-6 w-6" />,
};

const TYPE_SMALL_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-4 w-4" />,
  employee: <Users className="h-4 w-4" />,
  finance: <DollarSign className="h-4 w-4" />,
};

const TYPE_TONE: Record<string, string> = {
  employer: "workspace-tone-sky",
  employee: "workspace-tone-emerald",
  finance: "workspace-tone-amber",
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function PerformanceRing({ pct }: { pct: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color =
    pct >= 75 ? "stroke-emerald-500" :
    pct >= 40 ? "stroke-amber-500" :
    "stroke-red-500";
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
        <circle cx="70" cy="70" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
          className={`${color} transition-all duration-700`}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums">{pct}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score</span>
      </div>
    </div>
  );
}

function AchievementBadge({ title, icon, earned, description }: { title: string; icon: React.ReactNode; earned: boolean; description: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${earned ? "border-primary/20 bg-primary/5" : "border-border/40 bg-muted/20 opacity-50"}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${earned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${earned ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{description}</p>
      </div>
      {earned && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
    </div>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 1) return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20"><Crown className="h-5 w-5 text-amber-500" /></div>
      <div><p className="text-lg font-bold text-amber-600 dark:text-amber-400">#1</p><p className="text-[10px] text-muted-foreground">of {total}</p></div>
    </div>
  );
  if (rank === 2) return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-400/20"><Medal className="h-5 w-5 text-slate-400" /></div>
      <div><p className="text-lg font-bold text-slate-500">#2</p><p className="text-[10px] text-muted-foreground">of {total}</p></div>
    </div>
  );
  if (rank === 3) return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20"><Medal className="h-5 w-5 text-orange-600 dark:text-orange-400" /></div>
      <div><p className="text-lg font-bold text-orange-600 dark:text-orange-400">#{rank}</p><p className="text-[10px] text-muted-foreground">of {total}</p></div>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><span className="text-sm font-bold text-muted-foreground">#{rank}</span></div>
      <div><p className="text-lg font-bold">#{rank}</p><p className="text-[10px] text-muted-foreground">of {total}</p></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AgentTargetsPage() {
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [summary, setSummary] = useState<SummaryCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/targets?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets ?? []);
        setSummary(data.summary ?? []);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/targets/leaderboard?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setMyRank(data.myRank ?? 0);
        setTotalAgents(data.totalAgents ?? 0);
      }
    } catch { /* ignore */ }
  }, [yearFilter]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);
  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // Computed
  const hasTargets = summary.some((s) => s.monthly || s.yearly);

  // Overall performance score
  const yearlyTargets = targets.filter((t) => !t.month);
  const overallPct = yearlyTargets.length > 0
    ? Math.round(yearlyTargets.reduce((s, t) => s + t.progress, 0) / yearlyTargets.length)
    : 0;

  // Monthly performance for the current month
  const currentMonthTargets = targets.filter((t) => t.month === currentMonth);
  const monthlyPct = currentMonthTargets.length > 0
    ? Math.round(currentMonthTargets.reduce((s, t) => s + t.progress, 0) / currentMonthTargets.length)
    : 0;

  // Achievement badges
  const achievements = [
    { title: "First Blood", icon: <Target className="h-5 w-5" />, earned: overallPct > 0, description: "Started achieving targets" },
    { title: "Halfway Hero", icon: <TrendingUp className="h-5 w-5" />, earned: overallPct >= 50, description: "Reached 50% overall" },
    { title: "Quarter Master", icon: <Star className="h-5 w-5" />, earned: overallPct >= 25, description: "Passed 25% mark" },
    { title: "Top Performer", icon: <Trophy className="h-5 w-5" />, earned: overallPct >= 75, description: "Exceeded 75% performance" },
    { title: "On Fire", icon: <Flame className="h-5 w-5" />, earned: monthlyPct >= 90, description: "90%+ this month" },
    { title: "Triple Threat", icon: <Crown className="h-5 w-5" />, earned: summary.every((s) => s.monthly && s.monthly.progress >= 50), description: "50%+ in all 3 types" },
  ];
  const earnedCount = achievements.filter((a) => a.earned).length;

  // Risk calc
  const expectedPct = Math.round((currentMonth / 12) * 100);
  const riskLevel: "high" | "medium" | "low" =
    overallPct < expectedPct - 20 ? "high" :
    overallPct < expectedPct - 10 ? "medium" : "low";

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (<div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/50" />))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Performance Workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("myTargets")}</h1>
          <p className="text-sm text-muted-foreground">{t("agentDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm" aria-label="Year" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setYearFilter(currentYear)} className="rounded-lg" disabled={yearFilter === currentYear}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>

      {!hasTargets ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card py-16">
          <div className="rounded-2xl bg-muted/50 p-5"><Crosshair className="h-10 w-10 text-muted-foreground/40" /></div>
          <p className="text-sm font-medium text-muted-foreground">{t("noTargetsAssigned")}</p>
          <p className="text-xs text-muted-foreground">{t("contactSupervisor")}</p>
        </div>
      ) : (
        <>
          {/* Hero Row: Performance Ring + Rank + Risk */}
          <section className="grid gap-3 sm:grid-cols-3">
            {/* Performance Score */}
            <div className="workspace-glass-panel flex flex-col items-center gap-3 rounded-2xl p-6">
              <PerformanceRing pct={overallPct} />
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overall Performance</p>
                <p className="text-xs text-muted-foreground">{yearlyTargets.length} yearly targets</p>
              </div>
            </div>

            {/* Team Rank */}
            <div className="workspace-glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl p-6">
              <RankBadge rank={myRank || 0} total={totalAgents || 0} />
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Team Ranking</p>
                <p className="text-xs text-muted-foreground">{totalAgents} agents in your team</p>
              </div>
            </div>

            {/* Monthly Focus + Risk */}
            <div className="workspace-glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl p-6">
              <div className="flex items-center gap-3">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  riskLevel === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                  riskLevel === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {riskLevel === "high" ? <AlertTriangle className="h-7 w-7" /> :
                   riskLevel === "low" ? <CheckCircle2 className="h-7 w-7" /> :
                   <Clock className="h-7 w-7" />}
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{monthlyPct}%</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{MONTHS_SHORT[currentMonth - 1]} Progress</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Level</p>
                <span className={`text-xs font-bold uppercase ${
                  riskLevel === "high" ? "text-red-600 dark:text-red-400" :
                  riskLevel === "medium" ? "text-amber-600 dark:text-amber-400" :
                  "text-emerald-600 dark:text-emerald-400"
                }`}>{riskLevel}</span>
                <p className="text-[10px] text-muted-foreground">Expected: {expectedPct}% by now</p>
              </div>
            </div>
          </section>

          {/* Target Type Summary Cards */}
          <section className="grid gap-3 sm:grid-cols-3">
            {summary.map((card) => {
              const monthly = card.monthly;
              const yearly = card.yearly;
              const primary = monthly ?? yearly;
              if (!primary) return null;

              const progressColor =
                primary.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                primary.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
                "text-muted-foreground";

              return (
                <div key={card.type} className="workspace-glass-panel rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <div className={`${TYPE_TONE[card.type]} rounded-2xl p-2.5`}>{TYPE_ICONS[card.type]}</div>
                    <span className={`text-lg font-bold tabular-nums ${progressColor}`}>{primary.progress}%</span>
                  </div>
                  <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(`${card.type}Target`)}</h3>

                  {monthly && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">{MONTHS_SHORT[currentMonth - 1]} {t("monthlyTarget")}</p>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-3xl font-semibold tracking-tight text-primary">{monthly.achieved.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground">/ {monthly.target.toLocaleString()}</span>
                      </div>
                      <Progress value={monthly.progress} className="mt-2.5 h-2" />
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("pending")}: {Math.max(0, monthly.target - monthly.achieved).toLocaleString()}</span>
                        {monthly.progress >= 75 && <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><ArrowUpRight className="h-3 w-3" /> On track</span>}
                        {monthly.progress < 40 && <span className="flex items-center gap-0.5 text-red-500"><ArrowDownRight className="h-3 w-3" /> Behind</span>}
                      </div>
                    </div>
                  )}

                  {yearly && (
                    <div className={monthly ? "mt-4 border-t border-border/40 pt-3" : "mt-3"}>
                      <p className="text-xs text-muted-foreground">{t("yearlyTarget")}</p>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className={monthly ? "text-xl font-semibold text-primary" : "text-3xl font-semibold tracking-tight text-primary"}>{yearly.achieved.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground">/ {yearly.target.toLocaleString()}</span>
                      </div>
                      <Progress value={yearly.progress} className="mt-2.5 h-2" />
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Achievements / Gamification */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Achievements</h2>
                <p className="text-sm text-muted-foreground">{earnedCount} of {achievements.length} earned</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold tabular-nums text-primary">{earnedCount}/{achievements.length}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((a) => (
                <AchievementBadge key={a.title} {...a} />
              ))}
            </div>
          </section>

          {/* Team Leaderboard */}
          {leaderboard.length > 1 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Team Leaderboard</h2>
                <p className="text-sm text-muted-foreground">See how you compare with your teammates</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                {leaderboard.map((entry, idx) => {
                  const isMe = idx + 1 === myRank;
                  return (
                    <div key={entry.agentId} className={`flex items-center gap-4 border-b border-border/30 px-5 py-3.5 last:border-b-0 ${isMe ? "bg-primary/5" : ""}`}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold">
                        {idx === 0 ? <Crown className="h-5 w-5 text-amber-500" /> :
                         idx === 1 ? <Medal className="h-5 w-5 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-5 w-5 text-orange-500" /> :
                         <span className="text-sm text-muted-foreground">#{idx + 1}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${isMe ? "text-primary" : ""}`}>
                          {entry.name} {isMe && <span className="ml-1 text-[10px] uppercase tracking-wider text-primary">(You)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums">{entry.avgPerformance}%</p>
                          <p className="text-[10px] text-muted-foreground">{entry.targetsCount} targets</p>
                        </div>
                        <Progress value={entry.avgPerformance} className="h-2 w-16" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Monthly Breakdown Grid */}
          {targets.filter((t) => t.month).length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
                <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {targets
                  .filter((t) => t.month)
                  .sort((a, b) => (a.month ?? 0) - (b.month ?? 0))
                  .map((tgt) => {
                    const isCurrent = tgt.month === currentMonth;
                    const mColor =
                      tgt.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                      tgt.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
                      "text-muted-foreground";
                    return (
                      <div key={tgt._id} className={`workspace-glass-panel rounded-2xl p-4 ${isCurrent ? "ring-2 ring-primary/30" : ""}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isCurrent && <Target className="h-3.5 w-3.5 text-primary" />}
                            <p className="text-sm font-semibold">{MONTHS_SHORT[(tgt.month ?? 1) - 1]}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-muted/60">{TYPE_SMALL_ICONS[tgt.type]}</span>
                            <span className="text-xs capitalize text-muted-foreground">{tgt.type}</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-xl font-semibold tabular-nums text-primary">{tgt.achieved}</span>
                          <span className="text-xs text-muted-foreground">/ {tgt.targetValue}</span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Progress value={tgt.progress} className="h-2 flex-1" />
                          <span className={`text-xs font-semibold tabular-nums ${mColor}`}>{tgt.progress}%</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
