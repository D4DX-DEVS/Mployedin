"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SuperAgentPageIntro, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge, KpiCard,
  MonthlyDistributionGrid, TargetEmptyState,
  ProgressRing,
} from "@/components/features/targets/TargetComponents";
import { TeamAllocationDialog } from "@/components/features/targets/TeamAllocationDialog";
import { useTranslations } from "next-intl";
import {
  Building2, Users, DollarSign, SplitSquareVertical,
  TrendingUp, CalendarDays, RotateCcw, Download,
  UsersRound,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EnrichedProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
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
  monthlyAchievements: {
    month: number;
    employerTarget: number;
    employeeTarget: number;
    financeTarget: number;
    employerAchieved: number;
    employeeAchieved: number;
    financeAchieved: number;
    overallProgress: number;
  }[];
  status: string;
}

interface Totals {
  agents: number;
  totalProfiles: number;
  employer: { target: number; achieved: number };
  employee: { target: number; achieved: number };
  finance: { target: number; achieved: number };
  avgPerformance: number;
  riskBreakdown: { high: number; medium: number; low: number };
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTargetProfilesPage() {
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [tab, setTab] = useState<"own" | "team">("own");
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  // Own profile
  const [ownProfile, setOwnProfile] = useState<EnrichedProfile | null>(null);

  // Team
  const [teamProfiles, setTeamProfiles] = useState<EnrichedProfile[]>([]);
  const [teamTotals, setTeamTotals] = useState<Totals | null>(null);

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);

  const fetchOwn = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-profiles?year=${yearFilter}&view=own`);
      if (res.ok) {
        const data = await res.json();
        setOwnProfile(data.profile ?? null);
      }
    } catch { toast.error("Failed to load targets"); }
    finally { setLoading(false); }
  }, [yearFilter]);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-profiles?year=${yearFilter}&view=team`);
      if (res.ok) {
        const data = await res.json();
        setTeamProfiles(data.profiles ?? []);
        setTeamTotals(data.totals ?? null);
      }
    } catch { toast.error("Failed to load team targets"); }
    finally { setTeamLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchOwn(); }, [fetchOwn]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const handleExport = () => {
    const csvRows = [
      ["Agent","Email","Currency","Employer Target","Employer Achieved","Employee Target","Employee Achieved","Finance Target","Finance Achieved","Overall %","Risk"].join(","),
      ...teamProfiles.map((r) =>
        [`"${r.assigneeName}"`, `"${r.assigneeEmail}"`, r.currency ?? "AED", r.employerTarget, r.employerAchieved, r.employeeTarget, r.employeeAchieved, r.financeTarget, r.financeAchieved, r.overallProgress, r.riskScore].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-targets-${yearFilter}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("CSV exported");
  };

  const pct = (a: number, tgt: number) => tgt > 0 ? Math.round((a / tgt) * 100) : 0;

  return (
    <div className="space-y-6">
      <SuperAgentPageIntro title={t("title")} description={t("superAgentDescription")} eyebrow={t("eyebrow")} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setYearFilter(currentYear)} className="rounded-lg" disabled={yearFilter === currentYear}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5">
          <Button variant={tab === "own" ? "default" : "ghost"} size="sm" onClick={() => setTab("own")} className="rounded-lg">{t("myTargets")}</Button>
          <Button variant={tab === "team" ? "default" : "ghost"} size="sm" onClick={() => setTab("team")} className="rounded-lg">{t("teamTargets")}</Button>
        </div>
        {tab === "team" && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={handleExport} disabled={teamProfiles.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" className="h-9 gap-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700" onClick={() => setShowDistribute(true)}>
              <SplitSquareVertical className="h-4 w-4" /> Distribute to Agents
            </Button>
          </div>
        )}
      </div>

      {/* ============ OWN TAB ============ */}
      {tab === "own" && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : !ownProfile ? (
            <TargetEmptyState title={t("noTargetsAssigned")} description={t("contactSupervisor")} />
          ) : (
            <>
              {/* Hero: combined progress rings + key numbers — single glanceable section */}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    type: "employer" as const,
                    label: t("employerTarget"),
                    icon: <Building2 className="h-4 w-4" />,
                    target: ownProfile.employerTarget,
                    achieved: ownProfile.employerAchieved,
                    pending: ownProfile.employerPending,
                    progress: ownProfile.employerProgress,
                    tone: "workspace-tone-sky",
                    fmt: (v: number) => v.toLocaleString(),
                  },
                  {
                    type: "employee" as const,
                    label: t("employeeTarget"),
                    icon: <Users className="h-4 w-4" />,
                    target: ownProfile.employeeTarget,
                    achieved: ownProfile.employeeAchieved,
                    pending: ownProfile.employeePending,
                    progress: ownProfile.employeeProgress,
                    tone: "workspace-tone-emerald",
                    fmt: (v: number) => v.toLocaleString(),
                  },
                  {
                    type: "finance" as const,
                    label: t("financeTarget"),
                    icon: <DollarSign className="h-4 w-4" />,
                    target: ownProfile.financeTarget,
                    achieved: ownProfile.financeAchieved,
                    pending: ownProfile.financePending,
                    progress: ownProfile.financeProgress,
                    tone: "workspace-tone-amber",
                    fmt: (v: number) => `${ownProfile.currency} ${v.toLocaleString()}`,
                  },
                ].map((card) => (
                  <div key={card.type} className="workspace-glass-panel rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`${card.tone} rounded-lg p-1.5`}>{card.icon}</div>
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{card.label}</p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold tracking-tight text-primary tabular-nums">
                          {card.fmt(card.achieved)}
                          <span className="text-base text-muted-foreground"> / {card.fmt(card.target)}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{card.fmt(card.pending)} pending</p>
                      </div>
                      <ProgressRing value={card.progress} size={72} strokeWidth={6} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall progress — compact single-line bar */}
              <div className="workspace-glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="workspace-tone-violet rounded-lg p-1.5"><TrendingUp className="h-4 w-4" /></div>
                  <span className="text-sm font-semibold">{t("overallProgress")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-48 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        ownProfile.overallProgress >= 75 ? "bg-emerald-500" :
                        ownProfile.overallProgress >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(ownProfile.overallProgress, 100)}%` }}
                    />
                  </div>
                  <span className={`text-lg font-bold tabular-nums ${
                    ownProfile.overallProgress >= 75 ? "text-emerald-600" :
                    ownProfile.overallProgress >= 40 ? "text-amber-600" : "text-red-500"
                  }`}>{ownProfile.overallProgress}%</span>
                </div>
              </div>

              {/* Monthly breakdown */}
              {ownProfile.monthlyAchievements.length > 0 && (
                <SuperAgentSection eyebrow={t("monthlyBreakdown")} title={t("monthlyBreakdownDescription")}>
                  <MonthlyDistributionGrid months={ownProfile.monthlyAchievements} currency={ownProfile.currency} />
                </SuperAgentSection>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ TEAM TAB ============ */}
      {tab === "team" && (
        <div className="space-y-4">
          {/* Team KPIs */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Agents" value={teamTotals?.agents ?? 0} subtext={`${teamTotals?.totalProfiles ?? 0} active profiles`} icon={<UsersRound className="h-5 w-5" />} toneClassName="workspace-tone-sky" />
            <KpiCard
              label="Employer"
              value={<>{teamTotals?.employer.achieved ?? 0}<span className="text-lg text-muted-foreground">/{teamTotals?.employer.target ?? 0}</span></>}
              subtext={`${pct(teamTotals?.employer.achieved ?? 0, teamTotals?.employer.target ?? 0)}% achieved`}
              icon={<Building2 className="h-5 w-5" />}
              toneClassName="workspace-tone-sky"
            />
            <KpiCard
              label="Employee"
              value={<>{teamTotals?.employee.achieved ?? 0}<span className="text-lg text-muted-foreground">/{teamTotals?.employee.target ?? 0}</span></>}
              subtext={`${pct(teamTotals?.employee.achieved ?? 0, teamTotals?.employee.target ?? 0)}% achieved`}
              icon={<Users className="h-5 w-5" />}
              toneClassName="workspace-tone-emerald"
            />
            <KpiCard
              label="Finance"
              value={<>{(teamTotals?.finance.achieved ?? 0).toLocaleString()}<span className="text-lg text-muted-foreground">/{(teamTotals?.finance.target ?? 0).toLocaleString()}</span></>}
              subtext={`${ownProfile?.currency ?? "AED"} · ${pct(teamTotals?.finance.achieved ?? 0, teamTotals?.finance.target ?? 0)}% achieved`}
              icon={<DollarSign className="h-5 w-5" />}
              toneClassName="workspace-tone-amber"
            />
          </section>

          {/* Agent table */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Employer</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Employee</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Finance</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Performance</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : teamProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <TargetEmptyState
                        title={t("noAgentTargets")}
                        description="Distribute your targets to agents using the button above"
                        action={
                          <Button size="sm" onClick={() => setShowDistribute(true)} className="mt-2 gap-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                            <SplitSquareVertical className="h-4 w-4" /> Distribute
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  teamProfiles.map((agent) => (
                    <TableRow key={agent._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agent.assigneeName}</p>
                          <p className="text-xs text-muted-foreground">{agent.assigneeEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.employerAchieved} target={agent.employerTarget} progress={agent.employerProgress} type="employer" />
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.employeeAchieved} target={agent.employeeTarget} progress={agent.employeeProgress} type="employee" />
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.financeAchieved} target={agent.financeTarget} progress={agent.financeProgress} type="finance" currency={agent.currency} />
                      </TableCell>
                      <TableCell>
                        <PerformanceBadge pct={agent.overallProgress} />
                      </TableCell>
                      <TableCell>
                        <RiskBadge risk={agent.riskScore} />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          agent.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                        }`}>{agent.status}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <TeamAllocationDialog
        open={showDistribute}
        onOpenChange={setShowDistribute}
        year={yearFilter}
        supervisorProfile={ownProfile}
        teamProfiles={teamProfiles}
        onSuccess={fetchTeam}
      />
    </div>
  );
}
