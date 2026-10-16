"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { CircleDollarSign, Clock, Gauge, Search, Target, TrendingUp, Trophy, Wallet, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CompletionBadge, IncentiveTierBadge, KpiCard, MonthlyDistributionGrid, PerformanceBadge,
  ProgressRing, RankBadge, RiskBadge, TargetEmptyState, TargetSummaryCard, getCompletionStage,
  type IncentiveTier,
} from "@/components/features/targets/TargetComponents";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { formatProfit, monthName } from "@/components/features/targets/profitFormat";
import { AgentSectionTabs, AGENT_PERFORMANCE_TABS } from "@/components/features/agent/AgentSectionTabs";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import type { EnrichedProfile, MonthlyAchievement } from "@/lib/targets/profileAchievementCalculator";

interface OwnResponse {
  profile: EnrichedProfile | null;
  currentMonth: MonthlyAchievement | null;
  dailyGoals: { profit: number } | null;
  weeklyGoals: { profit: number } | null;
}

/** Teammates ranked by progress against their own target. No amounts: rank, name, percent and tier only. */
interface LeaderboardEntry {
  rank: number;
  assigneeId: string;
  assigneeName: string;
  profitProgress: number;
  incentiveTier: IncentiveTier;
  isMe: boolean;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalParticipants: number;
}

type Tab = "dashboard" | "analytics" | "leaderboard";

const TABS: { key: Tab; icon: typeof Target }[] = [
  { key: "dashboard", icon: Target },
  { key: "analytics", icon: TrendingUp },
  { key: "leaderboard", icon: Trophy },
];

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Target error: ${response.status}`);
  return response.json();
}

export default function AgentTargetManagementPage() {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const currentMonth = new Date().getMonth() + 1;
  const years = defaultTargetYears();
  const [year, setYear] = useUrlFilter("year", String(new Date().getFullYear()), { allow: years });
  const [tab, setTab] = useState<Tab>("dashboard");
  const [search, setSearch] = useState("");

  const own = useQuery<OwnResponse>({
    queryKey: ["agent", "target-profiles", "own", year],
    queryFn: () => getJson(`/api/agent/target-profiles?year=${year}&view=own`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const board = useQuery<LeaderboardResponse>({
    queryKey: ["agent", "target-profiles", "leaderboard", year],
    queryFn: () => getJson(`/api/agent/target-profiles?year=${year}&view=leaderboard`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  const profile = own.data?.profile ?? null;
  const leaderboard = board.data?.leaderboard ?? [];
  const myRank = board.data?.myRank ?? null;
  const totalParticipants = board.data?.totalParticipants ?? 0;
  const money = (value: number) => formatProfit(value, profile?.currency ?? "AED", locale);

  const filteredLeaderboard = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? leaderboard.filter((entry) => entry.assigneeName.toLowerCase().includes(query)) : leaderboard;
  }, [leaderboard, search]);

  const noTarget = <TargetEmptyState title={t("noTargetAssigned")} description={t("contactSupervisor")} />;

  return (
    <div className="page-container">
      <AgentSectionTabs tabs={AGENT_PERFORMANCE_TABS} ariaLabelKey="performanceTabsLabel" />
      <WorkspaceHeader
        title={t("agentTitle")}
        context={t("agentContext")}
        actions={<TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={years} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5" role="tablist" aria-label={t("tabsLabel")}>
          {TABS.map(({ key, icon: Icon }) => (
            <Button
              key={key}
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab(key)}
              className="gap-1.5 rounded-lg max-sm:min-h-11"
            >
              <Icon className="h-3.5 w-3.5" /> {t(`tab_${key}`)}
            </Button>
          ))}
        </div>
        {myRank && (
          <div className="workspace-glass-panel chip-pad ms-auto inline-flex items-center gap-2 rounded-full text-xs font-semibold">
            <Trophy className="h-3.5 w-3.5 text-primary" />
            {t("rankOfTotal", { rank: myRank.rank, total: totalParticipants })}
          </div>
        )}
      </div>

      {own.isError && !own.data && tab !== "leaderboard" ? (
        <ErrorState title={t("failedToLoadTargets")} onRetry={() => { void own.refetch(); }} retryLabel={t("retry")} />
      ) : null}

      {tab === "dashboard" && (own.isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />)}
        </div>
      ) : !profile ? noTarget : (
        <>
          <div className="workspace-glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{t("executionStatus")}</p>
              <p className="text-xs text-muted-foreground">{t("executionStatusHint")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CompletionBadge stage={getCompletionStage(profile.profitProgress)} />
              <RiskBadge risk={profile.riskScore} />
              <IncentiveTierBadge tier={profile.incentiveTier ?? "none"} />
            </div>
          </div>

          <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <KpiCard
              label={t("profitTarget")}
              value={money(profile.profitTarget)}
              subtext={t("assignedFor", { year: profile.year })}
              icon={<Target className="h-5 w-5" />}
              toneClassName="workspace-tone-sky"
            />
            <KpiCard
              label={t("profitAchieved")}
              value={money(profile.profitAchieved)}
              subtext={t("balanceValue", { value: money(profile.profitPending) })}
              icon={<CircleDollarSign className="h-5 w-5" />}
              toneClassName="workspace-tone-emerald"
            />
            <KpiCard
              label={t("thisMonth")}
              value={own.data?.currentMonth ? money(own.data.currentMonth.profitAchieved) : "—"}
              subtext={own.data?.currentMonth
                ? t("ofMonthTarget", { target: money(own.data.currentMonth.profitTarget) })
                : t("noMonthTarget")}
              icon={<Wallet className="h-5 w-5" />}
              toneClassName="workspace-tone-amber"
            />
            <KpiCard
              label={t("progress")}
              value={`${profile.profitProgress}%`}
              subtext={t("expectedByNow")}
              icon={<Gauge className="h-5 w-5" />}
              toneClassName="workspace-tone-violet"
            />
          </section>

          {own.data?.dailyGoals && own.data.weeklyGoals && (
            <section className="grid gap-3 sm:grid-cols-2">
              {([
                ["dailyGoal", Zap, own.data.dailyGoals.profit],
                ["weeklyGoal", Clock, own.data.weeklyGoals.profit],
              ] as const).map(([key, Icon, value]) => (
                <div key={key} className="workspace-glass-panel card-pad rounded-2xl">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="rounded-xl bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>
                    <span className="text-sm font-semibold">{t("goalForMonth", { goal: t(key), month: monthName(currentMonth, locale) })}</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-primary">{money(value)}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("profitToEarn")}</p>
                </div>
              ))}
            </section>
          )}
        </>
      ))}

      {tab === "analytics" && (own.isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
      ) : !profile ? noTarget : (
        <div className="space-y-4">
          <div className="workspace-glass-panel panel-body rounded-2xl">
            <div className="flex flex-wrap items-center justify-center gap-8">
              <ProgressRing value={profile.profitProgress} label={t("profitTarget")} sublabel={`${money(profile.profitAchieved)} / ${money(profile.profitTarget)}`} color="#059669" />
            </div>
          </div>

          <TargetSummaryCard profitTarget={profile.profitTarget} profitAchieved={profile.profitAchieved} currency={profile.currency} />

          <section className="space-y-4">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
              <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
            </div>
            <MonthlyDistributionGrid months={profile.monthlyAchievements} currency={profile.currency} />
          </section>
        </div>
      ))}

      {tab === "leaderboard" && (
        <div className="space-y-4">
          {myRank && (
            <div className="workspace-glass-panel panel-body flex items-center gap-6 rounded-2xl">
              <RankBadge rank={myRank.rank} />
              <div className="flex-1">
                <p className="text-lg font-semibold">{t("yourPosition")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("yourPositionDetail", { rank: myRank.rank, total: totalParticipants, progress: myRank.profitProgress })}
                </p>
              </div>
              <ProgressRing value={myRank.profitProgress} size={80} strokeWidth={6} />
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="panel-head flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{t("leaderboard")}</p>
                <p className="text-xs text-muted-foreground">{t("leaderboardHint")}</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchAgents")}
                  aria-label={t("searchAgents")}
                  className="h-11 rounded-xl border-border bg-background ps-9 text-sm"
                />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-16 text-center">{t("rank")}</TableHead>
                  <TableHead>{t("agent")}</TableHead>
                  <TableHead className="text-center">{t("progress")}</TableHead>
                  <TableHead className="text-center">{t("tier")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-16 text-center">
                      <TargetEmptyState title={t("noLeaderboardData")} description={t("noLeaderboardHint")} />
                    </TableCell>
                  </TableRow>
                ) : filteredLeaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-16 text-center">
                      <TargetEmptyState
                        title={t("noAgentsMatch")}
                        description={t("noMatchHint")}
                        action={<Button size="sm" variant="outline" onClick={() => setSearch("")} className="mt-2 rounded-lg">{t("clearFilters")}</Button>}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeaderboard.map((entry) => (
                    <TableRow key={entry.assigneeId} className={entry.isMe ? "bg-primary/[0.06]" : entry.rank <= 3 ? "bg-primary/[0.02]" : ""}>
                      <TableCell className="text-center"><RankBadge rank={entry.rank} /></TableCell>
                      <TableCell>
                        <p className="font-medium">{entry.assigneeName}{entry.isMe ? ` (${t("you")})` : ""}</p>
                      </TableCell>
                      <TableCell className="text-center"><div className="flex justify-center"><PerformanceBadge pct={entry.profitProgress} /></div></TableCell>
                      <TableCell className="text-center"><div className="flex justify-center"><IncentiveTierBadge tier={entry.incentiveTier ?? "none"} /></div></TableCell>
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
