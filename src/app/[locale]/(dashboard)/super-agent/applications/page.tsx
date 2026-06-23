"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  RotateCcw, FileText, TrendingUp,
  CheckCircle2, Star,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicationItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  agentName?: string;
  status: string;
  matchScore?: number;
  appliedAt: string;
  source?: string;
}

interface Filters {
  search: string;
  status: string;
  agent: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all", agent: "all" };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_scheduled", label: "Interview" },
  { value: "selected", label: "Selected" },
  { value: "offer", label: "Offer" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [agentOptions, setAgentOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: "All agents" }]);
  const [stats, setStats] = useState({ total: 0, shortlisted: 0, hired: 0, conversionRate: 0 });
  const pagination = usePagination();

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.agent !== "all") params.set("agent", filters.agent);

      const res = await fetch(`/api/super-agent/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
        if (data.agents) {
          setAgentOptions([
            { value: "all", label: "All agents" },
            ...data.agents.map((a: { _id: string; name: string }) => ({ value: a._id, label: a.name })),
          ]);
        }
      }
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const metricsItems = [
    { label: "Total Applications", value: stats.total, helper: "All team applications", icon: <FileText className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Shortlisted", value: stats.shortlisted, helper: "Currently shortlisted", icon: <Star className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
    { label: "Hired", value: stats.hired, helper: "Successfully hired", icon: <CheckCircle2 className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Conversion Rate", value: `${stats.conversionRate}%`, helper: "Applied to hired", icon: <TrendingUp className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Applications"
        description="Monitor the entire application pipeline across your team. Track candidate progress from application to hiring."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      <TableToolbar
        title="Application tracking"
        description="Filter by status or agent to narrow down the application list."
        search={filters.search}
        onSearchChange={(v) => updateFilter("search", v)}
        searchPlaceholder="Search candidate, job title, or company..."
        hasActiveFilters={filters.status !== "all" || filters.agent !== "all"}
        actions={
          (filters.search || filters.status !== "all" || filters.agent !== "all") ? (
            <button
              type="button"
              onClick={() => { setFilters(INITIAL_FILTERS); pagination.resetPage(); }}
              className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          ) : undefined
        }
        filterContent={
          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              options={STATUS_OPTIONS}
              value={filters.status}
              onValueChange={(v) => updateFilter("status", v)}
              placeholder="All statuses"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={agentOptions}
              value={filters.agent}
              onValueChange={(v) => updateFilter("agent", v)}
              placeholder="All agents"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
          </div>
        }
      />

      <SuperAgentSection
        eyebrow="Pipeline"
        title="Applications"
      >
        <div className="overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]">Candidate</TableHead>
                <TableHead className="min-w-[180px]">Job</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No applications found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : applications.map((a) => (
                <TableRow key={a._id} className="bg-transparent">
                  <TableCell>
                    <p className="font-medium text-foreground">{a.candidateName}</p>
                    {a.candidateEmail && <p className="text-xs text-muted-foreground">{a.candidateEmail}</p>}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{a.jobTitle}</p>
                    {a.companyName && <p className="text-xs text-muted-foreground">{a.companyName}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.agentName || "—"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    {a.matchScore != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-12 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${a.matchScore >= 80 ? "bg-emerald-500" : a.matchScore >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${a.matchScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{a.matchScore}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{(a.source ?? "direct").replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.appliedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
          />
        </div>
      </SuperAgentSection>
    </div>
  );
}
