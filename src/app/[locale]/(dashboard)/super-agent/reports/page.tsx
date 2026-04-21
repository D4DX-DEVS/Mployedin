"use client";

import { useState, useEffect } from "react";
import { BarChart3, Coins, Target, Users2 } from "lucide-react";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";

interface Stats {
  totalAgents: number;
  totalLeads: number;
  totalPlacements: number;
  totalCommissions: number;
}

export default function SuperAgentReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/super-agent/reports")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    {
      label: "Agents Managed",
      value: stats?.totalAgents ?? 0,
      helper: "Total team members currently falling under your direct reporting view.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Total Leads",
      value: stats?.totalLeads ?? 0,
      helper: "Combined lead volume generated and worked by your team.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: "Placements",
      value: stats?.totalPlacements ?? 0,
      helper: "Successful placements recorded across the current reporting scope.",
      icon: <BarChart3 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Commissions",
      value: formatCurrency(stats?.totalCommissions ?? 0, currencyCode),
      helper: "Total commissions currently included in the super-agent report payload.",
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Reports"
        description="Use the report summary as your regional scorecard for team coverage, lead volume, placements, and commission output."
        summaryTitle="Reporting surface"
        summaryDescription="The page still consumes the same `/api/super-agent/reports` payload and only changes the presentation layer."
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[24px] border border-border/70 bg-card/90 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.18)]" />
          ))}
        </div>
      ) : (
        <SuperAgentMetricsGrid items={kpis} />
      )}

      <SuperAgentSection
        eyebrow="Insights"
        title="Performance insights"
        description="Detailed charts and month-over-month breakdowns can be added here as your team generates more reporting data."
      >
        <div className="rounded-2xl border border-border/70 bg-secondary/50 p-5 text-sm leading-6 text-muted-foreground">
          Detailed charts and month-over-month breakdowns will appear here as your team builds data.
        </div>
      </SuperAgentSection>
    </div>
  );
}
