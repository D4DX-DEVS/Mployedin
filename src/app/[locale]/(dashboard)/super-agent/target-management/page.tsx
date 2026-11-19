"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SuperAgentPageIntro, SuperAgentSection } from "@/components/features/super-agent/WorkspacePage";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { AgentTargetRow } from "./_components/AgentTargetRow";
import { TableBodySkeleton } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/currency";

interface OwnTarget {
  jobTarget: number;
  conversionTarget: number;
  revenueTarget: number;
  currency?: string;
}

interface AgentRow {
  userId: string;
  name: string;
  email: string;
  currency: string;
  target?: {
    jobTarget: number;
    conversionTarget: number;
    revenueTarget: number;
    setByRole: "admin" | "super_agent";
    overriddenByAdmin: boolean;
  };
  actuals?: {
    jobs: number;
    onboarded: number;
    revenue: number;
  };
}

interface TeamData {
  ownTarget: OwnTarget | null;
  agents: AgentRow[];
  canSetRevenueTargets: boolean;
  year: number;
}

export default function SuperAgentTargetManagementPage() {
  const t = useTranslations("profitTargets");
  const currentYear = String(new Date().getFullYear());
  const years = defaultTargetYears();
  const [year, setYear] = useUrlFilter("year", currentYear, { allow: years });

  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-agent/target-profiles/team?year=${year}`);
      if (!res.ok) throw new Error(`team targets ${res.status}`);
      const result = await res.json() as TeamData;
      setData(result);
    } catch {
      setError(t("failedLoadTeamTargets"));
      toast.error(t("actionFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [year]);

  const ownTarget = data?.ownTarget;
  const agents = data?.agents ?? [];
  const canSetRevenueTargets = data?.canSetRevenueTargets ?? false;

  // Totals already given to agents. Revenue is kept per currency: agents can bill in different ones.
  const teamTotals = agents.reduce(
    (acc, agent) => ({
      jobs: acc.jobs + (agent.target?.jobTarget ?? 0),
      conversion: acc.conversion + (agent.target?.conversionTarget ?? 0),
    }),
    { jobs: 0, conversion: 0 }
  );
  const revenueByCurrency = new Map<string, number>();
  for (const agent of agents) {
    const amount = agent.target?.revenueTarget ?? 0;
    if (amount > 0) revenueByCurrency.set(agent.currency, (revenueByCurrency.get(agent.currency) ?? 0) + amount);
  }
  const teamRevenue = revenueByCurrency.size === 0
    ? formatCurrency(0, ownTarget?.currency ?? "AED")
    : [...revenueByCurrency].map(([cur, amount]) => formatCurrency(amount, cur)).join(" · ");
  const monthly = (n: number) => (Number.isInteger(n / 12) ? String(n / 12) : (n / 12).toFixed(1));
  const ownCurrency = ownTarget?.currency ?? "AED";

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("saTitle")}
        description={t("targetManagementDescription", { year })}
        inlineActions
      >
        <TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={years} />
      </SuperAgentPageIntro>

      {/* My target from admin */}
      {ownTarget && (
        <SuperAgentSection
          eyebrow={t("myTarget")}
          title={t("myTargetFromAdmin")}
          description={t("myTargetDescription")}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { key: "jobs", label: t("jobTargetShort"), value: String(ownTarget.jobTarget), hint: monthly(ownTarget.jobTarget) },
              { key: "onboarded", label: t("conversionTargetShort"), value: String(ownTarget.conversionTarget), hint: monthly(ownTarget.conversionTarget) },
              {
                key: "revenue",
                label: t("revenueTargetShort"),
                value: formatCurrency(ownTarget.revenueTarget, ownCurrency),
                hint: formatCurrency(ownTarget.revenueTarget / 12, ownCurrency),
              },
            ].map((card) => (
              <div key={card.key} className="rounded-xl border p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("yearTotalFor", { year })} · {t("perMonthHint", { value: card.hint })}
                </p>
              </div>
            ))}
          </div>
        </SuperAgentSection>
      )}

      {/* Agents table */}
      <SuperAgentSection
        eyebrow={t("yourTeam")}
        title={t("agentTargets")}
        description={t("agentTargetsYearDescription")}
      >
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("agent")}</TableHead>
                  <TableHead className="text-center">{t("jobsYearHeader")}</TableHead>
                  <TableHead className="text-center">{t("onboardedYearHeader")}</TableHead>
                  <TableHead className="text-center">{t("revenueYearHeader")}</TableHead>
                  <TableHead className="w-20">{t("actionsHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableBodySkeleton cols={5} rows={5} />
              </TableBody>
            </Table>
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-secondary/50 text-sm leading-6 text-muted-foreground p-6 text-center">
            {t("noAgentsInTeam")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("agent")}</TableHead>
                  <TableHead className="text-center">{t("jobsYearHeader")}</TableHead>
                  <TableHead className="text-center">{t("onboardedYearHeader")}</TableHead>
                  <TableHead className="text-center">{canSetRevenueTargets ? t("revenueYearHeader") : t("revenueLocked")}</TableHead>
                  <TableHead className="w-20">{t("actionsHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <AgentTargetRow
                    key={agent.userId}
                    agent={agent}
                    year={parseInt(year)}
                    canSetRevenueTargets={canSetRevenueTargets}
                    onUpdate={() => { void fetchData(); }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Team totals */}
        {agents.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-semibold mb-4">{t("givenToAgents")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border p-4 bg-secondary/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("jobTargetShort")}</p>
                <p className="text-2xl font-bold">{teamTotals.jobs}</p>
              </div>
              <div className="rounded-xl border p-4 bg-secondary/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("conversionTargetShort")}</p>
                <p className="text-2xl font-bold">{teamTotals.conversion}</p>
              </div>
              <div className="rounded-xl border p-4 bg-secondary/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("revenueTargetShort")}</p>
                <p className="text-2xl font-bold tabular-nums">{teamRevenue}</p>
              </div>
            </div>
          </div>
        )}
      </SuperAgentSection>

      {!canSetRevenueTargets && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm text-blue-900">
            {t("revenueTargetPermissionNote")}
          </p>
        </div>
      )}
    </div>
  );
}
