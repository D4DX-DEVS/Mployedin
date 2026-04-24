"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection, SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Search, RotateCcw, FileText, Users, TrendingUp, Clock,
  CheckCircle2, XCircle, Star, Briefcase, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-6">
      <SuperAgentPageIntro
        title="Applications"
        description="Monitor the entire application pipeline across your team. Track candidate progress from application to hiring."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      <SuperAgentSection title="Search & Filter">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search candidate, job title, or company..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9"
            />
          </div>
          <SearchableSelect options={STATUS_OPTIONS} value={filters.status} onValueChange={(v) => updateFilter("status", v)} placeholder="Status" className="w-40" />
          <SearchableSelect options={agentOptions} value={filters.agent} onValueChange={(v) => updateFilter("agent", v)} placeholder="Agent" className="w-40" />
          <Button variant="ghost" size="sm" onClick={() => { setFilters(INITIAL_FILTERS); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </SuperAgentSection>

      <SuperAgentSection title="Applications Pipeline" description={`${pagination.total} applications`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : applications.length === 0 ? (
          <SuperAgentEmptyState icon={<FileText className="h-10 w-10" />} title="No applications found" description="Try adjusting your filters" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Match Score</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((a) => (
                  <TableRow key={a._id}>
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
                    <TableCell className="text-xs capitalize text-muted-foreground">{a.source ?? "direct"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.appliedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SuperAgentSection>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
