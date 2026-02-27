"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

interface Stats {
  totalAgents: number;
  totalLeads: number;
  totalPlacements: number;
  totalCommissions: number;
}

export default function SuperAgentReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-agent/reports")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { label: "Agents Managed", value: stats?.totalAgents ?? 0, color: "bg-blue-50 text-blue-700" },
    { label: "Total Leads", value: stats?.totalLeads ?? 0, color: "bg-purple-50 text-purple-700" },
    { label: "Placements", value: stats?.totalPlacements ?? 0, color: "bg-green-50 text-green-700" },
    { label: "Commissions ($)", value: `$${(stats?.totalCommissions ?? 0).toLocaleString()}`, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader title="Reports" description="Your team's performance overview and key metrics" />

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground/60">Loading reports…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={`rounded-xl p-4 ${kpi.color}`}>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-sm mt-1 opacity-80">{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Performance Insights</h3>
        <p className="text-sm text-muted-foreground">
          Detailed charts and month-over-month breakdowns will appear here as your team builds data.
        </p>
      </div>
    </div>
  );
}
