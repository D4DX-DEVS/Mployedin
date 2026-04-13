"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useParams } from "next/navigation";
import { User, Calendar, Inbox, CheckSquare, Square, X, ChevronDown, GripVertical, Award, DollarSign, Filter, Clock, History, BarChart3, Users, FileText, Sparkles, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import {
  useApplications,
  useUpdateApplicationStatus,
  useBulkAction,
  useApplicationTimeline,
  useCreateScorecard,
  useCreateInterviewFromApp,
  useCreateOfferFromApp,
  useFetchInterviewForApp,
  useComputeAiMatch,
  useBulkAiMatch,
} from "@/hooks/useApplications";
import { usePermissions } from "@/hooks/usePermissions";
import { useScorecardsByApplicationIds } from "@/hooks/useScorecards";
import type { Scorecard } from "@/hooks/useScorecards";
import { ScorecardForm } from "@/components/scorecards/ScorecardForm";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";

interface Applicant {
  _id: string;
  jobId: { _id: string; title: string };
  jobSeekerId: {
    _id?: string;
    userId?: { _id?: string; name?: string } | string;
    skills?: string[];
    currentLocation?: string;
    totalExperienceYears?: number;
    experience?: { jobTitle?: string; company?: string; isCurrent?: boolean }[];
    cv?: { originalUrl?: string };
  };
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  coverLetter?: string;
  matchBreakdown?: { skills: number; experience: number; overall: number };
  matchStrengths?: string[];
  matchGaps?: string[];
  otherApplicationsCount?: number;
}

interface TimelineEntry {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  createdAt: string;
}

const PIPELINE_STAGES = [
  { value: "applied", label: "Applied", color: "border-blue-400" },
  { value: "shortlisted", label: "Shortlisted", color: "border-amber-400" },
  { value: "interview_scheduled", label: "Interview", color: "border-purple-400" },
  { value: "offer", label: "Offer", color: "border-cyan-400" },
  { value: "selected", label: "Selected", color: "border-emerald-400" },
  { value: "rejected", label: "Rejected", color: "border-red-400" },
];

export default function EmployerApplicationsPage() {
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const jobId = searchParams.get("jobId") ?? searchParams.get("job") ?? "";
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"kanban" | "table">("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [scorecardModal, setScorecardModal] = useState<{ applicationId: string; interviewId: string } | null>(null);
  const [interviewModal, setInterviewModal] = useState<{ appId: string; jobId: string; jobSeekerId: string } | null>(null);
  const [offerModal, setOfferModal] = useState<{ appId: string } | null>(null);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [timelinePanel, setTimelinePanel] = useState<{ appId: string; candidateLabel: string } | null>(null);
  const [viewingCv, setViewingCv] = useState<{
    url: string; name: string;
    applicationId?: string; status?: string;
    candidate?: { role?: string; experience?: number; skills?: string[]; location?: string };
    aiMatchScore?: number;
    matchBreakdown?: { skills?: number; experience?: number; location?: number; overall?: number };
  } | null>(null);
  // Bulk AI match progress state
  const [bulkMatchProgress, setBulkMatchProgress] = useState<{ done: number; total: number } | null>(null);

  // ── React Query hooks ─────────────────────────────────────────────
  const applicationsQuery = useApplications({
    page, limit,
    status: statusFilter !== "all" ? statusFilter : undefined,
    jobId: jobId || undefined,
  });
  const updateStatus = useUpdateApplicationStatus();
  const bulkAction = useBulkAction();
  const createScorecard = useCreateScorecard();
  const createInterview = useCreateInterviewFromApp();
  const createOffer = useCreateOfferFromApp();
  const fetchInterviewForApp = useFetchInterviewForApp();
  const timelineQuery = useApplicationTimeline(timelinePanel?.appId ?? null);
  const computeAiMatch = useComputeAiMatch();
  const bulkAiMatch = useBulkAiMatch();

  // ── Derived values ────────────────────────────────────────────────
  const applications = (applicationsQuery.data?.applications ?? []) as Applicant[];
  const total = applicationsQuery.data?.pagination?.total ?? applications.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isLoading = applicationsQuery.isLoading;
  const timelineData: TimelineEntry[] = timelineQuery.data?.timeline ?? [];
  const timelineLoading = timelineQuery.isLoading;

  // Fetch scorecards for all visible applications in one batched request
  const applicationIds = applications.map((a) => a._id);
  const scorecardsQuery = useScorecardsByApplicationIds(applicationIds);
  const scorecardMap: Record<string, Scorecard> = scorecardsQuery.data ?? {};

  useEffect(() => {
    document.title = "Applications · MPLOYEDIN";
  }, []);

  useEffect(() => { setPage(1); setSelected([]); }, [statusFilter]);

  function updateApplicationStatus(id: string, status: string, reason?: string) {
    return updateStatus.mutateAsync({ id, status, rejectionReason: reason });
  }

  async function handleGenerateAiMatch(app: Applicant) {
    const jobId = app.jobId._id;
    const jobSeekerId = typeof app.jobSeekerId?.userId === "object"
      ? (app.jobSeekerId.userId?._id ?? "")
      : (app.jobSeekerId?.userId ?? "");
    if (!jobId || !jobSeekerId) return;
    try {
      await computeAiMatch.mutateAsync({ applicationId: app._id, jobId, jobSeekerId });
    } catch (err) {
      console.error("Failed to compute AI match:", err);
    }
  }

  /** Run AI match for all applications that don't have a score yet */
  async function handleBulkAiMatch() {
    const unscored = applications.filter((app) => app.aiMatchScore == null);
    if (!unscored.length) return;
    const items = unscored
      .map((app) => {
        const jobId = app.jobId._id;
        const jobSeekerId = typeof app.jobSeekerId?.userId === "object"
          ? (app.jobSeekerId.userId?._id ?? "")
          : (app.jobSeekerId?.userId ?? "");
        if (!jobId || !jobSeekerId) return null;
        return { applicationId: app._id, jobId, jobSeekerId };
      })
      .filter(Boolean) as { applicationId: string; jobId: string; jobSeekerId: string }[];

    if (!items.length) return;
    setBulkMatchProgress({ done: 0, total: items.length });
    try {
      await bulkAiMatch.mutateAsync({
        applications: items,
        onProgress: (done, total) => setBulkMatchProgress({ done, total }),
      });
    } finally {
      setBulkMatchProgress(null);
    }
  }

  /** Auto-shortlist top candidates: shortlist those with score >= 70%, or top 5 if none qualify */
  async function handleAutoShortlist() {
    const scored = [...filteredApplications]
      .filter((app) => app.aiMatchScore != null && app.status === "applied")
      .sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0));
    if (!scored.length) return;

    const threshold = 70;
    let toShortlist = scored.filter((app) => (app.aiMatchScore ?? 0) >= threshold);
    // Fall back to top 5 if none exceed threshold
    if (!toShortlist.length) toShortlist = scored.slice(0, 5);

    try {
      await bulkAction.mutateAsync({
        applicationIds: toShortlist.map((a) => a._id),
        action: "move_stage",
        params: { targetStage: "shortlisted" },
      });
    } catch (err) {
      console.error("Auto shortlist failed:", err);
    }
  }

  async function handleOpenScorecard(data: { applicationId: string; interviewId: string }) {
    try {
      const result = await fetchInterviewForApp.mutateAsync(data.applicationId);
      const interview = result.interviews?.[0];
      if (interview) {
        setScorecardModal({ applicationId: data.applicationId, interviewId: interview._id });
      }
    } catch (err) {
      console.error("Failed to fetch interview:", err);
    }
  }

  async function handleScorecardSubmit(data: {
    scores: any;
    recommendation: string;
    notes?: string;
    strengths?: string;
    concerns?: string;
  }) {
    if (!scorecardModal) return;
    try {
      await createScorecard.mutateAsync({
        interviewId: scorecardModal.interviewId,
        ...data,
      });
      setScorecardModal(null);
    } catch {
      // error handled by React Query
    }
  }

  async function handleCreateInterview(data: {
    scheduledAt: string; type: string; duration: number; location?: string; meetLink?: string; instructions?: string;
  }) {
    if (!interviewModal) return;
    try {
      const result = await createInterview.mutateAsync({
        candidates: [{
          applicationId: interviewModal.appId,
          jobSeekerId: interviewModal.jobSeekerId,
        }],
        jobId: interviewModal.jobId,
        ...data,
      });
      if ((result.created ?? 0) < 1) {
        throw new Error("Failed to schedule interview");
      }
      setInterviewModal(null);
    } catch (err) {
      console.error("Failed to create interview:", err);
    }
  }

  async function handleCreateOffer(data: {
    salary: { amount: number; currency: string; period: string };
    startDate: string; benefits?: string; notes?: string; expiresAt?: string;
  }) {
    if (!offerModal) return;
    try {
      await createOffer.mutateAsync({ applicationId: offerModal.appId, ...data });
      setOfferModal(null);
    } catch (err) {
      console.error("Failed to create offer:", err);
    }
  }

  function openTimeline(appId: string, candidateName?: string) {
    const label = candidateName || `#${appId.slice(-4)}`;
    setTimelinePanel({ appId, candidateLabel: label });
  }

  function getCandidateName(app: Applicant): string {
    const u = app.jobSeekerId?.userId;
    if (typeof u === "object" && u?.name) return u.name;
    return `Candidate #${app._id.slice(-4)}`;
  }

  function buildViewingCv(app: Applicant): NonNullable<typeof viewingCv> {
    const js = app.jobSeekerId;
    const currentRole = js?.experience?.find((e) => e.isCurrent)?.jobTitle;
    return {
      url: js!.cv!.originalUrl!,
      name: getCandidateName(app),
      applicationId: app._id,
      status: app.status,
      candidate: {
        role: currentRole,
        experience: js?.totalExperienceYears,
        skills: js?.skills,
        location: js?.currentLocation,
      },
      aiMatchScore: app.aiMatchScore,
      matchBreakdown: app.matchBreakdown,
    };
  }

  function openInterviewModal(app: Applicant) {
    if (!app.jobId?._id || !app.jobSeekerId?._id) return;
    setInterviewModal({
      appId: app._id,
      jobId: app.jobId._id,
      jobSeekerId: app.jobSeekerId._id,
    });
  }

  // Filter applications by score range and days-in-stage
  const filteredApplications = applications.filter((app) => {
    const score = app.aiMatchScore ?? 0;
    if (score < scoreRange[0] || score > scoreRange[1]) return false;
    if (daysFilter) {
      const days = Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / 86400000);
      if (days < daysFilter) return false;
    }
    return true;
  });

  async function handleBulkAction(action: "reject" | "move_stage", targetStage?: string) {
    if (!selected.length) return;
    if (action === "reject" && !rejectionReason.trim()) {
      setShowRejectPrompt(true);
      return;
    }
    try {
      await bulkAction.mutateAsync({
        applicationIds: selected,
        action,
        params: {
          ...(targetStage && { targetStage }),
          ...(action === "reject" && { rejectionReason: rejectionReason.trim() }),
        },
      });
      setSelected([]);
      setRejectionReason("");
      setShowRejectPrompt(false);
    } catch {
      // error handled by React Query
    }
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelected(selected.length === applications.length ? [] : applications.map((a) => a._id));

  const grouped = PIPELINE_STAGES.reduce<Record<string, Applicant[]>>((acc, stage) => {
    acc[stage.value] = filteredApplications.filter((a) => a.status === stage.value);
    return acc;
  }, {});

  const canUpdate = can("applications", "update");
  const [dragModal, setDragModal] = useState<{
    appId: string;
    fromStatus: string;
    toStatus: string;
    note: string;
    rejectionReason: string;
    interviewDate: string;
  } | null>(null);

  return (
    <div className="page-container">
      <PageHeader
        title="Applications"
        description={`${total} total applicants${jobId ? " for this job" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Table</Button>
            <Button size="sm" variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")}>Kanban</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <SearchableSelect
          className="w-48"
          options={[
            { value: "all", label: "All statuses" },
            ...PIPELINE_STAGES.map((s) => ({ value: s.value, label: s.label })),
          ]}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="All statuses"
        />
        <Button size="sm" variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)} className="h-9">
          <Filter className="w-3.5 h-3.5 me-1.5" /> Filters
          {(scoreRange[0] > 0 || scoreRange[1] < 100 || daysFilter) && (
            <Badge variant="secondary" className="ms-1.5 text-[10px] px-1.5">Active</Badge>
          )}
        </Button>
        {/* Quick match filters */}
        <Button
          size="sm"
          variant={scoreRange[0] === 70 && scoreRange[1] === 100 ? "default" : "outline"}
          className="h-9 text-xs gap-1.5"
          onClick={() => setScoreRange(scoreRange[0] === 70 && scoreRange[1] === 100 ? [0, 100] : [70, 100])}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          High Match (&gt;70%)
        </Button>
        {/* ATS Auto Picker actions */}
        {canUpdate && (
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs gap-1.5"
              disabled={bulkAiMatch.isPending || applications.every((a) => a.aiMatchScore != null)}
              onClick={handleBulkAiMatch}
            >
              <Sparkles className={`w-3.5 h-3.5 ${bulkAiMatch.isPending ? "animate-pulse text-primary" : ""}`} />
              {bulkMatchProgress
                ? `Scoring ${bulkMatchProgress.done}/${bulkMatchProgress.total}…`
                : "Score All Candidates"}
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={bulkAction.isPending || !filteredApplications.some((a) => a.aiMatchScore != null && a.status === "applied")}
              onClick={handleAutoShortlist}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Shortlist Top Matches
            </Button>
          </div>
        )}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">AI Score Range</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={scoreRange[0]}
                onChange={(e) => setScoreRange([Math.max(0, +e.target.value), scoreRange[1]])}
                className="w-16 h-8 px-2 text-xs border border-border rounded bg-background" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="number" min={0} max={100} value={scoreRange[1]}
                onChange={(e) => setScoreRange([scoreRange[0], Math.min(100, +e.target.value)])}
                className="w-16 h-8 px-2 text-xs border border-border rounded bg-background" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Days in Pipeline</label>
            <SearchableSelect
              className="w-36 h-8 text-xs"
              options={[
                { value: "any", label: "Any" },
                { value: "3", label: "3+ days" },
                { value: "7", label: "7+ days" },
                { value: "14", label: "14+ days" },
                { value: "30", label: "30+ days" },
              ]}
              value={daysFilter?.toString() ?? "any"}
              onValueChange={(v) => setDaysFilter(v === "any" ? null : +v)}
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" variant="ghost" className="h-8 text-xs"
              onClick={() => { setScoreRange([0, 100]); setDaysFilter(null); }}>
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {canUpdate && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm font-medium text-primary">{selected.length} selected</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => handleBulkAction("move_stage", "shortlisted")} disabled={bulkAction.isPending}>
              Shortlist Selected
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowRejectPrompt(true)} disabled={bulkAction.isPending}>
              Reject All
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 ml-auto" onClick={() => setSelected([])}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Rejection reason prompt */}
      {showRejectPrompt && (
        <div className="flex flex-col gap-2 p-4 border border-destructive/30 bg-destructive/5 rounded-xl">
          <p className="text-sm font-medium text-destructive">Rejection reason (required)</p>
          <div className="flex gap-2">
            <input
              className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-destructive/40"
              placeholder="e.g. Skills don't match requirements"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
            />
            <Button size="sm" variant="destructive" className="h-9"
              onClick={() => handleBulkAction("reject")} disabled={bulkAction.isPending || !rejectionReason.trim()}>
              {bulkAction.isPending ? "Rejecting…" : "Confirm Reject"}
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setShowRejectPrompt(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-base h-28 animate-pulse" />
          ))}
        </div>
      ) : view === "kanban" ? (
        <>
          <KanbanView
            grouped={grouped}
            onUpdateStatus={canUpdate ? updateApplicationStatus : undefined}
            dragModal={dragModal}
            setDragModal={setDragModal}
            onTimeline={openTimeline}
            onScheduleInterview={canUpdate ? openInterviewModal : undefined}
            getCandidateName={getCandidateName}
            onViewCv={(app) => setViewingCv(buildViewingCv(app))}
          />
          {dragModal && (
            <DragModal
              modal={dragModal}
              onConfirm={async () => {
                const { appId, toStatus, rejectionReason, interviewDate, note } = dragModal;
                if (toStatus === "interview_scheduled") {
                  // Open proper interview scheduling modal
                  const app = applications.find((a) => a._id === appId);
                  if (app) {
                    setInterviewModal({
                      appId,
                      jobId: app.jobId._id,
                      jobSeekerId: app.jobSeekerId?._id ?? "",
                    });
                  }
                  setDragModal(null);
                  return;
                }
                if (toStatus === "offer") {
                  setOfferModal({ appId });
                  setDragModal(null);
                  return;
                }
                await updateApplicationStatus(appId, toStatus, rejectionReason || note);
                setDragModal(null);
              }}
              onCancel={() => setDragModal(null)}
              onChange={(updates) => setDragModal({ ...dragModal, ...updates })}
            />
          )}
        </>
      ) : (
        <TableView
          applications={applications}
          selected={selected}
          onToggle={canUpdate ? toggleSelect : undefined}
          onToggleAll={canUpdate ? toggleAll : undefined}
          onUpdateStatus={canUpdate ? updateApplicationStatus : undefined}
          onScorecard={canUpdate ? handleOpenScorecard : undefined}
          onGenerateAiMatch={canUpdate ? handleGenerateAiMatch : undefined}
          aiMatchPendingId={computeAiMatch.isPending ? computeAiMatch.variables?.applicationId : undefined}
          scorecardMap={scorecardMap}
          onOffer={canUpdate ? (app: Applicant) => setOfferModal({ appId: app._id }) : undefined}
          onTimeline={openTimeline}
          onScheduleInterview={canUpdate ? openInterviewModal : undefined}
          getCandidateName={getCandidateName}
          onViewCv={(app) => setViewingCv(buildViewingCv(app))}
        />
      )}

      {scorecardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-background rounded-lg border border-border shadow-lg max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Create Interview Scorecard</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Evaluate the candidate for this interview
              </p>
            </div>
            <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <ScorecardForm
                interviewId={scorecardModal.interviewId}
                onSubmit={handleScorecardSubmit}
                onCancel={() => setScorecardModal(null)}
                isLoading={createScorecard.isPending}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interview Scheduling Modal */}
      {interviewModal && (
        <InterviewScheduleModal
          onSubmit={handleCreateInterview}
          onCancel={() => setInterviewModal(null)}
        />
      )}

      {/* Offer Creation Modal */}
      {offerModal && (
        <OfferCreateModal
          onSubmit={handleCreateOffer}
          onCancel={() => setOfferModal(null)}
        />
      )}

      {/* Activity Timeline Panel */}
      {timelinePanel && (
        <ActivityTimelinePanel
          appId={timelinePanel.appId}
          candidateLabel={timelinePanel.candidateLabel}
          entries={timelineData}
          loading={timelineLoading}
          onClose={() => setTimelinePanel(null)}
        />
      )}

      {/* Resume Viewer Modal */}
      {viewingCv && (
        <ResumeViewerModal
          url={viewingCv.url}
          candidateName={viewingCv.name}
          onClose={() => setViewingCv(null)}
          applicationId={viewingCv.applicationId}
          status={viewingCv.status}
          candidate={viewingCv.candidate}
          aiMatchScore={viewingCv.aiMatchScore}
          matchBreakdown={viewingCv.matchBreakdown}
          onStatusChange={
            viewingCv.applicationId && canUpdate
              ? (newStatus) => updateApplicationStatus(viewingCv.applicationId!, newStatus)
              : undefined
          }
        />
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(newLimit: number) => { setLimit(newLimit); setPage(1); }}
      />
    </div>
  );
}

function KanbanView({
  grouped, onUpdateStatus, dragModal, setDragModal, onTimeline, onScheduleInterview, getCandidateName, onViewCv
}: {
  grouped: Record<string, Applicant[]>;
  onUpdateStatus?: (id: string, status: string, reason?: string) => void;
  dragModal: any;
  setDragModal: (modal: any) => void;
  onTimeline?: (appId: string, candidateName?: string) => void;
  onScheduleInterview?: (app: Applicant) => void;
  getCandidateName: (app: Applicant) => string;
  onViewCv?: (app: Applicant) => void;
}) {
  const dragRef = useRef<{ id: string; fromStatus: string } | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);

  const handleDragStart = (appId: string, fromStatus: string) => {
    dragRef.current = { id: appId, fromStatus };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const stageColumn = (e.currentTarget as HTMLElement).closest('[data-stage]');
    if (stageColumn) {
      setHighlightedColumn(stageColumn.getAttribute('data-stage'));
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const stageColumn = (e.currentTarget as HTMLElement).closest('[data-stage]');
    if (stageColumn && e.currentTarget === stageColumn) {
      setHighlightedColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, toStatus: string) => {
    e.preventDefault();
    setHighlightedColumn(null);

    if (!dragRef.current || !onUpdateStatus) return;

    const { id: appId, fromStatus } = dragRef.current;

    if (toStatus === fromStatus) {
      dragRef.current = null;
      return;
    }

    setDragModal({
      appId,
      fromStatus,
      toStatus,
      note: "",
      rejectionReason: "",
      interviewDate: "",
    });

    dragRef.current = null;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 min-h-[400px]">
      {PIPELINE_STAGES.map((stage) => (
        <div
          key={stage.value}
          data-stage={stage.value}
          className={`rounded-xl border-t-4 ${stage.color} bg-muted/20 p-3 space-y-2 transition-colors ${
            highlightedColumn === stage.value ? "ring-2 ring-primary/50 bg-primary/5" : ""
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, stage.value)}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
            <Badge variant="secondary" className="text-xs">{grouped[stage.value]?.length ?? 0}</Badge>
          </div>
          {grouped[stage.value]?.map((app) => (
            <KanbanCard
              key={app._id}
              app={app}
              onUpdateStatus={onUpdateStatus}
              onDragStart={handleDragStart}
              onTimeline={onTimeline}
              onScheduleInterview={onScheduleInterview}
              candidateName={getCandidateName(app)}
              onViewCv={onViewCv}
            />
          ))}
          {!grouped[stage.value]?.length && (
            <p className="text-xs text-muted-foreground text-center py-4">Empty</p>
          )}
        </div>
      ))}
    </div>
  );
}

function KanbanCard({
  app, onUpdateStatus, onDragStart, onTimeline, onScheduleInterview, candidateName, onViewCv
}: {
  app: Applicant;
  onUpdateStatus?: (id: string, status: string, reason?: string) => void;
  onDragStart?: (appId: string, fromStatus: string) => void;
  onTimeline?: (appId: string, candidateName?: string) => void;
  onScheduleInterview?: (app: Applicant) => void;
  candidateName: string;
  onViewCv?: (app: Applicant) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { locale } = useParams<{ locale: string }>();

  const daysInStage = Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / 86400000);
  const daysColor = daysInStage >= 7 ? "text-red-500" : daysInStage >= 3 ? "text-amber-500" : "text-emerald-500";

  return (
    <div
      draggable={true}
      onDragStart={() => {
        setIsDragging(true);
        onDragStart?.(app._id, app.status);
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-background rounded-lg border p-3 text-xs shadow-sm transition-all relative ${
        isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <User className="w-3 h-3 text-primary" />
        <a
          href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
          className="font-medium truncate hover:text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {candidateName}
        </a>
        {app.aiMatchScore != null && (
          <span className={`ms-auto font-bold ${app.aiMatchScore >= 70 ? "text-emerald-600" : "text-amber-600"}`}>
            {app.aiMatchScore}%
          </span>
        )}
      </div>
      <p className="text-muted-foreground truncate">{app.jobId?.title}</p>

      {/* Quick info: experience + location */}
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        {app.jobSeekerId?.totalExperienceYears != null && (
          <span>{app.jobSeekerId.totalExperienceYears}+ yrs</span>
        )}
        {app.jobSeekerId?.currentLocation && (
          <span className="truncate">{app.jobSeekerId.currentLocation}</span>
        )}
      </div>

      {/* Skills badges */}
      {app.jobSeekerId?.skills && app.jobSeekerId.skills.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {app.jobSeekerId.skills.slice(0, 2).map((s) => (
            <span key={s} className="text-[9px] px-1.5 py-0 bg-muted rounded-full">{s}</span>
          ))}
          {app.jobSeekerId.skills.length > 2 && (
            <span className="text-[9px] text-muted-foreground">+{app.jobSeekerId.skills.length - 2}</span>
          )}
        </div>
      )}

      {/* CV indicator */}
      {app.jobSeekerId?.cv?.originalUrl && onViewCv && (
        <button
          className="flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-1"
          onClick={(e) => { e.stopPropagation(); onViewCv(app); }}
        >
          <FileText className="w-2.5 h-2.5" /> View CV
        </button>
      )}

      {/* Cross-application badge */}
      {(app.otherApplicationsCount ?? 0) > 0 && (
        <a
          href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-1"
        >
          <Users className="h-2.5 w-2.5" />
          +{app.otherApplicationsCount} other role{app.otherApplicationsCount! > 1 ? "s" : ""}
        </a>
      )}

      {/* Days in stage indicator */}
      <div className="flex items-center gap-1 mt-1">
        <Clock className={`w-3 h-3 ${daysColor}`} />
        <span className={`text-[10px] ${daysColor}`}>{daysInStage}d in stage</span>
      </div>

      {/* AI Score Breakdown (shown on hover) */}
      {hovered && app.matchBreakdown && (
        <div className="mt-2 p-2 bg-muted/40 rounded-md space-y-1">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold">AI Breakdown</span>
          </div>
          {[
            { label: "Skills", value: app.matchBreakdown.skills },
            { label: "Experience", value: app.matchBreakdown.experience },
            { label: "Overall", value: app.matchBreakdown.overall },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-14">{item.label}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.value >= 70 ? "bg-emerald-500" : item.value >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
              <span className="text-[10px] font-medium w-7 text-right">{item.value}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {onTimeline && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" title="Activity Timeline"
            onClick={(e) => { e.stopPropagation(); onTimeline(app._id, candidateName); }}>
            <History className="w-3 h-3 mr-1" /> Timeline
          </Button>
        )}
        <div className="flex gap-1 ml-auto">
          {onUpdateStatus && (
            <>
              {app.status !== "selected" && app.status !== "shortlisted" && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] hover:bg-amber-100 text-amber-700"
                  onClick={() => onUpdateStatus(app._id, "shortlisted")}>
                  Shortlist
                </Button>
              )}
              {app.status === "shortlisted" && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] hover:bg-purple-100 text-purple-600"
                  onClick={() => onScheduleInterview?.(app)}>
                  <Calendar className="w-3 h-3 mr-1" /> Schedule Interview
                </Button>
              )}
              {!["rejected", "selected"].includes(app.status) && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] hover:bg-red-100 text-red-600"
                  onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {rejectOpen && onUpdateStatus && (
        <div className="mt-2 space-y-1">
          <input
            className="w-full h-7 px-2 text-[10px] border border-border rounded bg-background focus:outline-none"
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <div className="flex gap-1">
            <Button size="sm" variant="destructive" className="h-6 text-[10px] flex-1"
              disabled={!reason.trim()}
              onClick={() => { onUpdateStatus(app._id, "rejected", reason); setRejectOpen(false); }}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableView({
  applications, selected, onToggle, onToggleAll, onUpdateStatus, onScorecard, onGenerateAiMatch, aiMatchPendingId, scorecardMap, onOffer, onTimeline, onScheduleInterview, getCandidateName, onViewCv
}: {
  applications: Applicant[];
  selected: string[];
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  onUpdateStatus?: (id: string, status: string, reason?: string) => void;
  onScorecard?: (data: { applicationId: string; interviewId: string }) => void;
  onGenerateAiMatch?: (app: Applicant) => void;
  aiMatchPendingId?: string;
  scorecardMap?: Record<string, Scorecard>;
  onOffer?: (app: Applicant) => void;
  onTimeline?: (appId: string, candidateName?: string) => void;
  onScheduleInterview?: (app: Applicant) => void;
  getCandidateName: (app: Applicant) => string;
  onViewCv?: (app: Applicant) => void;
}) {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { locale } = useParams<{ locale: string }>();

  if (!applications.length) {
    return (
      <div className="card-base text-center py-16">
        <Inbox className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-semibold mb-1">No applications yet</h3>
        <p className="text-sm text-muted-foreground">Applications will appear here once candidates apply</p>
      </div>
    );
  }

  const allSelected = selected.length === applications.length;

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
      {rejectTarget && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20">
          <span className="text-sm text-destructive font-medium">Rejection reason:</span>
          <input
            className="flex-1 h-8 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-destructive/40"
            placeholder="Required"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <Button size="sm" variant="destructive" className="h-8"
            disabled={!reason.trim()}
            onClick={() => { onUpdateStatus?.(rejectTarget, "rejected", reason); setRejectTarget(null); setReason(""); }}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setRejectTarget(null); setReason(""); }}>
            Cancel
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {onToggleAll && (
              <TableHead className="w-10">
                <button onClick={onToggleAll} className="text-muted-foreground hover:text-foreground">
                  {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
              </TableHead>
            )}
            <TableHead>Applicant</TableHead>
            <TableHead>Job</TableHead>
            <TableHead className="hidden lg:table-cell">Experience</TableHead>
            <TableHead className="hidden md:table-cell">Skills</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>AI Match</TableHead>
            <TableHead className="hidden sm:table-cell">Applied</TableHead>
            {onScorecard && <TableHead>Scorecard</TableHead>}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => {
            const isSelected = selected.includes(app._id);
            const isTopMatch = (app.aiMatchScore ?? 0) >= 80;
            const rowClass = isSelected
              ? "bg-primary/5"
              : isTopMatch
              ? "bg-emerald-50/60 dark:bg-emerald-950/20"
              : undefined;
            return (
              <TableRow key={app._id} className={rowClass}>
                {onToggle && (
                  <TableCell className="w-10">
                    <button onClick={() => onToggle(app._id)} className="text-muted-foreground hover:text-foreground">
                      {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <a
                        href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {getCandidateName(app)}
                      </a>
                      {app.jobSeekerId?.currentLocation && (
                        <p className="text-[10px] text-muted-foreground">{app.jobSeekerId.currentLocation}</p>
                      )}
                      {(app.otherApplicationsCount ?? 0) > 0 && (
                        <a
                          href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                          className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-0.5"
                        >
                          <Users className="h-2.5 w-2.5" />
                          Also applied to {app.otherApplicationsCount} other role{app.otherApplicationsCount! > 1 ? "s" : ""}
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground truncate max-w-[160px]">
                  {app.jobId?.title}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  {app.jobSeekerId?.totalExperienceYears != null
                    ? `${app.jobSeekerId.totalExperienceYears}+ yrs`
                    : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-0.5 max-w-[140px]">
                    {app.jobSeekerId?.skills?.slice(0, 3).map((s) => (
                      <span key={s} className="text-[10px] px-1.5 py-0 bg-muted rounded-full whitespace-nowrap">{s}</span>
                    ))}
                    {(app.jobSeekerId?.skills?.length ?? 0) > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{app.jobSeekerId!.skills!.length - 3}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={app.status} />
                </TableCell>
                <TableCell>
                  {app.aiMatchScore != null ? (
                    <div className="group relative inline-block">
                      <span className={`inline-flex items-center gap-1 font-semibold cursor-help px-1.5 py-0.5 rounded-md text-sm ${
                        app.aiMatchScore >= 70
                          ? "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : app.aiMatchScore >= 50
                          ? "text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400"
                          : "text-muted-foreground bg-muted"
                      }`}>
                        {app.aiMatchScore}%
                      </span>
                      {(app.matchBreakdown || app.matchStrengths?.length || app.matchGaps?.length) && (
                        <div className="absolute left-0 top-full mt-1 z-30 hidden group-hover:block w-56 p-3 bg-popover border border-border rounded-lg shadow-lg">
                          {app.matchBreakdown && (
                            <>
                              <div className="flex items-center gap-1 mb-1.5">
                                <BarChart3 className="w-3 h-3 text-primary" />
                                <span className="text-[10px] font-semibold">AI Breakdown</span>
                              </div>
                              {[
                                { label: "Skills", value: app.matchBreakdown.skills },
                                { label: "Experience", value: app.matchBreakdown.experience },
                                { label: "Overall", value: app.matchBreakdown.overall },
                              ].map((item) => (
                                <div key={item.label} className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[10px] text-muted-foreground w-14">{item.label}</span>
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${item.value >= 70 ? "bg-emerald-500" : item.value >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                                      style={{ width: `${item.value}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-medium w-7 text-right">{item.value}%</span>
                                </div>
                              ))}
                            </>
                          )}
                          {app.matchStrengths && app.matchStrengths.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-emerald-600 mb-1">Strengths</p>
                              {app.matchStrengths.map((s, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground flex gap-1">
                                  <span className="text-emerald-500 shrink-0">✓</span> {s}
                                </p>
                              ))}
                            </div>
                          )}
                          {app.matchGaps && app.matchGaps.length > 0 && (
                            <div className="mt-1.5">
                              <p className="text-[10px] font-semibold text-red-500 mb-1">Gaps</p>
                              {app.matchGaps.map((g, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground flex gap-1">
                                  <span className="text-red-400 shrink-0">✗</span> {g}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : onGenerateAiMatch ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      title="Generate AI match score"
                      disabled={aiMatchPendingId === app._id}
                      onClick={() => onGenerateAiMatch(app)}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${aiMatchPendingId === app._id ? "animate-pulse text-primary" : ""}`} />
                    </Button>
                  ) : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                  {new Date(app.appliedAt).toLocaleDateString()}
                </TableCell>
                {onScorecard && (
                  <TableCell>
                    {(() => {
                      const sc = scorecardMap?.[app._id];
                      if (sc) {
                        const scoreColor = sc.overallScore >= 4 ? "text-emerald-600" : sc.overallScore >= 3 ? "text-amber-600" : "text-red-500";
                        return (
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-semibold ${scoreColor}`}>{sc.overallScore.toFixed(1)}/5</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                              title="View scorecard"
                              onClick={() => onScorecard({ applicationId: app._id, interviewId: "mock" })}
                            >
                              <Award className="w-3 h-3" />
                            </Button>
                          </div>
                        );
                      }
                      if (["interview_scheduled", "selected"].includes(app.status)) {
                        return (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-primary hover:bg-primary/10"
                            onClick={() => onScorecard({ applicationId: app._id, interviewId: "mock" })}
                          >
                            <Award className="w-3 h-3 me-1" /> Add
                          </Button>
                        );
                      }
                      return <span className="text-xs text-muted-foreground">—</span>;
                    })()}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex gap-1 items-center flex-wrap">
                    {app.jobSeekerId?.cv?.originalUrl && onViewCv && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => onViewCv(app)}>
                        <FileText className="w-3 h-3 me-1" /> View CV
                      </Button>
                    )}
                    {onTimeline && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" title="Activity Timeline"
                        onClick={() => onTimeline(app._id, getCandidateName(app))}>
                        <History className="w-3.5 h-3.5 me-1" /> Activity
                      </Button>
                    )}
                    {onUpdateStatus && (
                      <>
                        {app.status === "applied" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => onUpdateStatus(app._id, "shortlisted")}>
                            Shortlist
                          </Button>
                        )}
                        {app.status === "shortlisted" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => onScheduleInterview?.(app)}>
                            <Calendar className="w-3 h-3 me-1" /> Schedule Interview
                          </Button>
                        )}
                        {app.status === "interview_scheduled" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600"
                            onClick={() => onUpdateStatus(app._id, "selected")}>
                            Mark Selected
                          </Button>
                        )}
                        {app.status === "selected" && onOffer && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-600"
                            onClick={() => onOffer(app)}>
                            <DollarSign className="w-3 h-3 me-1" /> Create Offer
                          </Button>
                        )}
                        {!["rejected", "selected", "offer"].includes(app.status) && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                            onClick={() => { setRejectTarget(app._id); setReason(""); }}>
                            Reject
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DragModal({
  modal,
  onConfirm,
  onCancel,
  onChange,
}: {
  modal: {
    appId: string;
    fromStatus: string;
    toStatus: string;
    note: string;
    rejectionReason: string;
    interviewDate: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
  onChange: (updates: Partial<typeof modal>) => void;
}) {
  const getModalContent = () => {
    const { toStatus } = modal;

    switch (toStatus) {
      case "rejected":
        return {
          title: "Reject Candidate",
          description: "Are you sure you want to reject this candidate?",
          fields: (
            <textarea
              className="w-full h-20 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-destructive/40"
              placeholder="Rejection reason (required)"
              value={modal.rejectionReason}
              onChange={(e) => onChange({ rejectionReason: e.target.value })}
              maxLength={500}
            />
          ),
          isValid: modal.rejectionReason.trim().length > 0,
          confirmText: "Reject",
          confirmVariant: "destructive",
        };
      case "shortlisted":
        return {
          title: "Move to Shortlisted",
          description: "Move this candidate to the shortlisted stage?",
          fields: (
            <textarea
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Optional note"
              value={modal.note}
              onChange={(e) => onChange({ note: e.target.value })}
              maxLength={500}
            />
          ),
          isValid: true,
          confirmText: "Confirm",
          confirmVariant: "default",
        };
      case "interview_scheduled":
        return {
          title: "Schedule an Interview",
          description: "This will open the interview scheduling form.",
          fields: null,
          isValid: true,
          confirmText: "Open Scheduler",
          confirmVariant: "default",
        };
      case "offer":
        return {
          title: "Send an Offer",
          description: "This will open the offer creation form.",
          fields: null,
          isValid: true,
          confirmText: "Create Offer",
          confirmVariant: "default",
        };
      case "selected":
        return {
          title: "Mark as Selected",
          description: "Mark this candidate as selected?",
          fields: (
            <textarea
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Optional note"
              value={modal.note}
              onChange={(e) => onChange({ note: e.target.value })}
              maxLength={500}
            />
          ),
          isValid: true,
          confirmText: "Select",
          confirmVariant: "default",
        };
      case "applied":
        return {
          title: "Move to Applied",
          description: "Move this candidate back to the applied stage?",
          fields: (
            <textarea
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Optional note"
              value={modal.note}
              onChange={(e) => onChange({ note: e.target.value })}
              maxLength={500}
            />
          ),
          isValid: true,
          confirmText: "Confirm",
          confirmVariant: "default",
        };
      default:
        return {
          title: "Update Status",
          description: "Update candidate status?",
          fields: null,
          isValid: true,
          confirmText: "Confirm",
          confirmVariant: "default",
        };
    }
  };

  const content = getModalContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-sm w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{content.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{content.description}</p>
        </div>

        <div className="px-6 py-4 space-y-4">{content.fields}</div>

        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} className="h-9">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!content.isValid}
            className="h-9"
            variant={content.confirmVariant as any}
          >
            {content.confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InterviewScheduleModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    scheduledAt: string; type: string; duration: number; location?: string; meetLink?: string; instructions?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [type, setType] = useState<"video" | "offline" | "hybrid">("video");
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!scheduledAt) return;
    setSubmitting(true);
    try {
      await onSubmit({
        scheduledAt,
        type,
        duration,
        ...(location && { location }),
        ...(meetLink && { meetLink }),
        ...(instructions && { instructions }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Schedule Interview</h2>
          <p className="text-sm text-muted-foreground mt-1">Set up the interview details</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Date & Time *</label>
            <input type="datetime-local" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Type</label>
              <SearchableSelect
                className="h-9"
                options={[
                  { value: "video", label: "Video" },
                  { value: "offline", label: "In-Person" },
                  { value: "hybrid", label: "Hybrid" },
                ]}
                value={type}
                onValueChange={(v) => setType(v as typeof type)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duration</label>
              <SearchableSelect
                className="h-9"
                options={[
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                  { value: "45", label: "45 min" },
                  { value: "60", label: "60 min" },
                ]}
                value={String(duration)}
                onValueChange={(v) => setDuration(+v)}
              />
            </div>
          </div>
          {type !== "video" && (
            <div>
              <label className="block text-xs font-medium mb-1">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Office address or room"
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
          )}
          {type !== "offline" && (
            <div>
              <label className="block text-xs font-medium mb-1">Meeting Link</label>
              <input value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Instructions (optional)</label>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="Any special instructions for the candidate..."
              maxLength={500}
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} className="h-9">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!scheduledAt || submitting} className="h-9">
            {submitting ? "Scheduling..." : "Schedule Interview"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OfferCreateModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    salary: { amount: number; currency: string; period: string };
    startDate: string; benefits?: string; notes?: string; expiresAt?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState<"monthly" | "annually">("annually");
  const [startDate, setStartDate] = useState("");
  const [benefits, setBenefits] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!amount || !startDate) return;
    setSubmitting(true);
    try {
      await onSubmit({
        salary: { amount: parseFloat(amount), currency, period },
        startDate,
        ...(benefits && { benefits }),
        ...(notes && { notes }),
        ...(expiresAt && { expiresAt }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Create Offer</h2>
          <p className="text-sm text-muted-foreground mt-1">Send an offer to this candidate</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Salary *</label>
            <div className="flex gap-2">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount" min="0" step="100"
                className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <SearchableSelect
                className="w-24 h-9"
                options={[
                  { value: "USD", label: "USD" },
                  { value: "EUR", label: "EUR" },
                  { value: "GBP", label: "GBP" },
                  { value: "SAR", label: "SAR" },
                  { value: "AED", label: "AED" },
                ]}
                value={currency}
                onValueChange={setCurrency}
              />
              <SearchableSelect
                className="w-28 h-9"
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "annually", label: "Annually" },
                ]}
                value={period}
                onValueChange={(v) => setPeriod(v as typeof period)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Start Date *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expires On</label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Default: 7 days</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Benefits</label>
            <textarea value={benefits} onChange={(e) => setBenefits(e.target.value)}
              placeholder="Health insurance, PTO, remote work..."
              maxLength={2000}
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details for the candidate..."
              maxLength={1000}
              className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} className="h-9">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!amount || !startDate || submitting} className="h-9">
            <DollarSign className="w-3.5 h-3.5 me-1" />
            {submitting ? "Sending..." : "Send Offer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityTimelinePanel({
  appId,
  candidateLabel,
  entries,
  loading,
  onClose,
}: {
  appId: string;
  candidateLabel: string;
  entries: TimelineEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  const actionLabels: Record<string, { label: string; color: string }> = {
    "application.created": { label: "Applied", color: "bg-blue-500" },
    "application.status_changed": { label: "Status Changed", color: "bg-amber-500" },
    "application.shortlisted": { label: "Shortlisted", color: "bg-amber-500" },
    "application.interview_scheduled": { label: "Interview Scheduled", color: "bg-purple-500" },
    "application.offer_sent": { label: "Offer Sent", color: "bg-cyan-500" },
    "application.selected": { label: "Selected", color: "bg-emerald-500" },
    "application.rejected": { label: "Rejected", color: "bg-red-500" },
    "application.withdrawn": { label: "Withdrawn", color: "bg-gray-500" },
  };

  function getActionInfo(action: string) {
    return actionLabels[action] ?? { label: action.replace(/\./g, " ").replace(/^./, (c) => c.toUpperCase()), color: "bg-muted-foreground" };
  }

  const [mounted, setMounted] = useState(false);
  const latestEntry = entries[0];

  useEffect(() => {
    setMounted(true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const sheet = (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Activity timeline for ${candidateLabel}`}
        className="absolute inset-y-0 right-0 flex h-screen min-h-0 w-[92vw] max-w-[460px] flex-col overflow-hidden border-l border-border/60 bg-background shadow-[0_24px_80px_rgba(15,23,42,0.24)] animate-in slide-in-from-right duration-300 sm:w-[520px] sm:max-w-[520px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-gradient-to-br from-slate-50 via-background to-blue-50/70 px-5 py-4 dark:from-slate-950 dark:via-background dark:to-slate-900 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 shadow-sm ring-1 ring-primary/10">
                  <History className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Application Activity</p>
                  <h2 className="truncate text-lg font-semibold text-foreground sm:text-xl">{candidateLabel}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Recent workflow events for this application</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                  <span className="font-semibold text-foreground">App ID</span>
                  <span className="ml-1.5 font-mono">{appId.slice(-8)}</span>
                </div>
                <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                  <span className="font-semibold text-foreground">Events</span>
                  <span className="ml-1.5">{entries.length}</span>
                </div>
                {latestEntry && (
                  <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                    <span className="font-semibold text-foreground">Latest</span>
                    <span className="ml-1.5">{new Date(latestEntry.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                  </div>
                )}
              </div>
            </div>

            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0 hover:bg-destructive/10 hover:text-destructive" onClick={onClose} aria-label="Close activity timeline">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_28%),linear-gradient(to_bottom,rgba(148,163,184,0.08),transparent_28%)] px-4 py-4 sm:px-5">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="mt-1 h-10 w-10 rounded-2xl bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2.5">
                      <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                      <div className="h-14 w-full rounded-xl bg-muted animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/70 px-6 text-center shadow-sm">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/8 ring-1 ring-primary/10">
                <History className="h-7 w-7 text-primary/60" />
              </div>
              <p className="text-base font-semibold text-foreground">No activity recorded yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Status changes, interviews, offers, and other candidate actions will appear here once the workflow starts moving.</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute bottom-4 left-[13px] top-4 w-px bg-gradient-to-b from-primary/30 via-border to-transparent" />
              <div className="space-y-3 sm:space-y-4">
                {entries.map((entry) => {
                  const info = getActionInfo(entry.action);
                  return (
                    <div key={entry.id} className="relative">
                      <div className={`absolute left-[-18px] top-5 h-3.5 w-3.5 rounded-full ${info.color} ring-4 ring-background shadow-sm`} />
                      <div className="rounded-2xl border border-border/55 bg-background/92 p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)] sm:p-4">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">
                                {info.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                              <div className="flex items-center gap-1.5 rounded-full bg-muted/35 px-2.5 py-1">
                                <User className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground/85">{entry.actorName || "System"}</span>
                              </div>
                              <div className="flex items-center gap-1.5 rounded-full bg-muted/35 px-2.5 py-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{entry.actorRole}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {entry.changes?.after && Object.keys(entry.changes.after).length > 0 && (
                          <div className="mt-3 rounded-2xl border border-border/45 bg-slate-50/80 p-3 dark:bg-slate-950/30">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Updated Fields</p>
                            <div className="grid gap-2">
                              {Object.entries(entry.changes.after).map(([key, val]) => (
                                <div key={key} className="rounded-xl border border-border/35 bg-background/90 px-3 py-2 text-sm shadow-sm">
                                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</div>
                                  <div className="mt-1 font-medium text-foreground">{String(val)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}

