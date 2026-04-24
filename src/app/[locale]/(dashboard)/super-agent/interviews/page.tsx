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
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection, SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Search, RotateCcw, Calendar, Video, MapPin, Phone, Clock,
  Users, CheckCircle2, XCircle, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-6">
      <SuperAgentPageIntro
        title="Interviews"
        description="Team-wide interview overview. Monitor interview schedules, completion rates, and outcomes across all your agents."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      {/* Filters */}
      <SuperAgentSection title="Search & Filter">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by candidate, job, or company..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9"
            />
          </div>
          <SearchableSelect options={STATUS_OPTIONS} value={filters.status} onValueChange={(v) => updateFilter("status", v)} placeholder="Status" className="w-36" />
          <SearchableSelect options={TYPE_OPTIONS} value={filters.type} onValueChange={(v) => updateFilter("type", v)} placeholder="Type" className="w-32" />
          <Button variant="ghost" size="sm" onClick={() => { setFilters(INITIAL_FILTERS); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </SuperAgentSection>

      {/* Table */}
      <SuperAgentSection title="All Interviews" description={`${pagination.total} interviews found`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : interviews.length === 0 ? (
          <SuperAgentEmptyState icon={<Calendar className="h-10 w-10" />} title="No interviews found" description="No interviews match the current filters" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((i) => (
                  <TableRow key={i._id}>
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
