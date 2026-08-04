"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, CalendarCheck2, CheckCircle, Edit2, Inbox, Search, Video, MapPin, Phone, XCircle, RotateCcw, Filter, X } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Interview {
  _id: string;
  jobSeekerId?: { _id?: string; fullName?: string; email?: string };
  jobId?: { _id?: string; title?: string };
  employerId?: { _id?: string; companyName?: string };
  scheduledAt: string;
  type?: string;
  status: string;
  outcome?: string;
  duration?: number;
  interviewRound?: number;
  candidateResponse?: string;
  notes?: string;
  location?: string;
  meetLink?: string;
}

interface EmployerOption { _id: string; companyName: string; }
interface JobOption { _id: string; title: string; }

const INTERVIEW_FIELDS_BASE: (t: ReturnType<typeof useTranslations>) => CrudField[] = (t) => [
  { name: "scheduledAt", label: t("fieldScheduledAt"), type: "date", required: true, min: new Date().toISOString().slice(0, 10) },
  { name: "type", label: t("fieldType"), type: "select", options: [
    { value: "video", label: t("typeVideo") }, { value: "offline", label: t("typeInPerson") }, { value: "hybrid", label: t("typeHybrid") },
  ]},
  { name: "notes", label: t("fieldNotes"), type: "textarea" },
];

const STATUS_OPTIONS_BASE: (t: ReturnType<typeof useTranslations>) => Array<{ value: string; label: string }> = (t) => [
  { value: "", label: t("filterAllStatuses") },
  { value: "scheduled", label: t("statusScheduled") },
  { value: "confirmed", label: t("statusConfirmed") },
  { value: "completed", label: t("statusCompleted") },
  { value: "cancelled", label: t("statusCancelled") },
  { value: "rescheduled", label: t("statusRescheduled") },
];

const TYPE_OPTIONS_BASE: (t: ReturnType<typeof useTranslations>) => Array<{ value: string; label: string }> = (t) => [
  { value: "", label: t("filterAllTypes") },
  { value: "video", label: t("typeVideo") },
  { value: "offline", label: t("typeInPerson") },
  { value: "hybrid", label: t("typeHybrid") },
];

const OUTCOME_OPTIONS_BASE: (t: ReturnType<typeof useTranslations>) => Array<{ value: string; label: string }> = (t) => [
  { value: "", label: t("filterAllOutcomes") },
  { value: "passed", label: t("outcomePassed") },
  { value: "failed", label: t("outcomeFailed") },
  { value: "hold", label: t("outcomeOnHold") },
  { value: "no_show", label: t("outcomeNoShow") },
];

const typeIcon = (type?: string) => {
  switch (type) {
    case "video": return <Video className="h-3.5 w-3.5" />;
    case "offline": return <MapPin className="h-3.5 w-3.5" />;
    case "hybrid": return <Phone className="h-3.5 w-3.5" />;
    default: return <MapPin className="h-3.5 w-3.5" />;
  }
};

const selectClass = "h-10 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20";

/* ── Page Component ─────────────────────────────────────────────────── */

export default function AgentInterviewsPage() {
  const t = useTranslations("agentInterviews");
  const tc = useTranslations("common");
  const ttable = useTranslations("table");
  const { can } = usePermissions();
  const pagination = usePagination();

  /* Data state */
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  /* Initialize filter options */
  const INTERVIEW_FIELDS = INTERVIEW_FIELDS_BASE(t);
  const STATUS_OPTIONS = STATUS_OPTIONS_BASE(t);
  const TYPE_OPTIONS = TYPE_OPTIONS_BASE(t);
  const OUTCOME_OPTIONS = OUTCOME_OPTIONS_BASE(t);

  /* Filter options (fetched) */
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  /* Filter state */
  const [status, setStatus] = useState("");
  const [employerFilter, setEmployerFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  /* Modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [editInterview, setEditInterview] = useState<Interview | null>(null);

  /* Debounce search */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* Fetch employer options */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/employers?limit=200");
        if (res.ok) {
          const data = await res.json();
          const list = (data.employers ?? []).map((e: { _id: string; companyName?: string; name?: string }) => ({
            _id: e._id,
            companyName: e.companyName ?? e.name ?? "Unknown",
          }));
          setEmployers(list);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  /* Fetch job options (scoped to selected employer or all) */
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (employerFilter !== "all") params.set("employerId", employerFilter);
        const res = await fetch(`/api/jobs?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list = (data.jobs ?? []).map((j: { _id: string; title?: string }) => ({
            _id: j._id,
            title: j.title ?? "Untitled",
          }));
          setJobs(list);
        }
      } catch { /* ignore */ }
    })();
  }, [employerFilter]);

  /* Fetch interviews */
  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (status) params.set("status", status);
      if (employerFilter !== "all") params.set("employerId", employerFilter);
      if (jobFilter !== "all") params.set("jobId", jobFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.items ?? data.interviews ?? []);
        pagination.updateTotal(data.total ?? data.totalCount ?? 0);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [status, employerFilter, jobFilter, typeFilter, outcomeFilter, debouncedSearch, dateFrom, dateTo, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  /* Reset page on filter change */
  useEffect(() => { pagination.resetPage(); }, [status, employerFilter, jobFilter, typeFilter, outcomeFilter, debouncedSearch, dateFrom, dateTo]);

  /* Actions */
  const updateInterviewStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/interviews/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchInterviews();
  };

  const handleSave = async (values: Record<string, string>) => {
    if (!editInterview) return;
    const res = await fetch(`/api/interviews/${editInterview._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error("Failed to update interview");
    setEditInterview(null);
    fetchInterviews();
  };

  const clearAllFilters = () => {
    setStatus("");
    setEmployerFilter("all");
    setJobFilter("all");
    setTypeFilter("");
    setOutcomeFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = status || employerFilter || jobFilter || typeFilter || outcomeFilter || debouncedSearch || dateFrom || dateTo;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("columnCandidate"), key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { fullName?: string })?.fullName ?? "" },
    { header: t("columnJob"), key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: t("columnEmployer"), key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string })?.companyName ?? "" },
    { header: t("columnType"), key: "type" },
    { header: t("columnScheduled"), key: "scheduledAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: t("columnRound"), key: "interviewRound" },
    { header: t("columnStatus"), key: "status" },
    { header: t("columnOutcome"), key: "outcome" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: interviews as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-interviews",
    title: t("exportTitle"),
  });

  /* Counts from API */
  const scheduledCount = (statusCounts.scheduled ?? 0) + (statusCounts.confirmed ?? 0);
  const completedCount = statusCounts.completed ?? 0;
  const cancelledCount = statusCounts.cancelled ?? 0;
  const rescheduledCount = statusCounts.rescheduled ?? 0;
  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="page-container space-y-3 sm:space-y-6">
      <DashboardPageHeader
        icon={CalendarCheck2}
        eyebrow={t("badgeAgentWorkspace")}
        title={t("pageTitle")}
        description={t("pageSubtitle")}
        summary={{ label: t("labelCalendar"), value: `${totalAll} ${t("labelInterviews")}`, note: t("descCalendarActivity") }}
        metrics={[
          { label: t("kpiScheduled"), value: scheduledCount, note: t("descScheduled"), icon: CalendarCheck2, active: status === "scheduled", onClick: () => setStatus(status === "scheduled" ? "" : "scheduled") },
          { label: t("kpiCompleted"), value: completedCount, note: t("descCompleted"), icon: CheckCircle, active: status === "completed", onClick: () => setStatus(status === "completed" ? "" : "completed") },
          { label: t("kpiCancelled"), value: cancelledCount, note: t("descCancelled"), icon: XCircle, active: status === "cancelled", onClick: () => setStatus(status === "cancelled" ? "" : "cancelled") },
          { label: t("kpiRescheduled"), value: rescheduledCount, note: t("descRescheduled"), icon: RotateCcw, active: status === "rescheduled", onClick: () => setStatus(status === "rescheduled" ? "" : "rescheduled") },
        ]}
      />

      {/* ── Filter Section ─────────────────────────────────────────── */}
      {/* data-table-toolbar opts into the shared mobile rules (globals.css):
          two-up filter grid and a shrinkable search field instead of five
          full-width rows. */}
      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4" data-table-toolbar="simple">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sectionFilterLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sectionFilterTitle")}</h2>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />{t("buttonClearAll")}
            </Button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative toolbar-search-field mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-border bg-background/70 pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>

        {/* Filter row */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tc("status")}</label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value || "all"} value={o.value || "all"}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Employer */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterEmployer")}</label>
            <Select value={employerFilter} onValueChange={(value) => { setEmployerFilter(value); setJobFilter("all"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAllEmployers")}</SelectItem>
                {employers.map((emp) => <SelectItem key={emp._id} value={emp._id}>{emp.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Job */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterJob")}</label>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAllJobs")}</SelectItem>
                {jobs.map((j) => <SelectItem key={j._id} value={j._id}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterType")}</label>
            <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => <SelectItem key={o.value || "all"} value={o.value || "all"}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Outcome */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterOutcome")}</label>
            <Select value={outcomeFilter || "all"} onValueChange={(v) => setOutcomeFilter(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => <SelectItem key={o.value || "all"} value={o.value || "all"}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date range – separate row for breathing room */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("labelFromDate")}</label>
            <DateTimePicker mode="date" value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("labelToDate")}</label>
            <DateTimePicker mode="date" value={dateTo} onChange={setDateTo} />
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {status && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillStatus")}: {STATUS_OPTIONS.find(o => o.value === status)?.label}
                <button type="button" onClick={() => setStatus("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {employerFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillEmployer")}: {employers.find(e => e._id === employerFilter)?.companyName}
                <button type="button" onClick={() => { setEmployerFilter(""); setJobFilter(""); }} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {jobFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillJob")}: {jobs.find(j => j._id === jobFilter)?.title}
                <button type="button" onClick={() => setJobFilter("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {typeFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillType")}: {TYPE_OPTIONS.find(o => o.value === typeFilter)?.label}
                <button type="button" onClick={() => setTypeFilter("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {outcomeFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillOutcome")}: {OUTCOME_OPTIONS.find(o => o.value === outcomeFilter)?.label}
                <button type="button" onClick={() => setOutcomeFilter("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("pillDate")}: {dateFrom || "..."} – {dateTo || "..."}
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {debouncedSearch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Search className="h-3 w-3" />{t("pillSearch")}: &quot;{debouncedSearch}&quot;
                <button type="button" onClick={() => setSearch("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Results Table ──────────────────────────────────────────── */}
      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sectionResultsLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sectionResultsTitle")}</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />{t("paginationSummary", { total: pagination.total, pages: pagination.totalPages, pageWord: pagination.totalPages === 1 ? t("pageWordSingular") : t("pageWordPlural") })}
          </div>
        </div>

        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />

        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
          <Table>
            <TableHeader>
              <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>{t("columnCandidate")}</TableHead>
              <TableHead>{t("columnJob")}</TableHead>
              <TableHead>{t("columnType")}</TableHead>
              <TableHead>{t("columnScheduled")}</TableHead>
              {can("interviews", "update") && <TableHead>{tc("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : interviews.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm">{hasActiveFilters ? t("emptyStateWithFilters") : t("emptyStateNoResults")}</span>
                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="mt-1 gap-1 text-xs">
                          <X className="h-3 w-3" />{t("buttonClearFilters")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : interviews.map((iv) => (
                <TableRow key={iv._id} className="hover:bg-secondary/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{iv.jobSeekerId?.fullName ?? "—"}</p>
                      {iv.jobSeekerId?.email && <p className="text-xs text-muted-foreground">{iv.jobSeekerId.email}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusBadge status={iv.status} />
                        {iv.outcome && <StatusBadge status={iv.outcome === "no_show" ? "no-show" : iv.outcome} />}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground/80 max-w-[180px]" title={iv.jobId?.title}>
                    <span className="block truncate">{iv.jobId?.title ?? "—"}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{iv.employerId?.companyName ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                      {typeIcon(iv.type)}
                      {iv.type === "offline" ? t("typeInPerson") : iv.type ? t(`type${iv.type.charAt(0).toUpperCase()}${iv.type.slice(1)}`) : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    <div>
                      <p className="text-sm">{new Date(iv.scheduledAt).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground/70">{new Date(iv.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{iv.duration ? ` · ${iv.duration}min` : ""}</p>
                      <p className="text-xs text-muted-foreground/70">{t("columnRound")}: {iv.interviewRound ?? 1}</p>
                    </div>
                  </TableCell>
                  {can("interviews", "update") && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="xs" onClick={() => { setEditInterview(iv); setModalOpen(true); }} title={tc("edit")} aria-label={t("ariaEditInterview", { name: iv.jobSeekerId?.fullName ?? tc("name") })}>
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        {(iv.status === "scheduled" || iv.status === "confirmed") && (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "completed")} title={t("buttonMarkCompleted")} aria-label={t("ariaMarkCompleted")}>
                              <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-selected))]" />
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "cancelled")} title={tc("cancel")} aria-label={t("ariaCancel")}>
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditInterview(null); }}
        title={t("modalEditTitle")}
        fields={INTERVIEW_FIELDS}
        initialValues={editInterview ? {
          scheduledAt: editInterview.scheduledAt?.slice(0, 10) ?? "",
          type: editInterview.type ?? "video",
          notes: editInterview.notes ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
