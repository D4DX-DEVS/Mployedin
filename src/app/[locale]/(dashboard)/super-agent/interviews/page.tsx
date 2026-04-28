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
  RotateCcw, Calendar, Video, MapPin, Phone, Clock,
  CheckCircle2, XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InterviewItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  agentName?: string;
  type: "video" | "offline" | "hybrid";
  status: string;
  scheduledAt: string;
  duration?: number;
  meetLink?: string;
  location?: string;
  createdAt: string;
}

interface Filters {
  search: string;
  status: string;
  type: string;
  dateFrom: string;
  dateTo: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all", type: "all", dateFrom: "", dateTo: "" };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "video", label: "Video" },
  { value: "offline", label: "In-Person" },
  { value: "hybrid", label: "Hybrid" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentInterviewsPage() {
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [stats, setStats] = useState({ total: 0, scheduled: 0, completed: 0, cancelRate: 0 });
  const pagination = usePagination();

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/super-agent/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      toast.error("Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const metricsItems = [
    { label: "Total Interviews", value: stats.total, helper: "Across all agents", icon: <Calendar className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Scheduled", value: stats.scheduled, helper: "Upcoming", icon: <Clock className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
    { label: "Completed", value: stats.completed, helper: "Successfully done", icon: <CheckCircle2 className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Cancel Rate", value: `${stats.cancelRate}%`, helper: "Cancellation rate", icon: <XCircle className="h-5 w-5" />, toneClassName: "workspace-tone-rose" },
  ];

  const typeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="h-3.5 w-3.5 text-sky-500" />;
      case "offline": return <MapPin className="h-3.5 w-3.5 text-emerald-500" />;
      case "hybrid": return <Phone className="h-3.5 w-3.5 text-violet-500" />;
      default: return <Calendar className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Interviews"
        description="Team-wide interview overview. Monitor interview schedules, completion rates, and outcomes across all your agents."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      <TableToolbar
        title="Interview tracking"
        description="Filter by status, type, or search to narrow down the interview list."
        search={filters.search}
        onSearchChange={(v) => updateFilter("search", v)}
        searchPlaceholder="Search by candidate, job, or company..."
        hasActiveFilters={filters.status !== "all" || filters.type !== "all"}
        actions={
          (filters.search || filters.status !== "all" || filters.type !== "all") ? (
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
              options={TYPE_OPTIONS}
              value={filters.type}
              onValueChange={(v) => updateFilter("type", v)}
              placeholder="All types"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
          </div>
        }
      />

      <SuperAgentSection
        eyebrow="Schedule"
        title="Interviews"
      >
        <div className="overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]">Candidate</TableHead>
                <TableHead className="min-w-[180px]">Job</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Duration</TableHead>
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
              ) : interviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No interviews found</p>
                        <p className="mt-1 text-sm text-muted-foreground">No interviews match the current filters</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : interviews.map((i) => (
                <TableRow key={i._id} className="bg-transparent">
                  <TableCell>
                    <p className="font-medium text-foreground">{i.candidateName}</p>
                    {i.candidateEmail && <p className="text-xs text-muted-foreground">{i.candidateEmail}</p>}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{i.jobTitle}</p>
                    {i.companyName && <p className="text-xs text-muted-foreground">{i.companyName}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.agentName || "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm capitalize">
                      {typeIcon(i.type)} {i.type}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={i.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(i.scheduledAt).toLocaleDateString()}{" "}
                    <span className="text-xs">{new Date(i.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.duration ? `${i.duration} min` : "—"}</TableCell>
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
