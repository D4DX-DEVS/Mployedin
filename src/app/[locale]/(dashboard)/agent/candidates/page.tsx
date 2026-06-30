"use client";

import { useState, useEffect, useCallback } from "react";
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
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { useSearchParams, usePathname } from "next/navigation";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

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
const NEXT_STAGE: Record<string, { value: string; label: string }> = {
  applied: { value: "shortlisted", label: "Shortlist" },
  interview_scheduled: { value: "selected", label: "Mark Selected" },
  offer: { value: "hired", label: "Mark Hired" },
};

const TERMINAL_STATUSES = new Set(["hired", "rejected", "withdrawn"]);
// Statuses from which scheduling an interview is the natural next step.
const SCHEDULABLE_STATUSES = new Set(["applied", "shortlisted", "interview_scheduled"]);

export default function AgentCandidatesPage() {
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

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (statusFilter) params.set("status", statusFilter);
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, jobIdFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 300);
    return () => clearTimeout(t);
  }, [loadApplications]);

  useEffect(() => { pagination.resetPage(); }, [statusFilter, jobIdFilter]);

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
    if (!scheduleForm.scheduledAt) { setScheduleError("Please pick a date and time."); return; }
    const iso = new Date(scheduleForm.scheduledAt).toISOString();
    if (new Date(iso) <= new Date()) { setScheduleError("Interview must be scheduled in the future."); return; }
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
        setScheduleError(data.error || "Could not schedule the interview.");
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
    if (!rejectReason.trim()) { setRejectError("A rejection reason is required."); return; }
    setRejecting(true);
    try {
      const ok = await handleStatusUpdate(rejectApp._id, "rejected", { rejectionReason: rejectReason.trim() });
      if (ok) { setRejectApp(null); setRejectReason(""); }
      else setRejectError("Could not reject the application.");
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
    setOfferError("");
    const amount = Number(offerForm.amount);
    if (!amount || amount <= 0) { setOfferError("Enter a valid salary amount."); return; }
    if (!/^[A-Za-z]{3}$/.test(offerForm.currency)) { setOfferError("Currency must be a 3-letter code (e.g. AED)."); return; }
    if (!offerForm.startDate) { setOfferError("Pick a start date."); return; }
    if (new Date(offerForm.startDate) <= new Date()) { setOfferError("Start date must be in the future."); return; }
    setOffering(true);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: offerApp._id,
          salary: { amount, currency: offerForm.currency.toUpperCase(), period: offerForm.period },
          startDate: new Date(offerForm.startDate).toISOString(),
          expiresAt: offerForm.expiresAt ? new Date(offerForm.expiresAt).toISOString() : undefined,
          benefits: offerForm.benefits.trim() || undefined,
          notes: offerForm.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOfferError(data.error || "Could not send the offer.");
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
  const highMatchCount = applications.filter((app) => (app.aiMatchScore ?? 0) >= 80).length;

  // Derive the filtered job title from the first loaded application
  const filteredJobTitle = jobIdFilter && applications.length > 0
    ? applications[0]?.jobId?.title ?? null
    : null;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Candidate", key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { userId?: { name?: string } })?.userId?.name ?? "" },
    { header: "Job", key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: "Status", key: "status" },
    { header: "AI Match", key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "" },
    { header: "Applied", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-candidates",
    title: "Agent Candidates",
  });

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Candidates Pipeline</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review candidate flow across your managed roles, push strong applicants forward, and keep interview momentum visible in one queue.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} application{pagination.total === 1 ? "" : "s"}</p>
            <p className="text-xs text-muted-foreground">Candidate activity across the jobs currently in your scope.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shortlisted</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{shortlistedCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Candidates moved past the first screen.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Interviews</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{interviewCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Applications already converted into scheduled conversations.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5"><CalendarCheck2 className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">High match</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{highMatchCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Profiles with AI match scores of 80% or higher.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5"><Star className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Job filter</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{jobIdFilter ? 1 : 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Whether this queue is narrowed to a single job.</p>
              </div>
              <div className="workspace-tone-indigo rounded-2xl p-2.5"><BriefcaseBusiness className="h-5 w-5" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter candidates</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Focus on the stage that needs action</h2>
          <p className="mt-1 text-sm text-muted-foreground">Switch between application states or clear the active job constraint when you want the full queue again.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {jobIdFilter && (
            <Button variant="outline" size="sm" onClick={() => setJobIdFilter("")} className="workspace-tone-sky h-10 rounded-xl border-transparent px-4 hover:opacity-90">
              {filteredJobTitle ? `✕ ${filteredJobTitle}` : "Clear job filter"}
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
                {status || "All"}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Manage each candidate before the next handoff</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {pagination.total} application{pagination.total === 1 ? "" : "s"} across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}
          </div>
        </div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job Applied To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Match</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
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
                <p className="text-sm font-medium text-foreground">No candidates found</p>
                <p className="text-sm text-muted-foreground">Try another stage filter or clear the current job scope.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job Applied To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Match</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{app.jobId?.title ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={app.status} /></TableCell>
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
                            {NEXT_STAGE[app.status] && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 rounded-lg px-2.5 text-xs"
                                title={NEXT_STAGE[app.status].label}
                                onClick={() => handleStatusUpdate(app._id, NEXT_STAGE[app.status].value)}
                              >
                                {app.status === "applied" ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {NEXT_STAGE[app.status].label}
                              </Button>
                            )}
                            {SCHEDULABLE_STATUSES.has(app.status) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg p-0 text-sky-600 hover:bg-sky-50"
                                title="Schedule interview"
                                aria-label="Schedule interview"
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
                                title="Make offer"
                                onClick={() => openOffer(app)}
                              >
                                <Gift className="h-3.5 w-3.5" />
                                Make Offer
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg p-0 text-destructive hover:bg-destructive/10"
                              title="Reject candidate"
                              aria-label="Reject candidate"
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
            <DialogTitle>Schedule interview</DialogTitle>
            <DialogDescription>
              {scheduleApp?.jobSeekerId?.userId?.name ?? "Candidate"} · {scheduleApp?.jobId?.title ?? "Role"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {scheduleError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{scheduleError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="iv-when">Date &amp; time</Label>
              <Input
                id="iv-when"
                type="datetime-local"
                value={scheduleForm.scheduledAt}
                onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="iv-type">Type</Label>
                <select
                  id="iv-type"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={scheduleForm.type}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="video">Video</option>
                  <option value="offline">In-Person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="iv-dur">Duration (min)</Label>
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
              <Label htmlFor="iv-loc">{scheduleForm.type === "video" ? "Meeting link" : "Location"}</Label>
              {scheduleForm.type === "video" ? (
                <Input
                  id="iv-loc"
                  placeholder="https://meet.google.com/… (auto-generated if blank)"
                  value={scheduleForm.meetLink}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, meetLink: e.target.value }))}
                />
              ) : (
                <Input
                  id="iv-loc"
                  placeholder="Office address / room"
                  value={scheduleForm.location}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, location: e.target.value }))}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleApp(null)} disabled={scheduling}>Cancel</Button>
            <Button onClick={submitSchedule} disabled={scheduling}>
              {scheduling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectApp} onOpenChange={(o) => { if (!o) setRejectApp(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject candidate</DialogTitle>
            <DialogDescription>
              {rejectApp?.jobSeekerId?.userId?.name ?? "Candidate"} · {rejectApp?.jobId?.title ?? "Role"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {rejectError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{rejectError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="rej-reason">Reason</Label>
              <Textarea
                id="rej-reason"
                placeholder="Why is this candidate not moving forward?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectApp(null)} disabled={rejecting}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject} disabled={rejecting}>
              {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make offer dialog */}
      <Dialog open={!!offerApp} onOpenChange={(o) => { if (!o) setOfferApp(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make an offer</DialogTitle>
            <DialogDescription>
              {offerApp?.jobSeekerId?.userId?.name ?? "Candidate"} · {offerApp?.jobId?.title ?? "Role"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {offerError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{offerError}</p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="of-amount">Salary amount</Label>
                <Input
                  id="of-amount"
                  type="number"
                  min={1}
                  placeholder="e.g. 12000"
                  value={offerForm.amount}
                  onChange={(e) => setOfferForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="of-currency">Currency</Label>
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
                <Label htmlFor="of-period">Pay period</Label>
                <select
                  id="of-period"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={offerForm.period}
                  onChange={(e) => setOfferForm((f) => ({ ...f, period: e.target.value }))}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="of-start">Start date</Label>
                <Input
                  id="of-start"
                  type="date"
                  value={offerForm.startDate}
                  onChange={(e) => setOfferForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="of-expires">Offer expires</Label>
              <Input
                id="of-expires"
                type="date"
                value={offerForm.expiresAt}
                onChange={(e) => setOfferForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="of-benefits">Benefits (optional)</Label>
              <Textarea
                id="of-benefits"
                placeholder="Health insurance, annual flights, bonus…"
                value={offerForm.benefits}
                onChange={(e) => setOfferForm((f) => ({ ...f, benefits: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="of-notes">Notes (optional)</Label>
              <Textarea
                id="of-notes"
                placeholder="Anything else the candidate should know."
                value={offerForm.notes}
                onChange={(e) => setOfferForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferApp(null)} disabled={offering}>Cancel</Button>
            <Button onClick={submitOffer} disabled={offering}>
              {offering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              Send offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
