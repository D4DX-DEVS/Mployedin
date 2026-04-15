"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "next/navigation";
import {
  Award,
  BarChart3,
  BriefcaseBusiness,
  Calendar,
  CheckCheck,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Filter,
  History,
  Inbox,
  MapPin,
  Search,
  Sparkles,
  Square,
  User,
  Users,
  X,
} from "lucide-react";
import { ScorecardForm } from "@/components/scorecards/ScorecardForm";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  useApplicationTimeline,
  useApplications,
  useBulkAction,
  useBulkAiMatch,
  useComputeAiMatch,
  useCreateInterviewFromApp,
  useCreateOfferFromApp,
  useCreateScorecard,
  useFetchInterviewForApp,
  useUpdateApplicationStatus,
} from "@/hooks/useApplications";
import { usePermissions } from "@/hooks/usePermissions";
import { useScorecardsByApplicationIds } from "@/hooks/useScorecards";
import type { Scorecard } from "@/hooks/useScorecards";

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

const pipelineStages = [
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_scheduled", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Rejected" },
];

function getAiMatchBadgeClass(score?: number): string {
  if (score == null) {
    return "border border-slate-200 bg-slate-100 text-slate-600";
  }
  if (score >= 80) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (score >= 70) {
    return "border border-sky-200 bg-sky-50 text-sky-700";
  }
  if (score >= 50) {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border border-rose-200 bg-rose-50 text-rose-600";
}

function getCurrentRole(app: Applicant): string {
  return app.jobSeekerId?.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? "Role not specified";
}

function getLocationExperienceSummary(app: Applicant): string {
  const summary = [app.jobSeekerId?.currentLocation];

  if (app.jobSeekerId?.totalExperienceYears != null) {
    summary.push(`${app.jobSeekerId.totalExperienceYears}+ yrs`);
  }

  return summary.filter(Boolean).join(" • ") || "Location and experience pending";
}

function getApplicantTags(app: Applicant): string[] {
  return (app.jobSeekerId?.skills ?? []).slice(0, 3);
}

export default function EmployerApplicationsPage() {
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const jobId = searchParams.get("jobId") ?? searchParams.get("job") ?? "";
  const { can } = usePermissions();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [scorecardModal, setScorecardModal] = useState<{ applicationId: string; interviewId: string } | null>(null);
  const [interviewModal, setInterviewModal] = useState<{ appId: string; jobId: string; jobSeekerId: string } | null>(null);
  const [offerModal, setOfferModal] = useState<{ appId: string } | null>(null);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timelinePanel, setTimelinePanel] = useState<{ appId: string; candidateLabel: string } | null>(null);
  const [detailPanel, setDetailPanel] = useState<Applicant | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const [viewingCv, setViewingCv] = useState<{
    url: string;
    name: string;
    applicationId?: string;
    status?: string;
    candidate?: { role?: string; experience?: number; skills?: string[]; location?: string };
    aiMatchScore?: number;
    matchBreakdown?: { skills?: number; experience?: number; location?: number; overall?: number };
  } | null>(null);
  const [bulkMatchProgress, setBulkMatchProgress] = useState<{ done: number; total: number } | null>(null);

  const applicationsQuery = useApplications({
    page,
    limit,
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

  useEffect(() => { setPage(1); setSelected([]); }, [statusFilter, scoreRange, daysFilter, searchQuery, jobId]);

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

  async function handleOpenScorecard(data: { applicationId: string }) {
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

  function openDetailPanel(app: Applicant, trigger?: HTMLElement | null) {
    detailTriggerRef.current = trigger ?? null;
    setDetailPanel(app);
  }

  function closeDetailPanel() {
    setDetailPanel(null);
    const trigger = detailTriggerRef.current;
    if (trigger instanceof HTMLButtonElement) {
      window.requestAnimationFrame(() => trigger.focus());
    }
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

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const candidateName = getCandidateName(app).toLowerCase();
      const jobTitle = app.jobId?.title?.toLowerCase() ?? "";
      const location = app.jobSeekerId?.currentLocation?.toLowerCase() ?? "";
      const skills = (app.jobSeekerId?.skills ?? []).join(" ").toLowerCase();

      if (!candidateName.includes(query) && !jobTitle.includes(query) && !location.includes(query) && !skills.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const highMatchCount = filteredApplications.filter((app) => (app.aiMatchScore ?? 0) >= 70).length;
  const interviewCount = filteredApplications.filter((app) => app.status === "interview_scheduled").length;
  const selectedStageCount = filteredApplications.filter((app) => app.status === "selected").length;
  const allVisibleSelected = filteredApplications.length > 0 && filteredApplications.every((app) => selected.includes(app._id));
  const hasActiveRefinement = statusFilter !== "all" || scoreRange[0] > 0 || scoreRange[1] < 100 || daysFilter !== null || searchQuery.trim().length > 0;

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
    setSelected(filteredApplications.every((app) => selected.includes(app._id)) ? [] : filteredApplications.map((a) => a._id));

  const canUpdate = can("applications", "update");

  async function handleStageChange(app: Applicant, nextStatus: string, reason?: string) {
    if (nextStatus === app.status) return;

    if (nextStatus === "interview_scheduled") {
      openInterviewModal(app);
      return;
    }

    if (nextStatus === "offer") {
      setOfferModal({ appId: app._id });
      return;
    }

    await updateApplicationStatus(app._id, nextStatus, reason);
  }

  return (
    <div className="page-container space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] px-4 py-3 shadow-[0_20px_48px_-40px_rgba(2,132,199,0.35)] sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.45rem] font-semibold tracking-tight text-slate-950">Applications</h1>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium text-slate-950">{filteredApplications.length}</span> Applicants
              <span className="px-2 text-slate-300">•</span>
              <span className="font-medium text-slate-950">{highMatchCount}</span> High Match
              <span className="px-2 text-slate-300">•</span>
              <span className="font-medium text-slate-950">{interviewCount}</span> Interviews
              <span className="px-2 text-slate-300">•</span>
              <span className="font-medium text-slate-950">{selectedStageCount}</span> Selected
            </p>
          </div>

          {canUpdate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs font-medium"
                onClick={toggleAll}
                disabled={!filteredApplications.length}
              >
                {allVisibleSelected ? <CheckSquare className="mr-2 h-3.5 w-3.5 text-sky-600" /> : <Square className="mr-2 h-3.5 w-3.5 text-slate-400" />}
                {allVisibleSelected ? "Clear Visible" : "Select Visible"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs"
                disabled={bulkAiMatch.isPending || applications.every((a) => a.aiMatchScore != null)}
                onClick={handleBulkAiMatch}
              >
                <Sparkles className={`mr-2 h-3.5 w-3.5 ${bulkAiMatch.isPending ? "animate-pulse text-primary" : ""}`} />
                {bulkMatchProgress
                  ? `Scoring ${bulkMatchProgress.done}/${bulkMatchProgress.total}...`
                  : "Score All"}
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                disabled={bulkAction.isPending || !filteredApplications.some((a) => a.aiMatchScore != null && a.status === "applied")}
                onClick={handleAutoShortlist}
              >
                <CheckCheck className="mr-2 h-3.5 w-3.5" />
                Shortlist Top
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-[0_20px_48px_-42px_rgba(15,23,42,0.28)] backdrop-blur sm:p-4">

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(180px,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search applicants, jobs, skills, or location"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
              />
            </div>

              <SearchableSelect
                className="h-10 w-full rounded-xl border-slate-200 bg-slate-50"
                options={[
                  { value: "all", label: "All statuses" },
                  ...pipelineStages.map((s) => ({ value: s.value, label: s.label })),
                ]}
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder="All statuses"
              />
              <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)} className="h-10 rounded-xl border-slate-200 bg-white px-3 text-sm">
                <Filter className="mr-2 h-3.5 w-3.5" />
                Filters
                {(scoreRange[0] > 0 || scoreRange[1] < 100 || daysFilter) && (
                  <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[10px]">Active</Badge>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={scoreRange[0] === 70 && scoreRange[1] === 100 ? "h-10 rounded-xl border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 hover:bg-emerald-50" : "h-10 rounded-xl border-slate-200 bg-white px-3 text-sm"}
                onClick={() => setScoreRange(scoreRange[0] === 70 && scoreRange[1] === 100 ? [0, 100] : [70, 100])}
              >
                <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                High Match
              </Button>
          </div>

      {showFilters && (
        <div className="mt-3 flex flex-wrap gap-4 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">AI Score Range</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={scoreRange[0]}
                onChange={(e) => setScoreRange([Math.max(0, +e.target.value), scoreRange[1]])}
                className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700" />
              <span className="text-xs text-slate-500">to</span>
              <input type="number" min={0} max={100} value={scoreRange[1]}
                onChange={(e) => setScoreRange([scoreRange[0], Math.min(100, +e.target.value)])}
                className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700" />
              <span className="text-xs text-slate-500">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Days in Pipeline</label>
            <SearchableSelect
              className="h-9 w-40 rounded-xl border-slate-200 bg-white text-sm"
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
            <Button size="sm" variant="ghost" className="h-9 rounded-xl px-4 text-sm text-slate-600"
              onClick={() => { setScoreRange([0, 100]); setDaysFilter(null); }}>
              Reset
            </Button>
          </div>
        </div>
      )}
      </section>

      {canUpdate && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-sky-200 bg-[linear-gradient(135deg,_rgba(239,246,255,0.9),_rgba(255,255,255,0.95))] p-4 shadow-[0_16px_40px_-36px_rgba(2,132,199,0.45)]">
          <span className="text-sm font-semibold text-sky-700">{selected.length} selected for bulk review</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"
              onClick={() => handleBulkAction("move_stage", "shortlisted")} disabled={bulkAction.isPending}>
              Shortlist Selected
            </Button>
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-destructive/30 bg-white px-4 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => setShowRejectPrompt(true)} disabled={bulkAction.isPending}>
              Reject All
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto h-10 w-10 rounded-xl p-0 text-slate-500 hover:bg-white" onClick={() => setSelected([])}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showRejectPrompt && (
        <div className="flex flex-col gap-3 rounded-[24px] border border-destructive/30 bg-[linear-gradient(135deg,_rgba(254,242,242,0.95),_rgba(255,255,255,0.98))] p-4 shadow-[0_16px_40px_-36px_rgba(220,38,38,0.45)]">
          <p className="text-sm font-semibold text-destructive">Rejection reason is required before bulk reject.</p>
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-destructive/40"
              placeholder="e.g. Skills don't match requirements"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
            />
            <Button size="sm" variant="destructive" className="h-11 rounded-xl px-4"
              onClick={() => handleBulkAction("reject")} disabled={bulkAction.isPending || !rejectionReason.trim()}>
              {bulkAction.isPending ? "Rejecting…" : "Confirm Reject"}
            </Button>
            <Button size="sm" variant="ghost" className="h-11 rounded-xl px-4" onClick={() => setShowRejectPrompt(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_18px_40px_-40px_rgba(15,23,42,0.22)]" />
          ))}
        </div>
      ) : (
        <TableView
          applications={filteredApplications}
          selected={selected}
          onToggle={canUpdate ? toggleSelect : undefined}
          onGenerateAiMatch={canUpdate ? handleGenerateAiMatch : undefined}
          aiMatchPendingId={computeAiMatch.isPending ? computeAiMatch.variables?.applicationId : undefined}
          scorecardMap={scorecardMap}
          onOpenDetails={openDetailPanel}
          getCandidateName={getCandidateName}
          onViewCv={(app) => setViewingCv(buildViewingCv(app))}
          hasActiveRefinement={hasActiveRefinement}
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

      {detailPanel && (
        <ApplicationDetailsPanel
          app={detailPanel}
          locale={locale}
          scorecard={scorecardMap[detailPanel._id]}
          aiMatchPendingId={computeAiMatch.isPending ? computeAiMatch.variables?.applicationId : undefined}
          onClose={closeDetailPanel}
          onGenerateAiMatch={canUpdate ? handleGenerateAiMatch : undefined}
          onOpenScorecard={canUpdate ? handleOpenScorecard : undefined}
          onOpenTimeline={openTimeline}
          onScheduleInterview={canUpdate ? openInterviewModal : undefined}
          onViewCv={(app) => setViewingCv(buildViewingCv(app))}
          onCreateOffer={canUpdate ? (app) => setOfferModal({ appId: app._id }) : undefined}
          onChangeStatus={canUpdate ? handleStageChange : undefined}
          getCandidateName={getCandidateName}
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

function TableView({
  applications, selected, onToggle, onGenerateAiMatch, aiMatchPendingId, scorecardMap, onOpenDetails, getCandidateName, onViewCv, hasActiveRefinement
}: {
  applications: Applicant[];
  selected: string[];
  onToggle?: (id: string) => void;
  onGenerateAiMatch?: (app: Applicant) => void;
  aiMatchPendingId?: string;
  scorecardMap?: Record<string, Scorecard>;
  onOpenDetails?: (app: Applicant, trigger?: HTMLElement | null) => void;
  getCandidateName: (app: Applicant) => string;
  onViewCv?: (app: Applicant) => void;
  hasActiveRefinement?: boolean;
}) {
  const { locale } = useParams<{ locale: string }>();

  if (!applications.length) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] px-6 py-16 text-center shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-sky-50 text-sky-600">
          <Inbox className="h-7 w-7" />
        </div>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          {hasActiveRefinement ? "No applications match the current filters." : "No applications yet"}
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          {hasActiveRefinement
            ? "Try widening the score range, status, or search terms to bring more applicants back into view."
            : "Applications will appear here once candidates apply and move through your hiring pipeline."}
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
      <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,1.3fr)_auto] items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
        <span>Candidate</span>
        <span>Role, Match, Skills</span>
        <span className="text-right">Actions</span>
      </div>

      <div className="divide-y divide-slate-100">
        {applications.map((app) => {
          const isSelected = selected.includes(app._id);
          const candidateName = getCandidateName(app);
          const currentRole = getCurrentRole(app);
          const locationExperience = getLocationExperienceSummary(app);
          const topSkills = getApplicantTags(app);
          const appliedDate = new Date(app.appliedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
          const scorecard = scorecardMap?.[app._id];
          const aiScoreLabel = app.aiMatchScore != null ? `${app.aiMatchScore}% match` : "AI pending";

          return (
            <article
              key={app._id}
              data-testid={`applicant-row-${app._id}`}
              aria-label={`Applicant row for ${candidateName}`}
              onClick={() => onOpenDetails?.(app)}
              className={`grid gap-3 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-300/60 sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1.3fr)_auto] sm:items-center ${
                isSelected ? "bg-sky-50/70" : "bg-white hover:bg-slate-50/80"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {onToggle ? (
                  <button
                    type="button"
                    aria-label={`Select ${candidateName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(app._id);
                    }}
                    className="shrink-0 text-slate-400 transition hover:text-slate-700"
                  >
                    {isSelected ? <CheckSquare className="h-5 w-5 text-sky-600" /> : <Square className="h-5 w-5" />}
                  </button>
                ) : null}

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-sky-50 text-sky-600 shadow-inner">
                  <User className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                      className="truncate text-sm font-semibold tracking-tight text-slate-950 hover:text-sky-700 hover:underline sm:text-base"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {candidateName}
                    </a>
                    <StatusBadge status={app.status} />
                    {scorecard ? (
                      <Badge className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {scorecard.overallScore.toFixed(1)}/5
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-w-0 sm:px-1">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="truncate font-medium text-slate-900">{app.jobId?.title ?? currentRole}</span>
                  <span className="hidden text-slate-300 sm:inline">•</span>
                  <span className="truncate text-xs text-slate-500">{locationExperience}</span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge className={`${getAiMatchBadgeClass(app.aiMatchScore)} rounded-full px-2.5 py-1 text-[11px] font-semibold`}>
                    {aiScoreLabel}
                  </Badge>
                  {topSkills.map((skill) => (
                    <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                      {skill}
                    </span>
                  ))}
                  {!topSkills.length ? (
                    <span className="text-[11px] text-slate-400">{currentRole}</span>
                  ) : null}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>Applied {appliedDate}</span>
                  {(app.otherApplicationsCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sky-700">
                      <Users className="h-3 w-3" />
                      +{app.otherApplicationsCount} other role{app.otherApplicationsCount! > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:justify-end">
                {onOpenDetails ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-slate-200 bg-white px-3 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetails?.(app, event.currentTarget);
                    }}
                  >
                    <BarChart3 className="mr-1 h-3.5 w-3.5" /> Detailed View
                  </Button>
                ) : null}
                {app.jobSeekerId?.cv?.originalUrl && onViewCv ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 rounded-lg border-slate-200 bg-white p-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewCv(app);
                    }}
                    aria-label={`View CV for ${candidateName}`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {app.aiMatchScore == null && onGenerateAiMatch ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-2.5 text-[11px] text-sky-700 hover:bg-sky-50"
                    disabled={aiMatchPendingId === app._id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onGenerateAiMatch(app);
                    }}
                  >
                    <Sparkles className={`mr-1 h-3 w-3 ${aiMatchPendingId === app._id ? "animate-pulse text-sky-600" : ""}`} />
                    Score
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ApplicationDetailsPanel({
  app,
  locale,
  scorecard,
  aiMatchPendingId,
  onClose,
  onGenerateAiMatch,
  onOpenScorecard,
  onOpenTimeline,
  onScheduleInterview,
  onViewCv,
  onCreateOffer,
  onChangeStatus,
  getCandidateName,
}: {
  app: Applicant;
  locale: string;
  scorecard?: Scorecard;
  aiMatchPendingId?: string;
  onClose: () => void;
  onGenerateAiMatch?: (app: Applicant) => void;
  onOpenScorecard?: (data: { applicationId: string }) => void;
  onOpenTimeline?: (appId: string, candidateName?: string) => void;
  onScheduleInterview?: (app: Applicant) => void;
  onViewCv?: (app: Applicant) => void;
  onCreateOffer?: (app: Applicant) => void;
  onChangeStatus?: (app: Applicant, nextStatus: string, reason?: string) => Promise<void>;
  getCandidateName: (app: Applicant) => string;
}) {
  const [mounted, setMounted] = useState(false);
  const [nextStage, setNextStage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentRole = getCurrentRole(app);
  const candidateName = getCandidateName(app);
  const matchItems = app.matchBreakdown
    ? [
        { label: "Skills", value: app.matchBreakdown.skills },
        { label: "Experience", value: app.matchBreakdown.experience },
        { label: "Overall", value: app.matchBreakdown.overall },
      ]
    : [];
  const stageOptions = pipelineStages
    .filter((stage) => stage.value !== app.status)
    .map((stage) => ({ value: stage.value, label: stage.label }));

  async function handleQuickStageChange(nextStatus: string) {
    if (!onChangeStatus) return;

    setStatusPending(true);
    try {
      await onChangeStatus(app, nextStatus);
      setNextStage("");
      setRejectReason("");
    } finally {
      setStatusPending(false);
    }
  }

  async function handleApplyStageChange() {
    if (!onChangeStatus || !nextStage) return;

    const reason = nextStage === "rejected" ? rejectReason.trim() : undefined;
    if (nextStage === "rejected" && !reason) return;

    setStatusPending(true);
    try {
      await onChangeStatus(app, nextStage, reason);
      setNextStage("");
      setRejectReason("");
    } finally {
      setStatusPending(false);
    }
  }

  useEffect(() => {
    setMounted(true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    closeButtonRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    setNextStage("");
    setRejectReason("");
  }, [app._id, app.status]);

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
        aria-label={`Candidate details for ${candidateName}`}
        className="absolute inset-y-0 right-0 flex h-screen min-h-0 w-[96vw] max-w-[760px] flex-col overflow-hidden border-l border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.97))] shadow-[0_24px_80px_rgba(15,23,42,0.24)] animate-in slide-in-from-right duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-sky-50 text-sky-600 shadow-inner">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">Candidate Detailed View</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                      className="truncate text-xl font-semibold tracking-tight text-slate-950 hover:text-sky-700 hover:underline"
                    >
                      {candidateName}
                    </a>
                    <StatusBadge status={app.status} />
                    <Badge className={`${getAiMatchBadgeClass(app.aiMatchScore)} rounded-full px-2.5 py-1 text-xs font-semibold`}>
                      {app.aiMatchScore != null ? `${app.aiMatchScore}% match` : "AI score pending"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {currentRole}
                    {app.jobSeekerId?.currentLocation ? ` • ${app.jobSeekerId.currentLocation}` : ""}
                    {app.jobSeekerId?.totalExperienceYears != null ? ` • ${app.jobSeekerId.totalExperienceYears}+ years experience` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                  <span className="font-semibold text-slate-900">Applied</span>
                  <span className="ml-1.5">{new Date(app.appliedAt).toLocaleDateString()}</span>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                  <span className="font-semibold text-slate-900">Role</span>
                  <span className="ml-1.5">{app.jobId?.title ?? "Unassigned"}</span>
                </div>
                {(app.otherApplicationsCount ?? 0) > 0 ? (
                  <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
                    <span className="font-semibold text-slate-900">Other roles</span>
                    <span className="ml-1.5">{app.otherApplicationsCount}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <Button ref={closeButtonRef} variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0 text-slate-600 hover:bg-rose-50 hover:text-rose-600" onClick={onClose} aria-label="Close candidate details">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_28%),linear-gradient(to_bottom,rgba(148,163,184,0.08),transparent_28%)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Role</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{currentRole}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Location</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{app.jobSeekerId?.currentLocation ?? "Not specified"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Experience</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{app.jobSeekerId?.totalExperienceYears != null ? `${app.jobSeekerId.totalExperienceYears}+ years` : "Pending"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scorecard</p>
              <p className={`mt-2 text-sm font-semibold ${scorecard ? scorecard.overallScore >= 4 ? "text-emerald-600" : scorecard.overallScore >= 3 ? "text-amber-600" : "text-rose-500" : "text-slate-500"}`}>
                {scorecard ? `${scorecard.overallScore.toFixed(1)}/5 overall` : "Not added yet"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Application Overview</p>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div>
                    <p className="font-semibold text-slate-950">{app.jobId?.title ?? "Untitled role"}</p>
                    <p className="mt-1 text-xs text-slate-500">Applied on {new Date(app.appliedAt).toLocaleDateString()} and currently in the {app.status.replace(/_/g, " ")} stage.</p>
                  </div>
                  {(app.otherApplicationsCount ?? 0) > 0 ? (
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      This candidate also applied to {app.otherApplicationsCount} other role{app.otherApplicationsCount! > 1 ? "s" : ""}.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review Signals</p>
                  {app.aiMatchScore == null && onGenerateAiMatch ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-xl px-3 text-xs text-sky-700 hover:bg-sky-50"
                      disabled={aiMatchPendingId === app._id}
                      onClick={() => onGenerateAiMatch(app)}
                    >
                      <Sparkles className={`mr-1 h-3.5 w-3.5 ${aiMatchPendingId === app._id ? "animate-pulse text-sky-600" : ""}`} />
                      Generate Score
                    </Button>
                  ) : null}
                </div>

                {app.aiMatchScore != null ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
                      <p className="text-[11px] font-medium text-slate-500">AI match</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{app.aiMatchScore}%</p>
                    </div>

                    {matchItems.length ? (
                      <div className="space-y-2">
                        {matchItems.map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <span className="w-20 text-[11px] text-slate-500">{item.label}</span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${item.value >= 70 ? "bg-emerald-500" : item.value >= 50 ? "bg-amber-500" : "bg-rose-400"}`}
                                style={{ width: `${item.value}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-[11px] font-medium text-slate-600">{item.value}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Detailed AI category scores are not available for this application yet.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-500">Generate an AI match score to inspect how this candidate aligns with the role requirements.</p>
                )}
              </div>

              {app.coverLetter ? (
                <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cover Letter</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{app.coverLetter}</p>
                </div>
              ) : null}

              {app.matchStrengths?.length ? (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/60 p-5">
                  <p className="text-sm font-semibold text-emerald-700">Strengths</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {app.matchStrengths.map((strength) => (
                      <li key={strength} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {app.matchGaps?.length ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/60 p-5">
                  <p className="text-sm font-semibold text-amber-700">Watchouts</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {app.matchGaps.map((gap) => (
                      <li key={gap} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Key Skills</p>
                {app.jobSeekerId?.skills?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {app.jobSeekerId.skills.map((skill) => (
                      <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No skills are attached to this profile yet.</p>
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {app.jobSeekerId?.cv?.originalUrl && onViewCv ? (
                    <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onViewCv(app)}>
                      <FileText className="mr-2 h-3.5 w-3.5" /> View CV
                    </Button>
                  ) : null}
                  {onOpenTimeline ? (
                    <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onOpenTimeline(app._id, candidateName)}>
                      <History className="mr-2 h-3.5 w-3.5" /> Activity
                    </Button>
                  ) : null}
                  {onOpenScorecard && ["interview_scheduled", "selected"].includes(app.status) ? (
                    <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm" onClick={() => onOpenScorecard({ applicationId: app._id })}>
                      <Award className="mr-2 h-3.5 w-3.5" /> {scorecard ? "View Scorecard" : "Add Scorecard"}
                    </Button>
                  ) : null}
                  {app.status === "shortlisted" && onScheduleInterview ? (
                    <Button size="sm" variant="ghost" className="h-10 rounded-xl bg-violet-50 px-4 text-sm text-violet-700 hover:bg-violet-100" onClick={() => onScheduleInterview(app)}>
                      <Calendar className="mr-2 h-3.5 w-3.5" /> Schedule Interview
                    </Button>
                  ) : null}
                  {app.status === "selected" && onCreateOffer ? (
                    <Button size="sm" variant="ghost" className="h-10 rounded-xl bg-cyan-50 px-4 text-sm text-cyan-700 hover:bg-cyan-100" onClick={() => onCreateOffer(app)}>
                      <DollarSign className="mr-2 h-3.5 w-3.5" /> Create Offer
                    </Button>
                  ) : null}
                  {app.status === "applied" && onChangeStatus ? (
                    <Button size="sm" variant="ghost" className="h-10 rounded-xl bg-sky-50 px-4 text-sm text-sky-700 hover:bg-sky-100" disabled={statusPending} onClick={() => handleQuickStageChange("shortlisted")}>
                      Shortlist
                    </Button>
                  ) : null}
                  {app.status === "interview_scheduled" && onChangeStatus ? (
                    <Button size="sm" variant="ghost" className="h-10 rounded-xl bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100" disabled={statusPending} onClick={() => handleQuickStageChange("selected")}>
                      Mark Selected
                    </Button>
                  ) : null}
                  {!(["rejected", "offer"]).includes(app.status) && onChangeStatus ? (
                    <Button size="sm" variant="ghost" className="h-10 rounded-xl bg-rose-50 px-4 text-sm text-rose-600 hover:bg-rose-100" onClick={() => setNextStage("rejected")}>
                      Reject
                    </Button>
                  ) : null}
                </div>

                {onChangeStatus ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stage Management</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <SearchableSelect
                        className="h-10 w-full rounded-xl border-slate-200 bg-white"
                        options={[{ value: "", label: "Move to stage" }, ...stageOptions]}
                        value={nextStage}
                        onValueChange={setNextStage}
                        placeholder="Move to stage"
                      />
                      <Button size="sm" className="h-10 rounded-xl px-4 text-sm" disabled={!nextStage || statusPending || (nextStage === "rejected" && !rejectReason.trim())} onClick={handleApplyStageChange}>
                        {statusPending ? "Updating..." : "Apply Stage"}
                      </Button>
                    </div>
                    {nextStage === "rejected" ? (
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Rejection reason is required"
                        maxLength={500}
                        className="mt-3 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-300"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
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
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
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

