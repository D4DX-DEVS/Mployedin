"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge, KpiCard,
  TargetSummaryCard, MonthlyDistributionGrid, TargetEmptyState,
  ProgressRing,
} from "@/components/features/targets/TargetComponents";
import {
  ArrowLeft, Building2, Users, DollarSign, Target, TrendingUp,
  Clock, CalendarDays, UsersRound, Activity, MapPin, Eye,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatCount } from "@/lib/ui/intlFormat";

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

interface ProfileDetail {
  _id: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  year: number;
  region?: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;
  distributionStrategy: string;
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
  notes?: string;
  createdAt: string;
}

interface AgentProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
  riskScore: "high" | "medium" | "low";
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminTargetProfileDetailPage() {
  const t = useTranslations("targets");
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const id = params.id as string;

  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/target-profiles/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setAgentProfiles(data.agentProfiles ?? []);
      } else {
        toast.error(t("profileNotFound"));
      }
    } catch {
      toast.error(t("failedToLoadProfile"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <TargetEmptyState
          title={t("notFound")}
          action={
            <Link href={`/${locale}/admin/target-management`}>
              <Button variant="outline" className="gap-2 rounded-xl">
                <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Back */}
      <Link
        href={`/${locale}/admin/target-management`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
      </Link>

      {/* Header */}
      <div className="workspace-glass-panel rounded-2xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="workspace-tone-sky rounded-2xl p-3.5">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{profile.assigneeName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {profile.year} · {profile.assigneeRole === "super_agent" ? "Supervisor" : "Agent"} · {profile.assigneeEmail}
              </p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {profile.region && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    <MapPin className="h-3 w-3" /> {profile.region}
                  </span>
                )}
                <span className="text-xs text-muted-foreground capitalize">
                  Strategy: {profile.distributionStrategy}
                </span>
              </div>
              {profile.notes && (
                <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{profile.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={profile.status} />
            <RiskBadge risk={profile.riskScore} />
          </div>
        </div>

        {/* Overall progress */}
        <div className="mt-6 flex items-center gap-4">
          <Progress value={Math.min(profile.overallProgress, 100)} className="h-3 flex-1" />
          <span className={`text-lg font-bold tabular-nums ${
            profile.overallProgress >= 75 ? "text-emerald-600" :
            profile.overallProgress >= 40 ? "text-amber-600" :
            "text-muted-foreground"
          }`}>{profile.overallProgress}%</span>
        </div>
      </div>

      {/* Progress rings */}
      <section className="workspace-glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-center gap-8">
          <ProgressRing
            value={profile.employerProgress}
            label="Employer"
            sublabel={`${profile.employerAchieved}/${profile.employerTarget}`}
          />
          <ProgressRing
            value={profile.employeeProgress}
            label="Employee"
            sublabel={`${profile.employeeAchieved}/${profile.employeeTarget}`}
          />
          <ProgressRing
            value={profile.financeProgress}
            label="Finance"
            sublabel={`${profile.currency} ${formatCount(profile.financeAchieved)}/${formatCount(profile.financeTarget)}`}
          />
          <ProgressRing
            value={profile.overallProgress}
            label="Overall"
            sublabel="Combined progress"
            color="#3b82f6"
          />
        </div>
      </section>

      {/* Target Summary Cards */}
      <TargetSummaryCard
        employerTarget={profile.employerTarget}
        employeeTarget={profile.employeeTarget}
        financeTarget={profile.financeTarget}
        employerAchieved={profile.employerAchieved}
        employeeAchieved={profile.employeeAchieved}
        financeAchieved={profile.financeAchieved}
        currency={profile.currency}
      />

      {/* Monthly Breakdown */}
      {profile.monthlyAchievements.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
            <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
          </div>
          <MonthlyDistributionGrid
            months={profile.monthlyAchievements}
            currency={profile.currency}
          />
        </section>
      )}

      {/* Agent Team Breakdown */}
      {agentProfiles.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Team Breakdown</h2>
            <p className="text-sm text-muted-foreground">
              Agent target profiles under this supervisor
            </p>
          </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentProfiles.map((agent) => (
                  <TableRow key={agent._id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{agent.assigneeName}</p>
                        <p className="text-xs text-muted-foreground">{agent.assigneeEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CompactProgress
                        achieved={agent.employerAchieved}
                        target={agent.employerTarget}
                        progress={agent.employerProgress}
                        type="employer"
                      />
                    </TableCell>
                    <TableCell>
                      <CompactProgress
                        achieved={agent.employeeAchieved}
                        target={agent.employeeTarget}
                        progress={agent.employeeProgress}
                        type="employee"
                      />
                    </TableCell>
                    <TableCell>
                      <CompactProgress
                        achieved={agent.financeAchieved}
                        target={agent.financeTarget}
                        progress={agent.financeProgress}
                        type="finance"
                      />
                    </TableCell>
                    <TableCell>
                      <PerformanceBadge pct={agent.overallProgress} />
                    </TableCell>
                    <TableCell>
                      <RiskBadge risk={agent.riskScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
