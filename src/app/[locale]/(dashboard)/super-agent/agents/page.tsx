"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

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
  }, [search, page, limit]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const kpis = [
    { label: "Total Agents", value: agents.length },
    { label: "Total Leads", value: agents.reduce((a, b) => a + (b.leadsCount ?? 0), 0) },
    { label: "Conversions", value: agents.reduce((a, b) => a + (b.conversions ?? 0), 0) },
    { label: "Placements", value: agents.reduce((a, b) => a + (b.placements ?? 0), 0) },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Agent Performance" description="Monitor agent activity and conversion metrics across your team" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-base">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-3xl font-bold text-primary">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search agents…" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9 h-9" />
        </div>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Agent</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">Placements</TableHead>
              <TableHead className="text-right">Conv. Rate</TableHead>
              <TableHead>Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No agents found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : agents.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.email}</TableCell>
                <TableCell className="text-right">{a.leadsCount ?? 0}</TableCell>
                <TableCell className="text-right text-green-600 font-medium">{a.conversions ?? 0}</TableCell>
                <TableCell className="text-right text-primary font-medium">{a.placements ?? 0}</TableCell>
                <TableCell className="text-right">
                  {a.leadsCount > 0
                    ? `${Math.round((a.conversions / a.leadsCount) * 100)}%`
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
