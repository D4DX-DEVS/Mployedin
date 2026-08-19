"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AI_MATCH_HIGH_THRESHOLD } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarPlus,
  Check,
  ChevronRight,
  Gift,
  Inbox,
  Loader2,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import { useSearchParams, usePathname } from "next/navigation";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobId") ?? "";
  const initialStatus = searchParams.get("status") ?? "";

  const pagination = usePagination();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [jobIdFilter, setJobIdFilter] = useState(initialJobId);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (statusFilter) params.set("status", statusFilter);
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobIdFilter, debouncedSearch, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 300);
    return () => clearTimeout(t);
  }, [loadApplications]);

  useEffect(() => { pagination.resetPage(); }, [statusFilter, jobIdFilter, debouncedSearch]);

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

  const shortlistedCount = applications.filter((app) => ["shortlisted", "interview_scheduled", "selected", "offer", "hired"].includes(app.status)).length;
  const interviewCount = applications.filter((app) => app.status === "interview_scheduled").length;
  const highMatchCount = applications.filter((app) => (app.aiMatchScore ?? 0) >= AI_MATCH_HIGH_THRESHOLD).length;

  // Derive the filtered job title from the first loaded application
  const filteredJobTitle = jobIdFilter && applications.length > 0
    ? applications[0]?.jobId?.title ?? null
    : null;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderCandidate"), key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { userId?: { name?: string } })?.userId?.name ?? "" },
    { header: t("tableHeaderJob"), key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: tc("status"), key: "status" },
    { header: t("tableHeaderAIMatch"), key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "" },
    { header: t("tableHeaderApplied"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-candidates",
    title: t("candidatesPipeline"),
  });

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={Users}
        eyebrow={t("agentWorkspace")}
        title={t("candidatesPipeline")}
        description={t("pipelineDescription")}
        summary={{ label: t("pipeline"), value: `${pagination.total} ${t("application", { count: pagination.total })}`, note: t("pipelineSubtext") }}
        metrics={[
          { label: t("shortlistedLabel"), value: shortlistedCount, note: t("shortlistedDesc"), icon: Users },
          { label: t("interviewsLabel"), value: interviewCount, note: t("interviewsDesc"), icon: CalendarCheck2 },
          { label: t("highMatchLabel"), value: highMatchCount, note: t("highMatchDesc"), icon: Star },
          { label: t("jobFilterLabel"), value: jobIdFilter ? 1 : 0, note: t("jobFilterDesc"), icon: BriefcaseBusiness },
        ]}
      />

      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterCandidatesLabel")}</p>
          <h2 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("filterCandidatesTitle")}</h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{t("filterCandidatesDesc")}</p>
        </div>
        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-border bg-background/70 pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {jobIdFilter && (
            <Button variant="outline" size="sm" onClick={() => setJobIdFilter("")} className="workspace-tone-sky h-10 rounded-xl border-transparent px-4 hover:opacity-90">
              {filteredJobTitle ? `✕ ${filteredJobTitle}` : t("clearJobFilter")}
            </Button>
          )}
          {STATUS_OPTIONS.map((status) => {
            const isSelected = statusFilter === status;

            return (
              <Button
                key={status || "all"}
                onClick={() => setStatusFilter(status)}
                aria-pressed={isSelected}
                variant="outline"
                size="sm"
                className={isSelected
                  ? "workspace-tone-sky h-10 rounded-xl border-transparent px-4 capitalize hover:opacity-90"
                  : "workspace-muted-pill h-10 rounded-xl px-4 capitalize hover:bg-card"
                }
              >
                {status ? t(`status_${status}`) : tc("all")}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currentResultsLabel")}</p>
            <h2 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("currentResultsTitle")}</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {t("paginationSummary", { applications: pagination.total, pages: pagination.totalPages })}
          </div>
        </div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-3 sm:mt-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                  <TableHead>{t("tableHeaderCandidate")}</TableHead>
                  <TableHead>{t("tableHeaderJob")}</TableHead>
                  <TableHead>{t("tableHeaderAIMatch")}</TableHead>
                  <TableHead>{t("tableHeaderApplied")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : applications.length === 0 ? (
            <div className="workspace-empty-state m-4 rounded-[20px] py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t("noCandidatesFound")}</p>
                <p className="text-sm text-muted-foreground">{t("noCandidatesHint")}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                  <TableHead>{t("tableHeaderCandidate")}</TableHead>
                  <TableHead>{t("tableHeaderJob")}</TableHead>
                  <TableHead>{t("tableHeaderAIMatch")}</TableHead>
                  <TableHead>{t("tableHeaderApplied")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app._id} className="hover:bg-secondary/50">
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{app.jobSeekerId?.userId?.name ?? "Unknown"}</p>
                        {app.jobSeekerId?.totalExperienceYears != null && (
                          <p className="text-xs text-muted-foreground">{app.jobSeekerId.totalExperienceYears}y exp</p>
                        )}
                        <StatusBadge status={app.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{app.jobId?.title ?? "—"}</TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-sm font-medium ${matchScoreColor(app.aiMatchScore)}`}>
                        <Star className="h-3.5 w-3.5" />
                        {app.aiMatchScore != null ? `${app.aiMatchScore}%` : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {updatingId === app._id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : TERMINAL_STATUSES.has(app.status) ? (
                          <span className="text-xs capitalize text-muted-foreground">{app.status}</span>
                        ) : (
                          <>
                            {NEXT_STAGE_KEYS[app.status] && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 rounded-lg px-2.5 text-xs"
                                title={t(`actionLabel_${app.status}`)}
                                onClick={() => handleStatusUpdate(app._id, NEXT_STAGE_KEYS[app.status])}
                              >
                                {app.status === "applied" ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {t(`actionLabel_${app.status}`)}
                              </Button>
                            )}
                            {SCHEDULABLE_STATUSES.has(app.status) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg p-0 text-status-applied hover:bg-status-applied-bg"
                                title={t("scheduleInterviewTooltip")}
                                aria-label={t("scheduleInterviewTooltip")}
                                onClick={() => openSchedule(app)}
                              >
                                <CalendarPlus className="h-4 w-4" />
                              </Button>
                            )}
                            {app.status === "selected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 rounded-lg px-2.5 text-xs text-emerald-700"
                                title={t("makeOfferTooltip")}
                                onClick={() => openOffer(app)}
                              >
                                <Gift className="h-3.5 w-3.5" />
                                {t("makeOfferLabel")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg p-0 text-destructive hover:bg-destructive/10"
                              title={t("rejectCandidateTooltip")}
                              aria-label={t("rejectCandidateTooltip")}
                              onClick={() => { setRejectError(""); setRejectReason(""); setRejectApp(app); }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{scheduleError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="iv-when">{t("dateTimeLabel")}</Label>
              <Input
                id="iv-when"
                type="datetime-local"
                value={scheduleForm.scheduledAt}
                onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
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
              <div className="space-y-2">
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
            <div className="space-y-2">
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
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{rejectError}</p>
            )}
            <div className="space-y-2">
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
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{offerError}</p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="of-expires">{t("offerExpiresLabel")}</Label>
              <DateTimePicker
                mode="date"
                value={offerForm.expiresAt}
                onChange={(value) => setOfferForm((f) => ({ ...f, expiresAt: value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="of-benefits">{t("benefitsLabel")}</Label>
              <Textarea
                id="of-benefits"
                placeholder={t("benefitsPlaceholder")}
                value={offerForm.benefits}
                onChange={(e) => setOfferForm((f) => ({ ...f, benefits: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
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
