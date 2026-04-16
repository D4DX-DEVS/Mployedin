"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Activity, CircleSlash, Handshake, Search, Target } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  country?: string;
  industry?: string;
  status: LeadStatus;
  agentId?: { userId?: { name?: string } };
  createdAt: string;
}

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

export default function SuperAgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/super-agent/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.items ?? []);
      updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);
  }, [statusFilter, search, page, limit, updateTotal]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  const kpis = [
    {
      label: "Open Pipeline",
      value: leads.filter((lead) => !["converted", "lost"].includes(lead.status)).length,
      helper: "Leads still moving through discovery, contact, or negotiation.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "bg-sky-50 text-sky-600",
    },
    {
      label: "Contacted",
      value: stageCounts.contacted,
      helper: "Accounts already touched by your team and in follow-up motion.",
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Converted",
      value: stageCounts.converted,
      helper: "Leads that have already moved into active employer relationships.",
      icon: <Handshake className="h-5 w-5" />,
      toneClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Lost",
      value: stageCounts.lost,
      helper: "Dropped opportunities that may need later reactivation or review.",
      icon: <CircleSlash className="h-5 w-5" />,
      toneClassName: "bg-rose-50 text-rose-600",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Lead Pipeline"
        description="Review every employer lead across your team, switch between stages quickly, and keep regional follow-up work visible from one modern queue."
        summaryTitle="Coverage"
        summaryDescription="Use the stage strip to isolate bottlenecks, then search by company or contact without changing the existing API behavior."
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Pipeline"
        title="Filter and review employer leads"
        description="Stage toggles and search still drive the same lead query logic; this update only changes the surface and layout."
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(statusFilter === s ? "" : s); resetPage(); }}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${statusFilter === s ? "border-sky-200 bg-sky-50 shadow-[0_20px_42px_-34px_rgba(2,132,199,0.55)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{s}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{stageCounts[s]}</p>
              </button>
            ))}
          </div>

          <div className="relative w-full max-w-xs min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search company, contact..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <SuperAgentDataTableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contact</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Country</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Industry</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stage</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</TableHead>
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
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <SuperAgentEmptyState
                        icon={<Target className="h-7 w-7" />}
                        title="No leads found"
                        description="Try another search or switch stages to widen the pipeline view."
                      />
                    </TableCell>
                  </TableRow>
                ) : leads.map((lead) => (
                  <TableRow key={lead._id} className="border-slate-100 hover:bg-sky-50/30">
                    <TableCell className="py-4 font-medium text-slate-950">{lead.companyName}</TableCell>
                    <TableCell className="py-4 text-slate-600">{lead.contactPerson}</TableCell>
                    <TableCell className="py-4 text-slate-500">{lead.country ?? "—"}</TableCell>
                    <TableCell className="py-4 text-slate-500">{lead.industry ?? "—"}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={lead.status} /></TableCell>
                    <TableCell className="py-4 text-xs text-slate-500">{lead.agentId?.userId?.name ?? "—"}</TableCell>
                    <TableCell className="py-4 text-xs text-slate-500">{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SuperAgentDataTableShell>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
