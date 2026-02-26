"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

interface AgentRow {
  _id: string;
  name: string;
  email: string;
  leadsCount: number;
  conversions: number;
  placements: number;
  conversionRate: number;
}

export default function SuperAgentAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/super-agent/agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAgents(data.items ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const kpis = [
    { label: "Total Agents", value: agents.length },
    { label: "Total Leads", value: agents.reduce((a, b) => a + (b.leadsCount ?? 0), 0) },
    { label: "Conversions", value: agents.reduce((a, b) => a + (b.conversions ?? 0), 0) },
    { label: "Placements", value: agents.reduce((a, b) => a + (b.placements ?? 0), 0) },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader title="Agent Performance" description="Monitor agent activity and conversion metrics across your territory" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-base">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-3xl font-bold text-primary">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          className="h-9 rounded-lg border px-3 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Conversions</th>
                <th className="px-4 py-3 text-right">Placements</th>
                <th className="px-4 py-3 text-right">Conv. Rate</th>
                <th className="px-4 py-3">Progress</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a._id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.email}</td>
                  <td className="px-4 py-3 text-right">{a.leadsCount ?? 0}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{a.conversions ?? 0}</td>
                  <td className="px-4 py-3 text-right text-primary font-medium">{a.placements ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    {a.leadsCount > 0
                      ? `${Math.round((a.conversions / a.leadsCount) * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No agents found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
