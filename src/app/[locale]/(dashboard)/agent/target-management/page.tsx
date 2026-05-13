"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  KpiCard, TargetSummaryCard, MonthlyDistributionGrid,
  ProgressRing, TargetEmptyState, RankBadge, PerformanceBadge,
  RiskBadge,
} from "@/components/features/targets/TargetComponents";
import { useTranslations } from "next-intl";
import {
  Building2, Users, DollarSign, TrendingUp, CalendarDays,
  RotateCcw, Target, Crosshair, Zap, Trophy, Clock,
} from "lucide-react";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyAchievement {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  overallProgress: number;
}

interface EnrichedProfile {
  _id: string;
  year: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
  employerPending: number;
  employeePending: number;
  financePending: number;
  riskScore: "high" | "medium" | "low";
  monthlyAchievements: MonthlyAchievement[];
  status: string;
}

interface LeaderboardEntry {
  rank: number;
  _id: string;
  assigneeId: string;
  assigneeName: string;
  overallProgress: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  riskScore: "high" | "medium" | "low";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentTargetManagementPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [tab, setTab] = useState<"dashboard" | "leaderboard">("dashboard");
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<EnrichedProfile | null>(null);
  const [currentMonthData, setCurrentMonthData] = useState<MonthlyAchievement | null>(null);
  const [dailyGoals, setDailyGoals] = useState<{ employer: number; employee: number; finance: number } | null>(null);
  const [weeklyGoals, setWeeklyGoals] = useState<{ employer: number; employee: number; finance: number } | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);

  const fetchOwn = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/target-profiles?year=${yearFilter}&view=own`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile ?? null);
        setCurrentMonthData(data.currentMonth ?? null);
        setDailyGoals(data.dailyGoals ?? null);
        setWeeklyGoals(data.weeklyGoals ?? null);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/target-profiles?year=${yearFilter}&view=leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setMyRank(data.myRank ?? null);
        setTotalParticipants(data.totalParticipants ?? 0);
      }
    } catch { /* ignore */ }
  }, [yearFilter]);

  useEffect(() => { fetchOwn(); }, [fetchOwn]);
  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="workspace-tone-sky rounded-2xl p-2.5"><Crosshair className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("myTargets")}</h1>
            <p className="text-sm text-muted-foreground">{t("agentDescription")}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setYearFilter(currentYear)} className="rounded-lg" disabled={yearFilter === currentYear}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5">
          <Button variant={tab === "dashboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("dashboard")} className="rounded-lg gap-1.5">
            <Target className="h-3.5 w-3.5" /> Dashboard
          </Button>
          <Button variant={tab === "leaderboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("leaderboard")} className="rounded-lg gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Leaderboard
          </Button>
        </div>
        {myRank && (
          <div className="ml-auto workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
            <Trophy className="h-3.5 w-3.5 text-primary" />
            Rank #{myRank.rank} of {totalParticipants}
          </div>
        )}
      </div>

      {/* ============ DASHBOARD TAB ============ */}
      {tab === "dashboard" && (
        <>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : !profile ? (
            <TargetEmptyState title={t("noTargetsAssigned")} description={t("contactSupervisor")} />
          ) : (
            <>
              {/* Annual KPIs */}
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label={t("employerTarget")}
                  value={<>{profile.employerAchieved}<span className="text-lg text-muted-foreground">/{profile.employerTarget}</span></>}
                  subtext={`${profile.employerProgress}% achieved · ${profile.employerPending} pending`}
                  icon={<Building2 className="h-5 w-5" />}
                  toneClassName="workspace-tone-sky"
                />
                <KpiCard
                  label={t("employeeTarget")}
                  value={<>{profile.employeeAchieved}<span className="text-lg text-muted-foreground">/{profile.employeeTarget}</span></>}
                  subtext={`${profile.employeeProgress}% achieved · ${profile.employeePending} pending`}
                  icon={<Users className="h-5 w-5" />}
                  toneClassName="workspace-tone-emerald"
                />
                <KpiCard
                  label={t("financeTarget")}
                  value={<>{profile.currency} {profile.financeAchieved.toLocaleString()}<span className="text-lg text-muted-foreground">/{profile.financeTarget.toLocaleString()}</span></>}
                  subtext={`${profile.financeProgress}% achieved`}
                  icon={<DollarSign className="h-5 w-5" />}
                  toneClassName="workspace-tone-amber"
                />
                <KpiCard
                  label={t("overallProgress")}
                  value={`${profile.overallProgress}%`}
                  subtext={`Risk: ${profile.riskScore}`}
                  icon={<TrendingUp className="h-5 w-5" />}
                  toneClassName="workspace-tone-violet"
                />
              </section>

              {/* Progress rings */}
              <div className="workspace-glass-panel rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-center gap-8">
                  <ProgressRing value={profile.employerProgress} label="Employer" sublabel={`${profile.employerAchieved}/${profile.employerTarget}`} />
                  <ProgressRing value={profile.employeeProgress} label="Employee" sublabel={`${profile.employeeAchieved}/${profile.employeeTarget}`} />
                  <ProgressRing value={profile.financeProgress} label="Finance" sublabel={`${profile.currency} ${profile.financeAchieved.toLocaleString()}`} />
                  <ProgressRing value={profile.overallProgress} label="Overall" sublabel="Annual" color="#3b82f6" />
                </div>
              </div>

              {/* Daily / Weekly Goals */}
              {dailyGoals && weeklyGoals && (
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="workspace-glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-xl bg-primary/10 p-2"><Zap className="h-4 w-4 text-primary" /></div>
                      <span className="text-sm font-semibold">Daily Goals ({MONTHS_SHORT[currentMonth - 1]})</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{dailyGoals.employer}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employers</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{dailyGoals.employee}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employees</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{profile.currency} {dailyGoals.finance.toLocaleString()}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finance</p>
                      </div>
                    </div>
                  </div>
                  <div className="workspace-glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-xl bg-primary/10 p-2"><Clock className="h-4 w-4 text-primary" /></div>
                      <span className="text-sm font-semibold">Weekly Goals ({MONTHS_SHORT[currentMonth - 1]})</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{weeklyGoals.employer}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employers</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{weeklyGoals.employee}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employees</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-primary">{profile.currency} {weeklyGoals.finance.toLocaleString()}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finance</p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Target summary cards */}
              <TargetSummaryCard
                employerTarget={profile.employerTarget}
                employeeTarget={profile.employeeTarget}
                financeTarget={profile.financeTarget}
                employerAchieved={profile.employerAchieved}
                employeeAchieved={profile.employeeAchieved}
                financeAchieved={profile.financeAchieved}
                currency={profile.currency}
              />

              {/* Monthly breakdown */}
              {profile.monthlyAchievements.length > 0 && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
                    <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
                  </div>
                  <MonthlyDistributionGrid months={profile.monthlyAchievements} currency={profile.currency} />
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* ============ LEADERBOARD TAB ============ */}
      {tab === "leaderboard" && (
        <div className="space-y-4">
          {myRank && (
            <div className="workspace-glass-panel rounded-2xl p-6 flex items-center gap-6">
              <RankBadge rank={myRank.rank} />
              <div className="flex-1">
                <p className="text-lg font-semibold">Your Position</p>
                <p className="text-sm text-muted-foreground">
                  Rank #{myRank.rank} out of {totalParticipants} agents · {myRank.overallProgress}% overall
                </p>
              </div>
              <div className="flex items-center gap-4">
                <ProgressRing value={myRank.overallProgress} size={80} strokeWidth={6} />
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Rank</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Overall</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Finance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <TargetEmptyState title="No leaderboard data" description="Targets need to be assigned to see rankings" />
                    </TableCell>
                  </TableRow>
                ) : (
                  leaderboard.map((entry) => (
                    <TableRow key={entry._id} className={entry.rank <= 3 ? "bg-primary/[0.02]" : ""}>
                      <TableCell className="text-center"><RankBadge rank={entry.rank} /></TableCell>
                      <TableCell><p className="font-medium">{entry.assigneeName}</p></TableCell>
                      <TableCell className="text-center"><PerformanceBadge pct={entry.overallProgress} /></TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.employerProgress >= 75 ? "text-emerald-600" : entry.employerProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.employerProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.employeeProgress >= 75 ? "text-emerald-600" : entry.employeeProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.employeeProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.financeProgress >= 75 ? "text-emerald-600" : entry.financeProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.financeProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center"><RiskBadge risk={entry.riskScore} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
