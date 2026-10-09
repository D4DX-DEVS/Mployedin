"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { readQuery } from "@/lib/ui/urlQuery";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarCheck2, CheckCircle, Inbox, Video, MapPin, Pencil, Phone, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTableExport } from "@/hooks/useTableExport";
import { useConfirm } from "@/hooks/useConfirm";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableBodySkeleton } from "@/components/ui/loading";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate, formatTime } from "@/lib/ui/intlFormat";

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
  // The interview has happened and nobody recorded how it went — the one
  // outcome state that is a task rather than a result.
  { value: "pending", label: t("outcomePending") },
  { value: "passed", label: t("outcomePassed") },
  { value: "failed", label: t("outcomeFailed") },
  { value: "hold", label: t("outcomeOnHold") },
  { value: "no_show", label: t("outcomeNoShow") },
];

// StatusBadge has no passed/failed/hold entries, so an outcome passed as the
// status rendered "Unknown status". Borrow a status with the right colour and
// pass the outcome's own label.
const OUTCOME_TONE: Record<string, string> = {
  pending: "pending",
  passed: "completed",
  failed: "cancelled",
  hold: "rescheduled",
  no_show: "no_show",
};

const typeIcon = (type?: string) => {
  switch (type) {
    case "video": return <Video className="h-3.5 w-3.5" />;
    case "offline": return <MapPin className="h-3.5 w-3.5" />;
    case "hybrid": return <Phone className="h-3.5 w-3.5" />;
    default: return <MapPin className="h-3.5 w-3.5" />;
  }
};

/* ── Page Component ─────────────────────────────────────────────────── */

export default function AgentInterviewsPage() {
  const t = useTranslations("agentInterviews");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const tc = useTranslations("common");
  const { can } = usePermissions();
  const pagination = usePagination();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const canUpdate = can("interviews", "update");
  const columnCount = canUpdate ? 6 : 5;

  /* Data state */
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  /* Initialize filter options */
  const INTERVIEW_FIELDS = INTERVIEW_FIELDS_BASE(t);
  const STATUS_OPTIONS = STATUS_OPTIONS_BASE(t);
  const TYPE_OPTIONS = TYPE_OPTIONS_BASE(t);
  const OUTCOME_OPTIONS = OUTCOME_OPTIONS_BASE(t);

  /* Filter options (fetched) */
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  /* Filter state — mirrored into the query string so a filtered view is an
     address. "Interviews with no outcome recorded" is a thing the dashboard
     queue links to; it needs a URL to link to. */
  const [status, setStatus] = useUrlFilter("status", "");
  const [employerFilter, setEmployerFilter] = useUrlFilter("employerId", "all");
  const [jobFilter, setJobFilter] = useUrlFilter("jobId", "all");
  const [typeFilter, setTypeFilter] = useUrlFilter("type", "");
  const [outcomeFilter, setOutcomeFilter] = useUrlFilter("outcome", "");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useUrlFilter("dateFrom", "");
  const [dateTo, setDateTo] = useUrlFilter("dateTo", "");

  /* Modal state */
  // `?new=1` from the Create menu and ⌘K opens the schedule dialog on arrival.
  const [modalOpen, setModalOpen] = useState(() => readQuery().get("new") === "1");
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
    setLoadError(false);
    try {
      const params = pagination.paginationParams();
      if (status) params.set("status", status);
      if (employerFilter !== "all") params.set("employerId", employerFilter);
      if (jobFilter !== "all") params.set("jobId", jobFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.items ?? data.interviews ?? []);
        pagination.updateTotal(data.total ?? data.totalCount ?? 0);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
      } else {
        // Was swallowed: a failed load read as "No interviews found".
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, [status, employerFilter, jobFilter, typeFilter, outcomeFilter, debouncedSearch, dateFrom, dateTo, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  /* Reset page on filter change */
  useEffect(() => { pagination.resetPage(); }, [status, employerFilter, jobFilter, typeFilter, outcomeFilter, debouncedSearch, dateFrom, dateTo]);

  /* Actions */
  const updateInterviewStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/interviews/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
      });
      // A refused update used to do nothing at all, with no message.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("statusUpdateFailed"));
        return;
      }
      await fetchInterviews();
    } catch {
      toast.error(t("statusUpdateFailed"));
    } finally {
      setUpdatingId(null);
    }
  };

  // Cancel was one click with no confirm, right beside Mark completed.
  const cancelInterview = async (iv: Interview) => {
    const ok = await confirm({
      title: t("cancelConfirmTitle"),
      message: t("cancelConfirmMessage", { name: iv.jobSeekerId?.fullName ?? tc("name") }),
      confirmLabel: t("ariaCancel"),
      variant: "destructive",
    });
    if (!ok) return;
    await updateInterviewStatus(iv._id, "cancelled");
  };

  const typeLabel = (type?: string) =>
    type === "offline" ? t("typeInPerson") : type === "video" ? t("typeVideo") : type === "hybrid" ? t("typeHybrid") : "—";

  const handleSave = async (values: Record<string, string>) => {
    if (!editInterview) return;
    const res = await fetch(`/api/interviews/${editInterview._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: INTERVIEW_FIELDS });
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

  // "all" is the employer/job default and is truthy, so this used to be true on
  // every render — the active-filter pill row and Clear button showed on an
  // unfiltered list.
  const hasActiveFilters = Boolean(
    status ||
    (employerFilter && employerFilter !== "all") ||
    (jobFilter && jobFilter !== "all") ||
    typeFilter ||
    outcomeFilter ||
    debouncedSearch ||
    dateFrom ||
    dateTo
  );

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("columnCandidate"), key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { fullName?: string })?.fullName ?? "" },
    { header: t("columnJob"), key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: t("columnEmployer"), key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string })?.companyName ?? "" },
    { header: t("columnType"), key: "type", formatter: (v) => v ? typeLabel(String(v)) : "" },
    { header: t("columnScheduled"), key: "scheduledAt", formatter: (v) => v ? `${formatListDate(String(v), locale)} ${formatTime(String(v), { hour: "2-digit", minute: "2-digit" }, locale)}` : "" },
    { header: t("columnRound"), key: "interviewRound" },
    { header: t("columnStatus"), key: "status", formatter: (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? "") },
    { header: t("columnOutcome"), key: "outcome", formatter: (v) => v ? OUTCOME_OPTIONS.find((o) => o.value === v)?.label ?? String(v) : "" },
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
    <div className="page-container">
      {ConfirmDialogNode}
      <WorkspaceHeader
        title={t("pageTitle")}
        context={`${totalAll} ${t("labelInterviews")}`}
        metrics={[
          { label: t("kpiScheduled"), value: scheduledCount, icon: CalendarCheck2, tone: "primary", active: status === "scheduled", onClick: () => setStatus(status === "scheduled" ? "" : "scheduled") },
          { label: t("kpiCompleted"), value: completedCount, icon: CheckCircle, tone: "success", active: status === "completed", onClick: () => setStatus(status === "completed" ? "" : "completed") },
          { label: t("kpiCancelled"), value: cancelledCount, icon: XCircle, tone: "warning", active: status === "cancelled", onClick: () => setStatus(status === "cancelled" ? "" : "cancelled") },
          { label: t("kpiRescheduled"), value: rescheduledCount, icon: RotateCcw, tone: "info", active: status === "rescheduled", onClick: () => setStatus(status === "rescheduled" ? "" : "rescheduled") },
        ]}
      />

      {/* Filters: the admin row. Search and status in sight, the rest behind
          Filter; the open/close grid with uppercase labels, the "results"
          eyebrow and the pill row restating each filter are gone. */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={hasActiveFilters ? clearAllFilters : undefined}
        clearLabel={t("buttonClearAll")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        moreActiveCount={[employerFilter !== "all", jobFilter !== "all", typeFilter, outcomeFilter, dateFrom, dateTo].filter(Boolean).length}
        more={(
          <>
            <SearchableSelect
              id="agent-interviews-employer"
              className={INLINE_FILTER_CONTROL}
              options={[{ value: "all", label: t("filterAllEmployers") }, ...employers.map((emp) => ({ value: emp._id, label: emp.companyName }))]}
              value={employerFilter}
              onValueChange={(value) => { setEmployerFilter(value); setJobFilter("all"); }}
              placeholder={t("filterEmployer")}
            />
            <SearchableSelect
              id="agent-interviews-job"
              className={INLINE_FILTER_CONTROL}
              options={[{ value: "all", label: t("filterAllJobs") }, ...jobs.map((j) => ({ value: j._id, label: j.title }))]}
              value={jobFilter}
              onValueChange={setJobFilter}
              placeholder={t("filterJob")}
            />
            <SearchableSelect
              id="agent-interviews-type"
              className={INLINE_FILTER_CONTROL}
              options={TYPE_OPTIONS.map((o) => ({ value: o.value || "all", label: o.label }))}
              value={typeFilter || "all"}
              onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}
              placeholder={t("filterType")}
            />
            <SearchableSelect
              id="agent-interviews-outcome"
              className={INLINE_FILTER_CONTROL}
              options={OUTCOME_OPTIONS.map((o) => ({ value: o.value || "all", label: o.label }))}
              value={outcomeFilter || "all"}
              onValueChange={(v) => setOutcomeFilter(v === "all" ? "" : v)}
              placeholder={t("filterOutcome")}
            />
            <div className="min-w-0 flex-[1_1_8rem] sm:max-w-56">
              <DateTimePicker mode="date" value={dateFrom} onChange={setDateFrom} placeholder={t("labelFromDate")} />
            </div>
            <div className="min-w-0 flex-[1_1_8rem] sm:max-w-56">
              <DateTimePicker mode="date" value={dateTo} onChange={setDateTo} placeholder={t("labelToDate")} />
            </div>
          </>
        )}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
        <SearchableSelect
          id="agent-interviews-status"
          className={INLINE_FILTER_CONTROL}
          options={STATUS_OPTIONS.map((o) => ({ value: o.value || "all", label: o.label }))}
          value={status || "all"}
          onValueChange={(v) => setStatus(v === "all" ? "" : v)}
          placeholder={t("filterAllStatuses")}
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {loadError ? (
          <div className="p-6">
            <ErrorState onRetry={() => void fetchInterviews()} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("columnCandidate")}</TableHead>
                <TableHead>{t("columnStatus")}</TableHead>
                <TableHead>{t("columnJob")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columnType")}</TableHead>
                <TableHead>{t("columnScheduled")}</TableHead>
                {canUpdate && <TableHead className="text-right">{tc("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={columnCount} />
              ) : interviews.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columnCount} className="py-12">
                    <EmptyState
                      icon={Inbox}
                      title={hasActiveFilters ? t("emptyStateWithFilters") : t("emptyStateNoResults")}
                      action={hasActiveFilters ? (
                        <Button variant="outline" onClick={clearAllFilters} className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
                          {t("buttonClearFilters")}
                        </Button>
                      ) : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : interviews.map((iv) => {
                const name = iv.jobSeekerId?.fullName ?? tc("name");
                const open = iv.status === "scheduled" || iv.status === "confirmed";
                return (
                  <TableRow key={iv._id} className="group">
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar name={iv.jobSeekerId?.fullName} email={iv.jobSeekerId?.email} className="h-9 w-9 shrink-0" colorful />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{iv.jobSeekerId?.fullName ?? "—"}</p>
                          {iv.jobSeekerId?.email && <p className="truncate text-xs text-muted-foreground">{iv.jobSeekerId.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    {/* Status second: a collapsed phone card shows cells 1–2. */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={iv.status} />
                        {iv.outcome && (
                          <StatusBadge
                            status={OUTCOME_TONE[iv.outcome] ?? iv.outcome}
                            label={OUTCOME_OPTIONS.find((o) => o.value === iv.outcome)?.label}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] text-foreground/80" title={iv.jobId?.title}>
                      <span className="block truncate">{iv.jobId?.title ?? "—"}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{iv.employerId?.companyName ?? "—"}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        {typeIcon(iv.type)}
                        {typeLabel(iv.type)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <p className="text-sm">{formatListDate(iv.scheduledAt, locale)}</p>
                      <p className="text-xs text-muted-foreground/70">
                        {formatTime(iv.scheduledAt, { hour: "2-digit", minute: "2-digit" }, locale)}
                        {iv.duration ? ` · ${t("durationMinutes", { duration: iv.duration })}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground/70">{t("columnRound")}: {iv.interviewRound ?? 1}</p>
                    </TableCell>
                    {canUpdate && (
                      <TableCell className="text-right">
                        <RowActions
                          name={name}
                          quick={[
                            {
                              key: "edit",
                              label: t("ariaEditInterview", { name }),
                              icon: Pencil,
                              iconOnly: true,
                              onSelect: () => { setEditInterview(iv); setModalOpen(true); },
                            },
                          ]}
                          menu={open ? [
                            {
                              key: "complete",
                              label: t("buttonMarkCompleted"),
                              icon: CheckCircle,
                              iconClassName: "text-emerald-600",
                              pending: updatingId === iv._id,
                              onSelect: () => void updateInterviewStatus(iv._id, "completed"),
                            },
                            {
                              key: "cancel",
                              label: t("ariaCancel"),
                              icon: XCircle,
                              destructive: true,
                              pending: updatingId === iv._id,
                              onSelect: () => void cancelInterview(iv),
                            },
                          ] : []}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
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
