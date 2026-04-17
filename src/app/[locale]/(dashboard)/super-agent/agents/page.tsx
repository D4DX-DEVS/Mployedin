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
import { SuperAgentInsightsPanel } from "@/components/features/super-agent/InsightsPanel";
import { AIExplainButton } from "@/components/shared/AIExplainButton";
import { cn } from "@/lib/utils";

interface AgentRow {
  _id: string;
  name: string;
  email: string;
  leadsCount: number;
  conversions: number;
  placements: number;
  conversionRate: number;
  avgResponseHours: number;
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

  /* ── Performance badge logic ── */
  function getPerformanceBadge(agent: AgentRow) {
    const badges: { label: string; className: string }[] = [];
    if (agent.leadsCount === 0) {
      badges.push({ label: "No Activity", className: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300" });
    } else if (agent.conversionRate >= 50) {
      badges.push({ label: "High Performer", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" });
    } else if (agent.conversionRate < 15 && agent.leadsCount > 0) {
      badges.push({ label: "Needs Attention", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" });
    }
    if (agent.avgResponseHours > 48 && agent.leadsCount > 0) {
      badges.push({ label: "Slow Response", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" });
    }
    return badges;
  }

  const kpis = [
    {
      label: "Total Agents",
      value: agents.length,
      helper: "Live team members currently visible in your reporting scope.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Total Leads",
      value: agents.reduce((a, b) => a + (b.leadsCount ?? 0), 0),
      helper: "Combined employer opportunities being worked across the team.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Conversions",
      value: agents.reduce((a, b) => a + (b.conversions ?? 0), 0),
      helper: "Leads converted into active hiring relationships or outcomes.",
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: "Placements",
      value: agents.reduce((a, b) => a + (b.placements ?? 0), 0),
      helper: "Confirmed placements credited to your supervised team.",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Agent Performance"
        description="Monitor agent activity, lead conversion, and placement momentum across your team from one clean review surface."
      >
        <SuperAgentInsightsPanel />
        <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Roster</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{total} visible rows</p>
          <p className="text-xs text-muted-foreground">Current page and search results stay in sync with pagination.</p>
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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              aria-label="Search agents"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl bg-background/85 pl-9 text-sm shadow-none"
            />
          </div>
        </div>

        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                <TableHead className="py-4 text-muted-foreground/80">Agent</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Email</TableHead>
                <TableHead className="py-4 text-right text-muted-foreground/80">Leads</TableHead>
                <TableHead className="py-4 text-right text-muted-foreground/80">Conversions</TableHead>
                <TableHead className="py-4 text-right text-muted-foreground/80">Placements</TableHead>
                <TableHead className="py-4 text-right text-muted-foreground/80">Conv. Rate</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Progress</TableHead>
                <TableHead className="py-4 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted/75" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <SuperAgentEmptyState
                      icon={<Users2 className="h-7 w-7" />}
                      title="No agents found"
                      description="Try a broader search or wait for your roster data to populate."
                    />
                  </TableCell>
                </TableRow>
              ) : agents.map((a) => {
                const badges = getPerformanceBadge(a);
                return (
                <TableRow key={a._id} className="border-border/50 hover:bg-accent/25">
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{a.name}</span>
                      {badges.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {badges.map((b) => (
                            <span key={b.label} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", b.className)}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground">{a.email}</TableCell>
                  <TableCell className="py-4 text-right text-foreground/85">{a.leadsCount ?? 0}</TableCell>
                  <TableCell className="py-4 text-right font-medium text-emerald-600">{a.conversions ?? 0}</TableCell>
                  <TableCell className="py-4 text-right font-medium text-primary">{a.placements ?? 0}</TableCell>
                  <TableCell className="py-4 text-right text-foreground/85">
                    {a.leadsCount > 0
                      ? `${Math.round((a.conversions / a.leadsCount) * 100)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-muted/75">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <AIExplainButton
                      rowData={{
                        name: a.name,
                        leads: a.leadsCount,
                        conversions: a.conversions,
                        placements: a.placements,
                        conversionRate: a.conversionRate,
                        avgResponseHours: a.avgResponseHours,
                      }}
                      entityLabel="Agent Performance"
                      context="Analyze this agent's performance metrics. Identify strengths and weaknesses. If conversion is low relative to leads, explain possible causes (slow response, poor follow-up). Suggest 2-3 specific improvement actions."
                    />
                  </TableCell>
                </TableRow>
                );
              })}
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
