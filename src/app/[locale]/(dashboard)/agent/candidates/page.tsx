"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Gift,
  Inbox,
  Loader2,
  Star,
  X,
} from "lucide-react";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePathname } from "next/navigation";
import { useTableExport } from "@/hooks/useTableExport";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate } from "@/lib/ui/intlFormat";

interface ApplicationItem {
  _id: string;
  status: string;
  aiMatchScore?: number;
  appliedAt?: string;
  createdAt: string;
  jobId?: {
    _id: string;
    title: string;
    location?: { city?: string; country?: string };
  };
  jobSeekerId?: {
    _id: string;
    userId?: { name?: string };
    skills?: string[];
    totalExperienceYears?: number;
  };
  otherApplicationsCount?: number;
}

const STATUS_OPTIONS = [
  "", "applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected",
];

// Contextual "advance to next stage" action for an agent, keyed by current status.
// Note: moving a "selected" candidate to "offer" is handled by the Make Offer
// dialog (which creates a real Offer record), not a plain status change.
const NEXT_STAGE_KEYS: Record<string, string> = {
  applied: "shortlisted",
  interview_scheduled: "selected",
  offer: "hired",
};

const TERMINAL_STATUSES = new Set(["hired", "rejected", "withdrawn"]);
// Statuses from which scheduling an interview is the natural next step.
const SCHEDULABLE_STATUSES = new Set(["applied", "shortlisted", "interview_scheduled"]);

export default function AgentCandidatesPage() {
  const t = useTranslations("agentCandidates");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const pagination = usePagination();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // This page already read jobId and status from the URL on mount but then
  // stopped writing them back, and search was never in the URL at all — so
  // ⌘K's "candidates" hit had nowhere to send a name. All three round-trip now.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "");
  const [jobIdFilter, setJobIdFilter] = useUrlFilter("jobId", "");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // BUG-07: rapid filter changes let a stale response overwrite the table.
  // Only the latest request may update state (same pattern as leads page).
  const listRequestRef = useRef(0);

  const loadApplications = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError(false);
    try {
      const params = pagination.paginationParams();
      if (statusFilter) params.set("status", statusFilter);
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/applications?${params}`);
      if (requestId !== listRequestRef.current) return;
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json();
      if (requestId !== listRequestRef.current) return;
      setApplications(data.applications ?? []);
      pagination.updateTotal(data.pagination?.total ?? 0);
    } catch {
      if (requestId !== listRequestRef.current) return;
      setError(true);
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, [statusFilter, jobIdFilter, search, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 300);
    return () => clearTimeout(t);
  }, [loadApplications]);

  useEffect(() => { pagination.resetPage(); }, [statusFilter, jobIdFilter, search]);

  // Scheduling dialog state
  const [scheduleApp, setScheduleApp] = useState<ApplicationItem | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ scheduledAt: "", type: "video", duration: "45", location: "", meetLink: "" });
  const [scheduleError, setScheduleError] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Reject dialog state
  const [rejectApp, setRejectApp] = useState<ApplicationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Make-offer dialog state
  const [offerApp, setOfferApp] = useState<ApplicationItem | null>(null);
  const [offerForm, setOfferForm] = useState({
    amount: "",
    currency: "AED",
    period: "monthly",
    startDate: "",
    expiresAt: "",
    benefits: "",
    notes: "",
  });
  const [offerError, setOfferError] = useState("");
  const [offering, setOffering] = useState(false);

  const handleStatusUpdate = async (appId: string, newStatus: string, extra?: Record<string, unknown>) => {
    setUpdatingId(appId);
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extra }),
      });
      if (res.ok) await loadApplications();
      return res.ok;
    } finally {
      setUpdatingId(null);
    }
  };

  /*
   * The dialogs render their own error line, but the inline stage button has
   * nowhere to put one — and the API refuses this move more often than it
   * looks: moving a candidate who still has an open interview comes back 409.
   * Without this the row simply did not change and said nothing about why.
   */
  const advanceStage = async (appId: string, newStatus: string) => {
    const ok = await handleStatusUpdate(appId, newStatus);
    if (!ok) toast.error(t("advanceErrorGeneric"));
  };

  const openSchedule = (app: ApplicationItem) => {
    setScheduleError("");
    // Default to tomorrow at 10:00 in the user's local timezone.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setScheduleForm({ scheduledAt: local, type: "video", duration: "45", location: "", meetLink: "" });
    setScheduleApp(app);
  };

  const submitSchedule = async () => {
    if (!scheduleApp) return;
    setScheduleError("");
    if (!scheduleForm.scheduledAt) { setScheduleError(t("scheduleErrorDateRequired")); return; }
    const iso = new Date(scheduleForm.scheduledAt).toISOString();
    if (new Date(iso) <= new Date()) { setScheduleError(t("scheduleErrorDateInFuture")); return; }
    setScheduling(true);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: scheduleApp._id,
          scheduledAt: iso,
          type: scheduleForm.type,
          duration: Number(scheduleForm.duration) || 45,
          location: scheduleForm.location || undefined,
          meetLink: scheduleForm.meetLink || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setScheduleError(data.error || t("scheduleErrorGeneric"));
        return;
      }
      setScheduleApp(null);
      await loadApplications();
    } finally {
      setScheduling(false);
    }
  };

  const submitReject = async () => {
    if (!rejectApp) return;
    setRejectError("");
    if (!rejectReason.trim()) { setRejectError(t("rejectErrorReasonRequired")); return; }
    setRejecting(true);
    try {
      const ok = await handleStatusUpdate(rejectApp._id, "rejected", { rejectionReason: rejectReason.trim() });
      if (ok) { setRejectApp(null); setRejectReason(""); }
      else setRejectError(t("rejectErrorGeneric"));
    } finally {
      setRejecting(false);
    }
  };

  const openOffer = (app: ApplicationItem) => {
    setOfferError("");
    // Default start date two weeks out, expiry one week out (both local date inputs).
    const start = new Date(); start.setDate(start.getDate() + 14);
    const expires = new Date(); expires.setDate(expires.getDate() + 7);
    const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
    setOfferForm({
      amount: "",
      currency: "AED",
      period: "monthly",
      startDate: toDateInput(start),
      expiresAt: toDateInput(expires),
      benefits: "",
      notes: "",
    });
    setOfferApp(app);
  };

  const submitOffer = async () => {
    if (!offerApp) return;
    // Capture before any await — the dialog can close (offerApp -> null) mid-request.
    const app = offerApp;
    setOfferError("");
    const amount = Number(offerForm.amount);
    if (!amount || amount <= 0) { setOfferError(t("offerErrorAmountInvalid")); return; }
    if (!/^[A-Za-z]{3}$/.test(offerForm.currency)) { setOfferError(t("offerErrorCurrencyInvalid")); return; }
    if (!offerForm.startDate) { setOfferError(t("offerErrorStartDateRequired")); return; }
    if (new Date(offerForm.startDate) <= new Date()) { setOfferError(t("offerErrorStartDateInFuture")); return; }
    setOffering(true);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app._id,
          salary: { amount, currency: offerForm.currency.toUpperCase(), period: offerForm.period },
          startDate: new Date(offerForm.startDate).toISOString(),
          expiresAt: offerForm.expiresAt ? new Date(offerForm.expiresAt).toISOString() : undefined,
          benefits: offerForm.benefits.trim() || undefined,
          notes: offerForm.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOfferError(data.error || t("offerErrorGeneric"));
        return;
      }
      setOfferApp(null);
      await loadApplications();
    } finally {
      setOffering(false);
    }
  };

  const matchScoreColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-[hsl(var(--status-selected))]";
    if (score >= 60) return "text-[hsl(var(--status-shortlisted))]";
    return "text-[hsl(var(--status-rejected))]";
  };

  // Derive the filtered job title from the first loaded application
  const filteredJobTitle = jobIdFilter && applications.length > 0
    ? applications[0]?.jobId?.title ?? null
    : null;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderCandidate"), key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { userId?: { name?: string } })?.userId?.name ?? "" },
    { header: t("tableHeaderJob"), key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: tc("status"), key: "status" },
    { header: t("tableHeaderAIMatch"), key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "" },
    { header: t("tableHeaderApplied"), key: "createdAt", formatter: (v) => v ? formatListDate(String(v)) : "" },
  ];

  // BUG-06: export the full filtered result set, not just the visible page.
  const fetchAllApplications = useCallback(async () => {
    const base = new URLSearchParams();
    if (statusFilter) base.set("status", statusFilter);
    if (jobIdFilter) base.set("jobId", jobIdFilter);
    if (search.trim()) base.set("search", search.trim());
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/applications?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.applications ?? []) as Record<string, unknown>[]),
        total: Number((json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [statusFilter, jobIdFilter, search]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-candidates",
    title: t("candidatesPipeline"),
    fetchAll: fetchAllApplications,
  });

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("candidatesPipeline")}
        context={`${pagination.total} ${t("application", { count: pagination.total })}`}
      />

      {/* Status was a row of pills inside the list panel; it is a select in the
          filter row like every other list, and the job narrowing a chip there. */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search || statusFilter || jobIdFilter ? () => { setSearch(""); setStatusFilter(""); setJobIdFilter(""); pagination.resetPage(); } : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch value={search} onChange={(v) => { setSearch(v); pagination.resetPage(); }} placeholder={t("searchPlaceholder")} />
        <SearchableSelect
          id="agent-candidates-status"
          className={INLINE_FILTER_CONTROL}
          options={STATUS_OPTIONS.map((status) => ({ value: status || "all", label: status ? t(`status_${status}`) : t("filterAllStatuses") }))}
          value={statusFilter || "all"}
          onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); pagination.resetPage(); }}
          placeholder={tc("status")}
        />
        {jobIdFilter && (
          <Button variant="outline" size="sm" onClick={() => setJobIdFilter("")} className="workspace-tone-sky h-11 max-w-56 rounded-lg border-transparent px-3 hover:opacity-90 sm:h-9">
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{filteredJobTitle ?? t("clearJobFilter")}</span>
          </Button>
        )}
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {error ? (
          <div className="p-6">
            <ErrorState onRetry={loadApplications} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeaderCandidate")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>{t("tableHeaderJob")}</TableHead>
                <TableHead>{t("tableHeaderAIMatch")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("tableHeaderApplied")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={6} />
              ) : applications.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState title={t("noCandidatesFound")} description={t("noCandidatesHint")} icon={Inbox} />
                  </TableCell>
                </TableRow>
              ) : applications.map((app) => {
                const name = app.jobSeekerId?.userId?.name ?? tc("unknownCandidate");
                const busy = updatingId === app._id;
                const nextStage = NEXT_STAGE_KEYS[app.status];
                const quick: RowAction[] = [];
                const menu: RowAction[] = [];
                if (!TERMINAL_STATUSES.has(app.status)) {
                  // The obvious next step stays a labelled button; the rest,
                  // and Reject (its own dialog asks for a reason), go in "…".
                  if (nextStage) {
                    quick.push({
                      key: "advance",
                      label: t(`actionLabel_${app.status}`),
                      icon: app.status === "applied" ? Check : ChevronRight,
                      pending: busy,
                      onSelect: () => advanceStage(app._id, nextStage),
                    });
                  } else if (app.status === "selected") {
                    quick.push({ key: "offer", label: t("makeOfferLabel"), icon: Gift, iconClassName: "text-emerald-700", onSelect: () => openOffer(app) });
                  }
                  if (SCHEDULABLE_STATUSES.has(app.status)) {
                    menu.push({ key: "schedule", label: t("scheduleInterviewTooltip"), icon: CalendarPlus, onSelect: () => openSchedule(app) });
                  }
                  menu.push({
                    key: "reject",
                    label: t("rejectCandidateTooltip"),
                    icon: X,
                    destructive: true,
                    disabled: busy,
                    onSelect: () => { setRejectError(""); setRejectReason(""); setRejectApp(app); },
                  });
                }
                return (
                  <TableRow key={app._id} className="group">
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar name={app.jobSeekerId?.userId?.name} className="h-9 w-9 shrink-0" colorful />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
                          {app.jobSeekerId?.totalExperienceYears != null && (
                            <p className="whitespace-nowrap text-xs text-muted-foreground">{t("yearsExperience", { years: app.jobSeekerId.totalExperienceYears })}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {/* Status second: a collapsed phone card shows cells 1–2. */}
                    <TableCell><StatusBadge status={app.status} /></TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={app.jobId?.title}>{app.jobId?.title ?? "—"}</TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-sm font-medium ${matchScoreColor(app.aiMatchScore)}`}>
                        <Star className="h-3.5 w-3.5" aria-hidden="true" />
                        {app.aiMatchScore != null ? `${app.aiMatchScore}%` : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatListDate(app.appliedAt ?? app.createdAt, locale)}</TableCell>
                    <TableCell className="text-right">
                      {quick.length + menu.length > 0 ? (
                        <RowActions name={name} quick={quick} menu={menu} />
                      ) : null}
                    </TableCell>
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

      {/* Schedule interview dialog */}
      <Dialog open={!!scheduleApp} onOpenChange={(o) => { if (!o) setScheduleApp(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("scheduleInterviewTitle")}</DialogTitle>
            <DialogDescription>
              {scheduleApp?.jobSeekerId?.userId?.name ?? t("candidateLabel")} · {scheduleApp?.jobId?.title ?? t("roleLabel")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {scheduleError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">{scheduleError}</p>
            )}
            <div className="field">
              <Label htmlFor="iv-when">{t("dateTimeLabel")}</Label>
              <Input
                id="iv-when"
                type="datetime-local"
                value={scheduleForm.scheduledAt}
                onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <Label htmlFor="iv-type">{t("interviewTypeLabel")}</Label>
                <Select value={scheduleForm.type} onValueChange={(value) => setScheduleForm((f) => ({ ...f, type: value }))}>
                  <SelectTrigger id="iv-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">{t("interviewType_video")}</SelectItem>
                    <SelectItem value="offline">{t("interviewType_offline")}</SelectItem>
                    <SelectItem value="hybrid">{t("interviewType_hybrid")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field">
                <Label htmlFor="iv-dur">{t("durationLabel")}</Label>
                <Input
                  id="iv-dur"
                  type="number"
                  min={15}
                  max={480}
                  value={scheduleForm.duration}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, duration: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="iv-loc">{scheduleForm.type === "video" ? t("meetingLinkLabel") : t("locationLabel")}</Label>
              {scheduleForm.type === "video" ? (
                <Input
                  id="iv-loc"
                  placeholder={t("meetLinkPlaceholder")}
                  value={scheduleForm.meetLink}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, meetLink: e.target.value }))}
                />
              ) : (
                <Input
                  id="iv-loc"
                  placeholder={t("locationPlaceholder")}
                  value={scheduleForm.location}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, location: e.target.value }))}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleApp(null)} disabled={scheduling}>{tc("cancel")}</Button>
            <Button onClick={submitSchedule} disabled={scheduling}>
              {scheduling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
              {t("scheduleButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectApp} onOpenChange={(o) => { if (!o) setRejectApp(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rejectCandidateTitle")}</DialogTitle>
            <DialogDescription>
              {rejectApp?.jobSeekerId?.userId?.name ?? t("candidateLabel")} · {rejectApp?.jobId?.title ?? t("roleLabel")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {rejectError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">{rejectError}</p>
            )}
            <div className="field">
              <Label htmlFor="rej-reason">{t("reasonLabel")}</Label>
              <Textarea
                id="rej-reason"
                placeholder={t("reasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectApp(null)} disabled={rejecting}>{tc("cancel")}</Button>
            <Button variant="destructive" onClick={submitReject} disabled={rejecting}>
              {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              {t("rejectButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make offer dialog */}
      <Dialog open={!!offerApp} onOpenChange={(o) => { if (!o) setOfferApp(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("makeOfferTitle")}</DialogTitle>
            <DialogDescription>
              {offerApp?.jobSeekerId?.userId?.name ?? t("candidateLabel")} · {offerApp?.jobId?.title ?? t("roleLabel")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {offerError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">{offerError}</p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 field">
                <Label htmlFor="of-amount">{t("salaryAmountLabel")}</Label>
                <Input
                  id="of-amount"
                  type="number"
                  min={1}
                  placeholder={t("salaryPlaceholder")}
                  value={offerForm.amount}
                  onChange={(e) => setOfferForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="field">
                <Label htmlFor="of-currency">{t("currencyLabel")}</Label>
                <Input
                  id="of-currency"
                  maxLength={3}
                  value={offerForm.currency}
                  onChange={(e) => setOfferForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <Label htmlFor="of-period">{t("payPeriodLabel")}</Label>
                <Select value={offerForm.period} onValueChange={(value) => setOfferForm((f) => ({ ...f, period: value }))}>
                  <SelectTrigger id="of-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("payPeriod_monthly")}</SelectItem>
                    <SelectItem value="annually">{t("payPeriod_annually")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="of-start">{t("startDateLabel")}</Label>
                <DateTimePicker
                  mode="date"
                  value={offerForm.startDate}
                  onChange={(value) => setOfferForm((f) => ({ ...f, startDate: value }))}
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="of-expires">{t("offerExpiresLabel")}</Label>
              <DateTimePicker
                mode="date"
                value={offerForm.expiresAt}
                onChange={(value) => setOfferForm((f) => ({ ...f, expiresAt: value }))}
              />
            </div>
            <div className="field">
              <Label htmlFor="of-benefits">{t("benefitsLabel")}</Label>
              <Textarea
                id="of-benefits"
                placeholder={t("benefitsPlaceholder")}
                value={offerForm.benefits}
                onChange={(e) => setOfferForm((f) => ({ ...f, benefits: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="field">
              <Label htmlFor="of-notes">{t("notesLabel")}</Label>
              <Textarea
                id="of-notes"
                placeholder={t("notesPlaceholder")}
                value={offerForm.notes}
                onChange={(e) => setOfferForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferApp(null)} disabled={offering}>{tc("cancel")}</Button>
            <Button onClick={submitOffer} disabled={offering}>
              {offering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              {t("sendOfferButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
