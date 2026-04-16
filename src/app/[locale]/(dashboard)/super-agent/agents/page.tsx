"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Activity, BriefcaseBusiness, Search, Target, Users2 } from "lucide-react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

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
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/super-agent/agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAgents(data.items ?? []);
      updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);
  }, [search, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const kpis = [
    {
      label: "Total Agents",
      value: agents.length,
      helper: "Live team members currently visible in your reporting scope.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "bg-sky-50 text-sky-600",
    },
    {
      label: "Total Leads",
      value: agents.reduce((a, b) => a + (b.leadsCount ?? 0), 0),
      helper: "Combined employer opportunities being worked across the team.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Conversions",
      value: agents.reduce((a, b) => a + (b.conversions ?? 0), 0),
      helper: "Leads converted into active hiring relationships or outcomes.",
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Placements",
      value: agents.reduce((a, b) => a + (b.placements ?? 0), 0),
      helper: "Confirmed placements credited to your supervised team.",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      toneClassName: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Agent Performance"
        description="Monitor agent activity, lead conversion, and placement momentum across your team from one clean review surface."
        summaryTitle="Review mode"
        summaryDescription="Search agents quickly, compare conversion efficiency, and spot who needs support before pipeline velocity slows down."
      >
        <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Roster</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{total} visible rows</p>
          <p className="text-xs text-slate-500">Current page and search results stay in sync with pagination.</p>
        </div>
      </SuperAgentPageIntro>

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Team review"
        title="Compare output across your assigned agents"
        description="Search by name or email, then review lead volume, conversions, placements, and conversion progress without changing the underlying reporting logic."
      >
        <div className="mb-4 flex gap-3">
          <div className="relative w-full max-w-xs min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
            />
          </div>
        </div>

        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</TableHead>
                <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Leads</TableHead>
                <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Conversions</TableHead>
                <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Placements</TableHead>
                <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Conv. Rate</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-slate-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <SuperAgentEmptyState
                      icon={<Users2 className="h-7 w-7" />}
                      title="No agents found"
                      description="Try a broader search or wait for your roster data to populate."
                    />
                  </TableCell>
                </TableRow>
              ) : agents.map((a) => (
                <TableRow key={a._id} className="border-slate-100 hover:bg-sky-50/30">
                  <TableCell className="py-4 font-medium text-slate-950">{a.name}</TableCell>
                  <TableCell className="py-4 text-xs text-slate-500">{a.email}</TableCell>
                  <TableCell className="py-4 text-right text-slate-700">{a.leadsCount ?? 0}</TableCell>
                  <TableCell className="py-4 text-right font-medium text-emerald-600">{a.conversions ?? 0}</TableCell>
                  <TableCell className="py-4 text-right font-medium text-sky-700">{a.placements ?? 0}</TableCell>
                  <TableCell className="py-4 text-right text-slate-700">
                    {a.leadsCount > 0
                      ? `${Math.round((a.conversions / a.leadsCount) * 100)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-600"
                        style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SuperAgentDataTableShell>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
