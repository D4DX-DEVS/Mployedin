"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";
import { sanitizeHtml } from "@/lib/security/html";
import { applicationKeys } from "@/hooks/useApplications";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AI_MATCH_HIGH_THRESHOLD } from "@/lib/constants";
import {
  Award,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Calendar,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  Filter,
  History,
  Inbox,
  Mail,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  User,
  Users,
  X,
} from "lucide-react";
import { ScorecardForm } from "@/components/scorecards/ScorecardForm";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { EmptyState } from "@/components/shared/EmptyState";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { AIEmailDraftButton } from "@/components/shared/AIEmailDraftButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { buildJobFilterOptions } from "@/lib/jobs/duplicateJobLabels";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { useScorecardsByApplicationIds } from "@/hooks/useScorecards";
import type { Scorecard } from "@/hooks/useScorecards";
import type { ExportColumn } from "@/lib/export";
import { formatCount, formatDate, formatTime } from "@/lib/ui/intlFormat";

interface Applicant {
  _id: string;
  jobId: { _id: string; title: string; requirements?: { skills?: string[]; preferredSkills?: string[] } };
  jobSeekerId: {
    _id?: string;
    userId?: { _id?: string; name?: string; avatar?: string } | string;
    skills?: string[];
    currentLocation?: string;
    totalExperienceYears?: number;
    experience?: { jobTitle?: string; company?: string; isCurrent?: boolean; startDate?: string; endDate?: string }[];
    education?: { degree?: string; institution?: string; field?: string; graduationDate?: string }[];
    cv?: { originalUrl?: string };
  };
  status: string;
  aiMatchScore?: number;
  viewedByEmployerAt?: string;
  appliedAt: string;
  coverLetter?: string;
  matchBreakdown?: { skills: number; experience: number; overall: number };
  matchStrengths?: string[];
  matchGaps?: string[];
  otherApplicationsCount?: number;
  screeningAnswers?: { questionId: string; questionLabel: string; answer: string | string[] | boolean }[];
  documents?: { name: string; url: string; type: string }[];
}

interface TimelineEntry {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  createdAt: string;
}

function usePipelineStages() {
  const t = useTranslations("employerApplications");
  return [
    { value: "applied", label: t("applied") },
    { value: "shortlisted", label: t("shortlisted") },
    { value: "interview_scheduled", label: t("interview") },
    { value: "offer", label: t("offer") },
    { value: "selected", label: t("selected") },
    { value: "rejected", label: t("rejected") },
  ];
}

function getAiMatchBadgeClass(score?: number): string {
  if (score == null) {
    return "border border-border bg-secondary/75 text-muted-foreground";
  }
  if (score >= 80) {
    return "border border-status-selected/20 bg-status-selected-bg text-status-selected";
  }
  if (score >= 70) {
    return "border border-status-applied/20 bg-status-applied-bg text-status-applied";
  }
  if (score >= 50) {
    return "border border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted";
  }
  return "border border-status-rejected/20 bg-status-rejected-bg text-status-rejected";
}

function getCurrentRole(app: Applicant): string {
  return app.jobSeekerId?.experience?.find((entry) => entry.isCurrent)?.jobTitle ?? "";
}

function getLocationExperienceSummary(app: Applicant, formatYears: (years: number) => string): string {
  const summary = [app.jobSeekerId?.currentLocation];

  if (app.jobSeekerId?.totalExperienceYears != null) {
    summary.push(formatYears(app.jobSeekerId.totalExperienceYears));
  }

  return summary.filter(Boolean).join(" • ") || "";
}

// Skills that overlap the job's required/preferred skills come first (highlighted);
// falls back to the candidate's first skills when there is no overlap or no job data.
function getApplicantSkills(app: Applicant): { matching: string[]; other: string[] } {
  const candidateSkills = app.jobSeekerId?.skills ?? [];
  const jobSkills = [
    ...(app.jobId?.requirements?.skills ?? []),
    ...(app.jobId?.requirements?.preferredSkills ?? []),
  ].map((s) => s.toLowerCase().trim());
  if (jobSkills.length === 0) return { matching: [], other: candidateSkills.slice(0, 3) };
  const matching = candidateSkills.filter((s) => jobSkills.includes(s.toLowerCase().trim()));
  const other = candidateSkills.filter((s) => !matching.includes(s));
  return { matching: matching.slice(0, 3), other: other.slice(0, Math.max(0, 3 - matching.length)) };
}

function getCandidateAvatar(app: Applicant): string | undefined {
  const u = app.jobSeekerId?.userId;
  return typeof u === "object" && u?.avatar ? u.avatar : undefined;
}

function getCandidateInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

// Measures the rendered width of a container element so the layout can switch
// between an inline split view (wide) and a full-screen modal (narrow) without
// relying on viewport breakpoints (the dashboard nav rail consumes ~436px).
function useContainerWide(minWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsWide(width >= minWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);
  return [ref, isWide] as const;
}

export default function EmployerApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const initialJobId = searchParams.get("jobId") ?? searchParams.get("job") ?? "";
  const { can } = usePermissions();
  const t = useTranslations("employerApplications");
  const tc = useTranslations("employerCommon");
  const pipelineStages = usePipelineStages();

  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  // ?status=applied deep-links from the dashboard "New Applications" card
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [selected, setSelected] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [scorecardModal, setScorecardModal] = useState<{ applicationId: string; interviewId: string } | null>(null);
  const [interviewModal, setInterviewModal] = useState<{ appId: string; jobId: string; jobSeekerId: string } | null>(null);
  const [offerModal, setOfferModal] = useState<{ appId: string } | null>(null);
  // Seed score range from URL params (?scoreMin=80&scoreMax=101) so deep-links
  // from the dashboard AI Recommended Candidates card pre-filter the list.
  const [scoreRange, setScoreRange] = useState<[number, number]>(() => {
    const min = Number(searchParams.get("scoreMin"));
    const max = Number(searchParams.get("scoreMax"));
    return [
      Number.isFinite(min) && min > 0 ? min : 0,
      Number.isFinite(max) && max < 100 && max > 0 ? max : 100,
    ];
  });
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  // Phones collapse the whole primary filter row behind a toggle — six stacked
  // full-width controls pushed the applicant list off the first screen.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timelinePanel, setTimelinePanel] = useState<{ appId: string; candidateLabel: string } | null>(null);
  const [detailPanel, setDetailPanel] = useState<Applicant | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const [layoutRef, isWide] = useContainerWide(1020);
  const [viewingCv, setViewingCv] = useState<{
    url: string;
    name: string;
    applicationId?: string;
    status?: string;
    jobSeekerId?: string;
    jobId?: string;
    candidate?: { role?: string; experience?: number; skills?: string[]; location?: string };
    aiMatchScore?: number;
    matchBreakdown?: { skills?: number; experience?: number; location?: number; overall?: number };
  } | null>(null);
  const [bulkMatchProgress, setBulkMatchProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Bulk interview & email state ──────────────────────────────────
  const [bulkInterviewModal, setBulkInterviewModal] = useState(false);
  const [emailPreviewModal, setEmailPreviewModal] = useState<{
    action: "reject" | "move_stage" | "send_message";
    targetStage?: string;
    rejectionReason?: string;
  } | null>(null);

  // ── Shortlist confirmation & post-shortlist interview prompt ───────
  const [shortlistConfirm, setShortlistConfirm] = useState<{
    candidates: Applicant[];
    total: number;
  } | null>(null);
  const [shortlistCount, setShortlistCount] = useState(0);
  const [postShortlistPrompt, setPostShortlistPrompt] = useState<{
    shortlistedIds: string[];
    candidateNames: string[];
  } | null>(null);

  // ── New filter state ──────────────────────────────────────────────
  const [jobFilter, setJobFilter] = useState(initialJobId);
  const [experienceRange, setExperienceRange] = useState<[number | null, number | null]>([null, null]);
  const [skillsFilter, setSkillsFilter] = useState<string[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  interface EmployerJob {
    _id: string;
    title: string;
    requirements: { skills: string[]; experienceMin: number; experienceMax: number; education?: string; languages?: string[] };
    salary: { min: number; max: number; currency: string; period?: string };
    location: { country: string; city: string; isRemote: boolean };
    employmentType?: string;
    workMode?: string;
    status: string;
    createdAt?: string;
  }
  const [employerJobs, setEmployerJobs] = useState<EmployerJob[]>([]);

  // Sort order for the list. API supports appliedAt/aiMatchScore; "newest" is the default.
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "score">("newest");
  const [sortBy, sortOrder]: ["appliedAt" | "aiMatchScore", "asc" | "desc"] =
    sortOption === "oldest" ? ["appliedAt", "asc"]
    : sortOption === "score" ? ["aiMatchScore", "desc"]
    : ["appliedAt", "desc"];

  // Debounce user inputs to avoid excessive API calls
  const debouncedSearch = useDebounce(searchQuery, 350);
  const debouncedScoreRange = useDebounce(scoreRange, 500);
  const debouncedExperienceRange = useDebounce(experienceRange, 500);

  const applicationsQuery = useApplications({
    page,
    limit,
    status: statusFilter !== "all" ? statusFilter : undefined,
    jobId: jobFilter || undefined,
    search: debouncedSearch.trim() || undefined,
    scoreMin: debouncedScoreRange[0] > 0 ? debouncedScoreRange[0] : undefined,
    scoreMax: debouncedScoreRange[1] < 100 ? debouncedScoreRange[1] : undefined,
    experienceMin: debouncedExperienceRange[0] ?? undefined,
    experienceMax: debouncedExperienceRange[1] ?? undefined,
    skills: skillsFilter.length > 0 ? skillsFilter : undefined,
    sortBy,
    sortOrder,
    fetchJobs: !jobsLoaded,
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
  const qc = useQueryClient();

  // ── Derived values ────────────────────────────────────────────────
  const applications = (applicationsQuery.data?.applications ?? []) as Applicant[];
  const total = applicationsQuery.data?.pagination?.total ?? applications.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isLoading = applicationsQuery.isLoading;
  const timelineData: TimelineEntry[] = timelineQuery.data?.timeline ?? [];
  const timelineLoading = timelineQuery.isLoading;

  // Store employer jobs from the first successful fetch
  useEffect(() => {
    if (applicationsQuery.data?.employerJobs && !jobsLoaded) {
      setEmployerJobs(applicationsQuery.data.employerJobs);
      setJobsLoaded(true);
    }
  }, [applicationsQuery.data?.employerJobs, jobsLoaded]);

  // Selected job's details (for dynamic filter hints)
  const selectedJob = employerJobs.find((j) => j._id === jobFilter) ?? null;

  // Job filter options — duplicate titles get a "Latest" tag + posting date/time (see helper).
  const jobOptions = buildJobFilterOptions(employerJobs, {
    allLabel: t("allJobs"),
    latestLabel: t("latestPosting"),
    dateLocale: locale === "ar" ? "ar-SA" : "en-US",
  });

  // Fetch scorecards for all visible applications in one batched request
  const applicationIds = applications.map((a) => a._id);
  const scorecardsQuery = useScorecardsByApplicationIds(applicationIds);
  const scorecardMap: Record<string, Scorecard> = scorecardsQuery.data ?? {};

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportCandidateCol"), key: "jobSeekerId", formatter: (_v, r) => { const a = r as Record<string, any>; const u = a.jobSeekerId?.userId; return typeof u === "object" && u?.name ? u.name : `${t("candidate")} #${String(a._id).slice(-4)}`; } },
    { header: t("exportJobCol"), key: "jobId", formatter: (_v, r) => (r as Record<string, any>).jobId?.title ?? t("exportUntitled") },
    { header: t("exportStatusCol"), key: "status", formatter: (v) => String(v ?? "—") },
    { header: t("exportAiMatchCol"), key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: t("exportSkillsCol"), key: "jobSeekerId", formatter: (_v, r) => ((r as Record<string, any>).jobSeekerId?.skills ?? []).slice(0, 5).join(", ") },
    { header: t("exportLocationCol"), key: "jobSeekerId", formatter: (_v, r) => (r as Record<string, any>).jobSeekerId?.currentLocation ?? "—" },
    { header: t("exportAppliedCol"), key: "appliedAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "applications",
    title: t("title"),
  });

  useEffect(() => {
    document.title = selectedJob
      ? `${selectedJob.title} — ${t("title")} · MPLOYEDIN`
      : `${t("title")} · MPLOYEDIN`;
  }, [selectedJob]);

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    setSelected([]);
     
  }, [statusFilter, scoreRange, daysFilter, searchQuery, jobFilter, experienceRange, skillsFilter, sortOption]);

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
      toast.success(t("aiMatchGenerated"));
    } catch (err) {
      console.error("Failed to compute AI match:", err);
      const message = t("aiMatchFailed");
      toast.error(message);
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

  // Auto-generate AI match scores for unscored visible applications on first load —
  // employers see scores without clicking each candidate ("Score All" still exists).
  const autoScoredRef = useRef(false);
  useEffect(() => {
    if (autoScoredRef.current || isLoading || applications.length === 0) return;
    autoScoredRef.current = true;
    if (applications.some((a) => a.aiMatchScore == null)) {
      void handleBulkAiMatch();
    }
     
  }, [isLoading, applications]);

  /** Surface the itemized processed/total/errors result from a bulk action as a toast. */
  function reportBulkActionResult(result: { processed?: number; total?: number; errors?: string[] }) {
    const processed = result.processed ?? 0;
    const total = result.total ?? processed;
    const errors = result.errors ?? [];
    if (errors.length === 0) {
      toast.success(`${processed}/${total} application(s) updated`);
    } else if (processed > 0) {
      toast(`${processed}/${total} updated, ${errors.length} failed: ${errors.slice(0, 3).join("; ")}`);
    } else {
      toast.error(`Bulk action failed: ${errors[0] ?? "unknown error"}`);
    }
  }

  /** Show confirmation before auto-shortlisting top candidates */
  function handleAutoShortlist() {
    const scored = [...filteredApplications]
      .filter((app) => app.aiMatchScore != null && app.status === "applied")
      .sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0));
    if (!scored.length) return;

    // Show all eligible candidates sorted by score; user picks how many
    setShortlistConfirm({ candidates: scored, total: scored.length });
    setShortlistCount(scored.length); // default: all
  }

  /** Execute the actual shortlisting after user confirms */
  async function confirmAutoShortlist() {
    if (!shortlistConfirm) return;
    const picked = shortlistConfirm.candidates.slice(0, shortlistCount);
    if (!picked.length) return;
    const ids = picked.map((a) => a._id);
    const names = picked.map((a) => getCandidateName(a));

    try {
      const result = await bulkAction.mutateAsync({
        applicationIds: ids,
        action: "move_stage",
        params: { targetStage: "shortlisted" },
      });
      reportBulkActionResult(result);
      setShortlistConfirm(null);
      // After successful shortlist, prompt user to schedule interviews
      setPostShortlistPrompt({ shortlistedIds: ids, candidateNames: names });
    } catch (err) {
      toast.error("We couldn't shortlist the selected candidates. Their current stages are unchanged. Review the selection and try again.");
    }
  }

  /** User chose to schedule interviews after shortlisting */
  function handlePostShortlistInterview() {
    if (!postShortlistPrompt) return;
    setSelected(postShortlistPrompt.shortlistedIds);
    setPostShortlistPrompt(null);
    setBulkInterviewModal(true);
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
    const appId = interviewModal.appId;
    try {
      const result = await createInterview.mutateAsync({
        candidates: [{
          applicationId: appId,
          jobSeekerId: interviewModal.jobSeekerId,
        }],
        jobId: interviewModal.jobId,
        ...data,
      });
      if ((result.created ?? 0) < 1) {
        throw new Error("Failed to schedule interview");
      }
      setInterviewModal(null);
      // Reflect the stage change on the open panel and stay put — reviewing other
      // candidates continues; the toast links to the interview list instead.
      setDetailPanel((prev) => (prev && prev._id === appId ? { ...prev, status: "interview_scheduled" } : prev));
      toast.success(t("interviewScheduledToast"), {
        action: {
          label: t("viewInterviews"),
          onClick: () => router.push(`/${locale}/employer/interviews`),
        },
      });
    } catch (err) {
      console.error("Failed to create interview:", err);
      toast.error(t("interviewScheduleFailed"));
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
    // First open clears the "New" badge (fire-and-forget; list refetches on success)
    if (!app.viewedByEmployerAt) {
      csrfFetch(`/api/applications/${app._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markViewed: true }),
      })
        .then((r) => { if (r.ok) qc.invalidateQueries({ queryKey: applicationKeys.lists() }); })
        .catch(() => {});
    }
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

  function buildViewingCv(app: Applicant, urlOverride?: string): NonNullable<typeof viewingCv> {
    const js = app.jobSeekerId;
    const currentRole = js?.experience?.find((e) => e.isCurrent)?.jobTitle;
    return {
      url:
        urlOverride ??
        (js?.cv?.originalUrl ? `/api/applications/${app._id}/documents/download?cv=1&view=1#cv.pdf` : ""),
      name: getCandidateName(app),
      applicationId: app._id,
      status: app.status,
      jobSeekerId: js?._id,
      jobId: app.jobId?._id,
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

  // Filter applications — most filtering is now server-side; only days-in-pipeline remains client-side
  const filteredApplications = applications.filter((app) => {
    if (daysFilter) {
      const days = Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / 86400000);
      if (days < daysFilter) return false;
    }
    return true;
  });

  const highMatchCount = filteredApplications.filter((app) => (app.aiMatchScore ?? 0) >= AI_MATCH_HIGH_THRESHOLD).length;
  const interviewCount = filteredApplications.filter((app) => app.status === "interview_scheduled").length;
  const selectedStageCount = filteredApplications.filter((app) => app.status === "selected").length;
  const allVisibleSelected = filteredApplications.length > 0 && filteredApplications.every((app) => selected.includes(app._id));
  const hasActiveRefinement = statusFilter !== "all" || scoreRange[0] > 0 || scoreRange[1] < 100 || daysFilter !== null || searchQuery.trim().length > 0 || !!jobFilter || experienceRange[0] !== null || experienceRange[1] !== null || skillsFilter.length > 0;

  async function handleBulkAction(
    action: "reject" | "move_stage" | "send_message",
    targetStage?: string,
    emailOverride?: { emailSubject?: string; emailBody?: string },
  ) {
    if (!selected.length) return;
    if (action === "reject" && !rejectionReason.trim()) {
      setShowRejectPrompt(true);
      return;
    }
    try {
      const result = await bulkAction.mutateAsync({
        applicationIds: selected,
        action,
        params: {
          ...(targetStage && { targetStage }),
          ...(action === "reject" && { rejectionReason: rejectionReason.trim() }),
          ...(emailOverride?.emailSubject && { emailSubject: emailOverride.emailSubject }),
          ...(emailOverride?.emailBody && { emailBody: emailOverride.emailBody }),
        },
      });
      reportBulkActionResult(result);
      setSelected([]);
      setRejectionReason("");
      setShowRejectPrompt(false);
      setEmailPreviewModal(null);
    } catch (err) {
      toast.error("We couldn't complete the bulk action. Check the candidate stages before trying again.");
    }
  }

  /** Open email preview before executing bulk action */
  function openEmailPreview(action: "reject" | "move_stage" | "send_message", targetStage?: string) {
    if (action === "reject" && !rejectionReason.trim()) {
      setShowRejectPrompt(true);
      return;
    }
    setEmailPreviewModal({
      action,
      targetStage,
      rejectionReason: action === "reject" ? rejectionReason.trim() : undefined,
    });
  }

  /** Open bulk interview scheduling modal for selected candidates */
  function openBulkInterviewModal() {
    if (!selected.length) return;
    setBulkInterviewModal(true);
  }

  async function handleBulkInterview(data: {
    scheduledAt: string;
    type: string;
    duration: number;
    durationPerCandidate: number;
    gapMinutes: number;
    location?: string;
    meetLink?: string;
    workingHours?: { start: string; end: string };
    breaks?: { label: string; start: string; end: string }[];
  }) {
    if (!selected.length) return;
    const candidates = selected.map((appId) => {
      const app = filteredApplications.find((a) => a._id === appId);
      return {
        applicationId: appId,
        jobSeekerId: app?.jobSeekerId?._id ?? "",
      };
    }).filter((c) => c.jobSeekerId);

    try {
      const resolvedJobId = jobFilter || filteredApplications[0]?.jobId?._id;
      if (!resolvedJobId) {
        toast.error(t("interviewNoJob"));
        return;
      }
      await createInterview.mutateAsync({
        candidates,
        jobId: resolvedJobId,
        scheduledAt: data.scheduledAt,
        type: data.type,
        duration: data.duration,
        durationPerCandidate: data.durationPerCandidate,
        gapMinutes: data.gapMinutes,
        ...(data.location && { location: data.location }),
        ...(data.meetLink && { meetLink: data.meetLink }),
        ...(data.workingHours && { workingHours: data.workingHours }),
        ...(data.breaks?.length && { breaks: data.breaks }),
      });
      setSelected([]);
      setBulkInterviewModal(false);
      toast.success(t("interviewScheduledToast"), {
        action: {
          label: t("viewInterviews"),
          onClick: () => router.push(`/${locale}/employer/interviews`),
        },
      });
    } catch (err) {
      console.error("Bulk interview scheduling failed:", err);
      toast.error(t("interviewScheduleFailed"));
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

    try {
      await updateApplicationStatus(app._id, nextStatus, reason);
      // Keep the open detail panel in sync — the list refetches, but the panel renders
      // from its own snapshot, so without this the stage change never shows.
      setDetailPanel((prev) => (prev && prev._id === app._id ? { ...prev, status: nextStatus } : prev));
      const stageLabel = pipelineStages.find((s) => s.value === nextStatus)?.label ?? nextStatus;
      toast.success(t("stageUpdatedTo", { stage: stageLabel }));
    } catch (err) {
      toast.error(t("stageUpdateFailed"));
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        title={selectedJob ? `${selectedJob.title} — ${t("title")}` : t("title")}
        actions={canUpdate ? (
          // Wraps rather than scrolls: the three labelled buttons need 261px at
          // 320px wide, so the old nowrap scroller hid the third one with no
          // scroll affordance. Wrapping keeps every action reachable at any width.
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-border bg-background/80 px-3 text-xs font-medium"
              onClick={toggleAll}
              disabled={!filteredApplications.length}
            >
              {allVisibleSelected ? <CheckSquare className="me-2 h-3.5 w-3.5 text-status-applied" /> : <Square className="me-2 h-3.5 w-3.5 text-muted-foreground" />}
              {allVisibleSelected ? t("clearVisible") : t("selectVisible")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-border bg-background/80 px-3 text-xs"
              disabled={bulkAiMatch.isPending || applications.every((a) => a.aiMatchScore != null)}
              onClick={handleBulkAiMatch}
            >
              <Sparkles className={`me-2 h-3.5 w-3.5 ${bulkAiMatch.isPending ? "animate-pulse text-primary" : ""}`} />
              {bulkMatchProgress
                ? t("scoringCandidate", { done: bulkMatchProgress.done, total: bulkMatchProgress.total })
                : t("scoreAll")}
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
              disabled={bulkAction.isPending || !filteredApplications.some((a) => a.aiMatchScore != null && a.status === "applied")}
              onClick={handleAutoShortlist}
            >
              <CheckCheck className="me-2 h-3.5 w-3.5" />
              {t("shortlistTop")}
            </Button>
          </div>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-x-1 px-3 text-sm text-muted-foreground sm:px-4">
        {/* Privacy info at the point candidate data is shown, compacted to an
            icon + popover to keep the list above the fold. */}
        <CandidateDataNotice variant="candidateList" compact className="-ms-1.5" />
        <span className="font-medium text-foreground">{isLoading ? "—" : filteredApplications.length}</span> {t("applicants")}
        <span className="px-2 text-border">•</span>
        <span className="font-medium text-foreground">{isLoading ? "—" : highMatchCount}</span> {t("highMatch")}
        <span className="px-2 text-border">•</span>
        <span className="font-medium text-foreground">{isLoading ? "—" : interviewCount}</span> {t("interviews")}
        <span className="px-2 text-border">•</span>
        <span className="font-medium text-foreground">{isLoading ? "—" : selectedStageCount}</span> {t("selected")}
      </div>

      <section className="workspace-panel-surface rounded-3xl panel-body">

          <div className="mb-2 flex items-center gap-2 sm:mb-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-background/70 text-left text-sm font-semibold text-foreground sm:hidden chip-pad"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                {t("filters")}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`} />
            </button>

            <TableToolbar
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
              className="shrink-0"
            />
          </div>

          {/* Primary filter row: Job selector + search + status + sort + toggle */}
          <div className={`grid-cols-2 gap-2 sm:grid-cols-1 xl:grid-cols-[minmax(170px,1fr)_minmax(0,1.5fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto_auto] ${mobileFiltersOpen ? "grid" : "hidden sm:grid"}`}>
            <SearchableSelect
              className="h-10 w-full rounded-xl border-border bg-status-applied-bg/50"
              options={jobOptions}
              value={jobFilter}
              onValueChange={(v) => {
                setJobFilter(v);
                setExperienceRange([null, null]);
                setSkillsFilter([]);
              }}
              placeholder={t("selectJob")}
            />
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={tc("search")}
                className="h-10 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
              />
            </div>

              <SearchableSelect
                className="h-10 w-full rounded-xl border-border bg-background/70"
                options={[
                  { value: "all", label: t("allStatuses") },
                  ...pipelineStages.map((s) => ({ value: s.value, label: s.label })),
                ]}
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder={t("allStatuses")}
              />
              <SearchableSelect
                className="h-10 w-full rounded-xl border-border bg-background/70"
                options={[
                  { value: "newest", label: t("sortNewest") },
                  { value: "oldest", label: t("sortOldest") },
                  { value: "score", label: t("sortScore") },
                ]}
                value={sortOption}
                onValueChange={(v) => setSortOption(v as typeof sortOption)}
                placeholder={t("sortLabel")}
                ariaLabel={t("sortLabel")}
              />
              <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)} className="h-10 rounded-xl border-border bg-background/80 px-3 text-sm">
                <Filter className="mr-2 h-3.5 w-3.5" />
                {t("filters")}
                {(scoreRange[0] > 0 || scoreRange[1] < 100 || daysFilter || experienceRange[0] !== null || experienceRange[1] !== null || skillsFilter.length > 0) && (
                  <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[11px]">Active</Badge>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={scoreRange[0] === 70 && scoreRange[1] === 100 ? "h-10 rounded-xl border-status-selected/20 bg-status-selected-bg px-3 text-sm text-emerald-700 hover:bg-status-selected-bg" : "h-10 rounded-xl border-border bg-background/80 px-3 text-sm"}
                onClick={() => setScoreRange(scoreRange[0] === 70 && scoreRange[1] === 100 ? [0, 100] : [70, 100])}
              >
                <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                {t("highMatch")}
              </Button>
          </div>

          {/* Selected job info strip */}
          {selectedJob && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-status-applied-bg/40 text-xs text-muted-foreground chip-pad">
              <BriefcaseBusiness className="h-3.5 w-3.5 text-status-applied" />
              <span className="font-semibold text-foreground">{selectedJob.title}</span>
              <span className="text-border">•</span>
              <span>{selectedJob.location.city}, {selectedJob.location.country}</span>
              {selectedJob.requirements.experienceMin > 0 || selectedJob.requirements.experienceMax < 30 ? (
                <>
                  <span className="text-border">•</span>
                  <span>{selectedJob.requirements.experienceMin}–{selectedJob.requirements.experienceMax} yrs exp</span>
                </>
              ) : null}
              {selectedJob.salary.min > 0 ? (
                <>
                  <span className="text-border">•</span>
                  <span>{selectedJob.salary.currency} {formatCount(selectedJob.salary.min)}–{formatCount(selectedJob.salary.max)}/{selectedJob.salary.period ?? "monthly"}</span>
                </>
              ) : null}
              {selectedJob.workMode ? (
                <>
                  <span className="text-border">•</span>
                  <span className="capitalize">{selectedJob.workMode.replace("_", " ")}</span>
                </>
              ) : null}
              {selectedJob.employmentType ? (
                <>
                  <span className="text-border">•</span>
                  <span className="capitalize">{selectedJob.employmentType.replace(/_/g, " ")}</span>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => { setJobFilter(""); setExperienceRange([null, null]); setSkillsFilter([]); }}
              >
                <X className="mr-1 h-3 w-3" /> Clear Job
              </Button>
            </div>
          )}

      {showFilters && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-3xl border border-border/60 bg-background/60 sm:gap-4 lg:grid-cols-4 card-pad">
          {/* AI Score Range */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("aiScoreRange")}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={scoreRange[0]}
                onChange={(e) => setScoreRange([Math.max(0, +e.target.value), scoreRange[1]])}
                className="h-9 w-20 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground" />
              <span className="text-xs text-muted-foreground">{t("rangeTo")}</span>
              <input type="number" min={0} max={100} value={scoreRange[1]}
                onChange={(e) => setScoreRange([scoreRange[0], Math.min(100, +e.target.value)])}
                className="h-9 w-20 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          {/* Experience Range */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("experienceYears")}
              {selectedJob && (selectedJob.requirements.experienceMin > 0 || selectedJob.requirements.experienceMax < 30) ? (
                <span className="ms-1 font-normal normal-case text-status-applied">
                  {t("jobRequires", { min: selectedJob.requirements.experienceMin, max: selectedJob.requirements.experienceMax })}
                </span>
              ) : null}
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={50}
                value={experienceRange[0] ?? ""}
                placeholder={selectedJob ? String(selectedJob.requirements.experienceMin) : t("min")}
                onChange={(e) => setExperienceRange([e.target.value ? +e.target.value : null, experienceRange[1]])}
                className="h-9 w-20 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground" />
              <span className="text-xs text-muted-foreground">{t("rangeTo")}</span>
              <input type="number" min={0} max={50}
                value={experienceRange[1] ?? ""}
                placeholder={selectedJob ? String(selectedJob.requirements.experienceMax) : t("max")}
                onChange={(e) => setExperienceRange([experienceRange[0], e.target.value ? +e.target.value : null])}
                className="h-9 w-20 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground" />
              <span className="text-xs text-muted-foreground">{t("yrs")}</span>
            </div>
          </div>

          {/* Days in Pipeline */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("daysInPipeline")}</label>
            <SearchableSelect
              className="h-9 w-40 rounded-xl border-border bg-background/80 text-sm"
              options={[
                { value: "any", label: t("any") },
                { value: "3", label: t("daysPlus", { days: 3 }) },
                { value: "7", label: t("daysPlus", { days: 7 }) },
                { value: "14", label: t("daysPlus", { days: 14 }) },
                { value: "30", label: t("daysPlus", { days: 30 }) },
              ]}
              value={daysFilter?.toString() ?? "any"}
              onValueChange={(v) => setDaysFilter(v === "any" ? null : +v)}
            />
          </div>

          {/* Skills Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("skills")}
              {selectedJob && selectedJob.requirements.skills.length > 0 ? (
                <span className="ms-1 font-normal normal-case text-status-applied">
                  {t("skillsRequired", { count: selectedJob.requirements.skills.length })}
                </span>
              ) : null}
            </label>
            {selectedJob && selectedJob.requirements.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedJob.requirements.skills.map((skill) => {
                  const isActive = skillsFilter.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isActive
                          ? "border-sky-300 bg-status-applied-bg text-sky-800"
                          : "border-border bg-background/70 text-muted-foreground hover:border-border hover:bg-status-applied-bg"
                      }`}
                      onClick={() =>
                        setSkillsFilter((prev) =>
                          isActive ? prev.filter((s) => s !== skill) : [...prev, skill]
                        )
                      }
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("selectJobForSkills")}</p>
            )}
          </div>

          {/* Quick-fill from job requirements */}
          {selectedJob && (
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
              <span className="text-xs font-medium text-muted-foreground">{t("quickFill")}</span>
              {(selectedJob.requirements.experienceMin > 0 || selectedJob.requirements.experienceMax < 30) && experienceRange[0] === null && experienceRange[1] === null ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-border bg-background/80 px-2.5 text-[11px]"
                  onClick={() => setExperienceRange([selectedJob.requirements.experienceMin, selectedJob.requirements.experienceMax])}
                >
                  <Clock className="me-1 h-3 w-3" />
                  {t("experienceRangeChip", { min: selectedJob.requirements.experienceMin, max: selectedJob.requirements.experienceMax })}
                </Button>
              ) : null}
              {selectedJob.requirements.skills.length > 0 && skillsFilter.length === 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-border bg-background/80 px-2.5 text-[11px]"
                  onClick={() => setSkillsFilter([...selectedJob.requirements.skills])}
                >
                  <Sparkles className="me-1 h-3 w-3" />
                  {t("allRequiredSkills")}
                </Button>
              ) : null}
              <div className="ms-auto">
                <Button size="sm" variant="ghost" className="h-7 rounded-lg px-3 text-[11px] text-muted-foreground"
                  onClick={() => {
                    setScoreRange([0, 100]);
                    setDaysFilter(null);
                    setExperienceRange([null, null]);
                    setSkillsFilter([]);
                  }}>
                  {t("resetAllFilters")}
                </Button>
              </div>
            </div>
          )}
          {!selectedJob && (
            <div className="flex items-end">
              <Button size="sm" variant="ghost" className="rounded-xl px-4 text-sm text-muted-foreground"
                onClick={() => { setScoreRange([0, 100]); setDaysFilter(null); setExperienceRange([null, null]); setSkillsFilter([]); }}>
                {t("reset")}
              </Button>
            </div>
          )}
        </div>
      )}
      </section>

      {canUpdate && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-sky-500/20 bg-sky-500/10 text-sky-800 card-pad">
          <span className="text-sm font-semibold">{selected.length} {t("bulkActions")}</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-border bg-background/80 px-4 text-sm"
              onClick={() => openEmailPreview("move_stage", "shortlisted")} disabled={bulkAction.isPending}>
              {t("moveToShortlisted")}
            </Button>
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-violet-200/40 bg-background/80 px-4 text-sm text-status-interview hover:bg-violet-500/10"
              onClick={openBulkInterviewModal} disabled={createInterview.isPending}>
              <Calendar className="me-2 h-3.5 w-3.5" />
              {t("scheduleInterview")}
            </Button>
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-destructive/30 bg-background/80 px-4 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => setShowRejectPrompt(true)} disabled={bulkAction.isPending}>
              {t("reject")}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ms-auto h-10 w-10 rounded-xl p-0 text-muted-foreground hover:bg-background/70" onClick={() => setSelected([])}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showRejectPrompt && (
        <div className="flex flex-col gap-3 rounded-3xl border border-destructive/30 bg-destructive/5 card-pad">
          <p className="text-sm font-semibold text-destructive">{t("rejectionRequired")}</p>
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-xl border border-border bg-background/80 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-destructive/40"
              placeholder={t("rejectionPlaceholder")}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
            />
            <Button size="sm" variant="destructive" className="h-11 rounded-xl px-4"
              onClick={() => openEmailPreview("reject")} disabled={bulkAction.isPending || !rejectionReason.trim()}>
              {bulkAction.isPending ? t("rejecting") : t("previewReject")}
            </Button>
            <Button size="sm" variant="ghost" className="h-11 rounded-xl px-4" onClick={() => setShowRejectPrompt(false)}>{t("cancel")}</Button>
          </div>
        </div>
      )}

      {/* Shortlist Top confirmation — user picks how many */}
      {shortlistConfirm && (
        <div className="flex flex-col gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 panel-body">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20">
              <CheckCheck className="h-5 w-5 text-status-selected" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t("highMatchedFound", { count: shortlistConfirm.total })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("shortlistHowMany")}
              </p>

              {/* Number picker */}
              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs font-medium text-foreground">{t("shortlistTop")}</label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button" size="dense" variant="outline"
                    className="w-8 rounded-lg p-0 text-sm"
                    disabled={shortlistCount <= 1}
                    onClick={() => setShortlistCount((c) => Math.max(1, c - 1))}
                  >
                    −
                  </Button>
                  <input
                    type="number"
                    min={1}
                    max={shortlistConfirm.total}
                    value={shortlistCount}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(shortlistConfirm.total, Number(e.target.value) || 1));
                      setShortlistCount(v);
                    }}
                    className="h-8 w-14 rounded-lg border border-emerald-200/60 bg-background/80 text-center text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  <Button
                    type="button" size="dense" variant="outline"
                    className="w-8 rounded-lg p-0 text-sm"
                    disabled={shortlistCount >= shortlistConfirm.total}
                    onClick={() => setShortlistCount((c) => Math.min(shortlistConfirm.total, c + 1))}
                  >
                    +
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">{t("ofTotal", { total: shortlistConfirm.total })}</span>
              </div>

              {/* Candidate list — highlight which are included */}
              <div className="mt-3 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {shortlistConfirm.candidates.map((app, idx) => {
                  const included = idx < shortlistCount;
                  return (
                    <div
                      key={app._id}
                      className={`flex items-center gap-2 rounded-xl border text-xs transition-opacity ${ included ? "border-emerald-200/60 bg-background/80" : "border-border/40 bg-muted/30 opacity-50" } chip-pad`}
                    >
                      <span className="w-4 text-center text-[11px] font-bold text-status-selected">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-foreground">{getCandidateName(app)}</span>
                      {app.aiMatchScore != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            app.aiMatchScore >= 80
                              ? "bg-status-selected-bg text-emerald-700"
                              : app.aiMatchScore >= 60
                                ? "bg-status-applied-bg text-status-applied"
                                : "bg-status-shortlisted-bg text-status-shortlisted"
                          }`}
                        >
                          {app.aiMatchScore}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="rounded-xl px-4" onClick={() => setShortlistConfirm(null)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-emerald-700 px-4 text-white hover:bg-emerald-800"
              disabled={bulkAction.isPending || shortlistCount < 1}
              onClick={confirmAutoShortlist}
            >
              <CheckCheck className="me-2 h-3.5 w-3.5" />
              {bulkAction.isPending ? t("shortlisting") : t("shortlistTopCount", { count: shortlistCount })}
            </Button>
          </div>
        </div>
      )}

      {/* Post-shortlist: prompt to schedule interviews */}
      {postShortlistPrompt && (
        <div className="flex flex-col gap-3 rounded-3xl border border-violet-500/20 bg-violet-500/10 panel-body">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20">
              <Calendar className="h-5 w-5 text-status-interview" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t("shortlistedSuccess", { count: postShortlistPrompt.shortlistedIds.length })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("scheduleInterviewsPrompt")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {postShortlistPrompt.candidateNames.map((name, i) => (
                  <span key={i} className="rounded-full border border-violet-200/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="rounded-xl px-4" onClick={() => setPostShortlistPrompt(null)}>
              {t("skipForNow")}
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-violet-600 px-4 text-white hover:bg-violet-700"
              onClick={handlePostShortlistInterview}
            >
              <Calendar className="me-2 h-3.5 w-3.5" />
              {t("scheduleInterviews")}
            </Button>
          </div>
        </div>
      )}

      <div
        ref={layoutRef}
        className={isWide && detailPanel ? "grid grid-cols-[minmax(0,1fr)_minmax(480px,600px)] items-start gap-4" : ""}
      >
        <div className="min-w-0 space-y-3">
          {applicationsQuery.isError ? (
            <div className="workspace-panel-surface rounded-3xl px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-status-rejected-bg text-rose-500">
                <Inbox className="h-7 w-7" />
              </div>
              <h3 className="heading-subsection mt-3 font-semibold tracking-tight text-foreground">
                {t("unableToLoad")}
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                {t("unableToLoadDesc")}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => applicationsQuery.refetch()}>
                {tc("tryAgain")}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-3xl border border-border/60 bg-background/70" />
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
              compact={Boolean(isWide && detailPanel)}
            />
          )}
        </div>
        {detailPanel ? (
          <ApplicationDetailsPanel
            variant={isWide ? "inline" : "modal"}
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
            onViewDocument={(app, url) => setViewingCv(buildViewingCv(app, url))}
            onCreateOffer={canUpdate ? (app) => setOfferModal({ appId: app._id }) : undefined}
            onChangeStatus={canUpdate ? handleStageChange : undefined}
            getCandidateName={getCandidateName}
          />
        ) : null}
      </div>

      {!isLoading && !applicationsQuery.isError && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={(p: number) => { setPage(p); setSelected([]); }}
          onLimitChange={(newLimit: number) => { setLimit(newLimit); setPage(1); setSelected([]); }}
        />
      )}

      {scorecardModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-background rounded-lg border border-border shadow-lg max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="heading-section font-semibold">{t("createScorecardTitle")}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("createScorecardDesc")}
              </p>
            </div>
            <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <FeatureGate feature="scorecardEvaluations">
              <ScorecardForm
                interviewId={scorecardModal.interviewId}
                onSubmit={handleScorecardSubmit}
                onCancel={() => setScorecardModal(null)}
                isLoading={createScorecard.isPending}
              />
              </FeatureGate>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Interview Scheduling Modal */}
      {interviewModal && createPortal(
        <InterviewScheduleModal
          onSubmit={handleCreateInterview}
          onCancel={() => setInterviewModal(null)}
        />,
        document.body
      )}

      {/* Offer Creation Modal */}
      {offerModal && createPortal(
        <OfferCreateModal
          onSubmit={handleCreateOffer}
          onCancel={() => setOfferModal(null)}
        />,
        document.body
      )}

      {/* Bulk Interview Scheduling Modal */}
      {bulkInterviewModal && createPortal(
        <BulkInterviewScheduleModal
          candidateCount={selected.length}
          candidateNames={selected.map((id) => {
            const app = filteredApplications.find((a) => a._id === id);
            return app ? getCandidateName(app) : `#${id.slice(-4)}`;
          })}
          onSubmit={handleBulkInterview}
          onCancel={() => setBulkInterviewModal(false)}
          isLoading={createInterview.isPending}
        />,
        document.body
      )}

      {/* Email Preview Modal */}
      {emailPreviewModal && createPortal(
        <EmailPreviewModal
          action={emailPreviewModal.action}
          targetStage={emailPreviewModal.targetStage}
          rejectionReason={emailPreviewModal.rejectionReason}
          candidateCount={selected.length}
          jobTitle={selectedJob?.title ?? "Position"}
          onConfirm={(emailOverride) => {
            handleBulkAction(
              emailPreviewModal.action,
              emailPreviewModal.targetStage,
              emailOverride,
            );
          }}
          onCancel={() => setEmailPreviewModal(null)}
          isLoading={bulkAction.isPending}
        />,
        document.body
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

      {/* Candidate detail panel is rendered inline/modal within the split layout above. */}

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
          jobSeekerId={viewingCv.jobSeekerId}
          jobId={viewingCv.jobId}
          onStatusChange={
            viewingCv.applicationId && canUpdate
              ? (newStatus) => updateApplicationStatus(viewingCv.applicationId!, newStatus)
              : undefined
          }
        />
      )}

    </div>
  );
}

function TableView({
  applications, selected, onToggle, onGenerateAiMatch, aiMatchPendingId, scorecardMap, onOpenDetails, getCandidateName, onViewCv, hasActiveRefinement, compact
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
  compact?: boolean;
}) {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("employerApplications");
  const tc = useTranslations("employerCommon");
  const statusLabelMap: Record<string, string> = {
    applied: t("applied"),
    shortlisted: t("shortlisted"),
    interview_scheduled: t("interview"),
    offer: t("offer"),
    selected: t("selected"),
    hired: t("hired"),
    rejected: t("rejected"),
    withdrawn: t("withdrawn"),
  };

  // When the detail panel is open the list is squeezed — drop the middle
  // columns (all shown in the panel) so the candidate cell can't overflow.
  const gridCols = compact
    ? "28px minmax(0,1fr) 72px 100px"
    : "28px 1.4fr 1fr 80px 1.2fr 80px 100px";

  if (!applications.length) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("noApplications")}
        description={t("noApplicationsDesc")}
      />
    );
  }

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
      <div className="hidden items-center gap-3 border-b border-border/70 bg-background/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid" style={{ gridTemplateColumns: gridCols }}>
        <span />
        <span>{t("candidate")}</span>
        {!compact && <span>{t("roleMatchSkills").split(",")[0]?.trim()}</span>}
        <span>{t("matchLabel")}</span>
        {!compact && <span>{t("skills")}</span>}
        {!compact && <span>{t("appliedOn")}</span>}
        <span className="text-right">{t("actions")}</span>
      </div>

      <div className="divide-y divide-border/60">
        {applications.map((app) => {
          const isSelected = selected.includes(app._id);
          const candidateName = getCandidateName(app);
          const avatarUrl = getCandidateAvatar(app);
          const candidateInitials = getCandidateInitials(candidateName);
          const currentRole = getCurrentRole(app);
          const location = app.jobSeekerId?.currentLocation ?? "";
          const experienceYears = app.jobSeekerId?.totalExperienceYears;
          const { matching: matchingSkills, other: otherSkills } = getApplicantSkills(app);
          const shownSkillsCount = matchingSkills.length + otherSkills.length;
          const extraSkillsCount = (app.jobSeekerId?.skills?.length ?? 0) - shownSkillsCount;
          const isNew = app.status === "applied" && !app.viewedByEmployerAt;
          const appliedDate = new Date(app.appliedAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { day: "numeric", month: "short", year: "numeric" });
          const scorecard = scorecardMap?.[app._id];
          const matchScore = app.aiMatchScore;
          const matchColor = matchScore != null ? (matchScore >= 80 ? "text-status-selected" : matchScore >= 70 ? "text-status-applied" : matchScore >= 50 ? "text-status-shortlisted" : "text-rose-500") : "text-muted-foreground";
          const matchText = matchScore != null ? (matchScore >= 80 ? t("matchExcellent") : matchScore >= 70 ? t("matchVeryGood") : matchScore >= 50 ? t("matchGood") : t("matchLow")) : "";

          return (
            <article
              key={app._id}
              data-testid={`applicant-row-${app._id}`}
              aria-label={t("applicantRowFor", { name: candidateName })}
              // The row was mouse-only: the equivalent "detailed view" button
              // is `hidden lg:flex`, so below 1024px a keyboard user had no way
              // to open a candidate at all (WCAG 2.1.1). currentTarget is passed
              // through so focus returns to this row when the drawer closes.
              tabIndex={0}
              onClick={(event) => onOpenDetails?.(app, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDetails?.(app, event.currentTarget);
                }
              }}
              className={`group cursor-pointer rounded-lg px-4 py-3 transition-all duration-200 hover:bg-status-applied-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid lg:items-center lg:gap-3 ${
                isSelected ? "bg-sky-500/10" : "bg-transparent"
              }`}
              style={{ gridTemplateColumns: gridCols }}
            >
              {/* Checkbox */}
              <div className="hidden lg:block">
                {onToggle ? (
                  <button
                    type="button"
                    aria-label={t("selectCandidate", { name: candidateName })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(app._id);
                    }}
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    {isSelected ? <CheckSquare className="h-5 w-5 text-status-applied" /> : <Square className="h-5 w-5" />}
                  </button>
                ) : null}
              </div>

              {/* Candidate */}
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0 ring-2 ring-background shadow-sm">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={candidateName} className="object-cover" /> : null}
                  <AvatarFallback className="bg-status-applied-bg text-xs font-semibold text-status-applied">
                    {candidateInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                      className="tap-target-row truncate text-sm font-semibold text-foreground hover:text-status-applied hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {candidateName}
                    </a>
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                    {isNew ? (
                      <span
                        data-testid={`new-badge-${app._id}`}
                        className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-600"
                      >
                        {t("newBadge")}
                      </span>
                    ) : null}
                    <StatusBadge status={app.status} className="shrink-0" />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {location}
                    {experienceYears != null ? (location ? ` • ${t("yearsExp", { count: experienceYears })} exp` : `${t("yearsExp", { count: experienceYears })} exp`) : ""}
                  </p>
                </div>
              </div>

              {/* Role — the job this candidate applied to (their own headline goes below) */}
              {!compact && (
                <div className="hidden min-w-0 lg:block">
                  <p className="truncate text-sm font-medium text-foreground">{app.jobId?.title || t("roleNotSpecified")}</p>
                  {currentRole ? <p className="truncate text-xs text-muted-foreground">{currentRole}</p> : null}
                </div>
              )}

              {/* Match */}
              <div className="hidden lg:block">
                {matchScore != null ? (
                  <div className="text-center">
                    <p className={`text-lg font-bold leading-tight ${matchColor}`}>{matchScore}%</p>
                    <p className={`text-[11px] font-semibold ${matchColor}`}>{matchText}</p>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">{t("aiPending")}</p>
                )}
              </div>

              {/* Skills — job-matching skills first (highlighted), then others */}
              {!compact && (
                <div className="hidden min-w-0 lg:flex lg:flex-wrap lg:gap-1">
                  {matchingSkills.map((skill) => (
                    <span key={skill} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      ✓ {skill}
                    </span>
                  ))}
                  {otherSkills.map((skill) => (
                    <span key={skill} className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {skill}
                    </span>
                  ))}
                  {extraSkillsCount > 0 ? (
                    <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-status-applied">
                      +{extraSkillsCount}
                    </span>
                  ) : null}
                </div>
              )}

              {/* Applied On */}
              {!compact && <div className="hidden text-xs text-muted-foreground lg:block">{appliedDate}</div>}

              {/* Actions */}
              <div className="hidden items-center justify-end gap-1.5 lg:flex">
                {onOpenDetails ? (
                  <Button
                    variant="ghost"
                    size="dense"
                    className="w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetails?.(app, event.currentTarget);
                    }}
                    aria-label={t("detailedView")}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                ) : null}
                {app.jobSeekerId?.cv?.originalUrl && onViewCv ? (
                  <Button
                    variant="ghost"
                    size="dense"
                    className="w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewCv(app);
                    }}
                    aria-label={t("viewCvFor", { name: candidateName })}
                  >
                    <FileText className="h-4 w-4" />
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

function StageStepper({ currentStatus, appliedDate }: { currentStatus: string; appliedDate: string }) {
  const t = useTranslations("employerApplications");
  const steps = [
    { key: "applied", label: t("applied") },
    { key: "shortlisted", label: t("shortlisted") },
    { key: "interview_scheduled", label: t("interview") },
    { key: "assessment", label: t("assessment") },
    { key: "offer", label: t("offer") },
    { key: "selected", label: t("hired") },
  ];
  const isRejected = currentStatus === "rejected" || currentStatus === "withdrawn";
  const currentIndex = steps.findIndex((s) => s.key === currentStatus);
  const lastIndex = steps.length - 1;
  return (
    <div className="mt-4">
      <div className="flex items-start">
        {steps.map((step, i) => {
          const reached = !isRejected && currentIndex >= 0 && i <= currentIndex;
          const isCurrent = !isRejected && i === currentIndex;
          return (
            <div key={step.key} className={i < lastIndex ? "flex flex-1 items-start" : "flex items-start"}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition ${reached ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground"} ${isCurrent ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-background" : ""}`}
                >
                  {reached ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`whitespace-nowrap text-[11px] font-medium ${isCurrent ? "text-status-applied" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
              {i < lastIndex ? (
                <span className={`mx-1.5 mt-3 h-0.5 flex-1 rounded-full ${reached && i < currentIndex ? "bg-sky-500" : "bg-muted"}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className={`mt-2.5 text-center text-[11px] ${isRejected ? "font-semibold text-rose-500" : "text-muted-foreground"}`}>
        {isRejected ? t("rejected") : `${t("currentStageLabel")}: ${steps[currentIndex]?.label ?? t("applied")} • ${t("appliedOnDate", { date: appliedDate })}`}
      </p>
    </div>
  );
}

function ApplicationDetailsPanel({
  app,
  variant = "modal",
  locale,
  scorecard,
  aiMatchPendingId,
  onClose,
  onGenerateAiMatch,
  onOpenScorecard,
  onOpenTimeline,
  onScheduleInterview,
  onViewCv,
  onViewDocument,
  onCreateOffer,
  onChangeStatus,
  getCandidateName,
}: {
  app: Applicant;
  variant?: "modal" | "inline";
  locale: string;
  scorecard?: Scorecard;
  aiMatchPendingId?: string;
  onClose: () => void;
  onGenerateAiMatch?: (app: Applicant) => void;
  onOpenScorecard?: (data: { applicationId: string }) => void;
  onOpenTimeline?: (appId: string, candidateName?: string) => void;
  onScheduleInterview?: (app: Applicant) => void;
  onViewCv?: (app: Applicant) => void;
  onViewDocument?: (app: Applicant, url: string) => void;
  onCreateOffer?: (app: Applicant) => void;
  onChangeStatus?: (app: Applicant, nextStatus: string, reason?: string) => Promise<void>;
  getCandidateName: (app: Applicant) => string;
}) {
  const [mounted, setMounted] = useState(false);
  const [nextStage, setNextStage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "resume" | "timeline" | "notes" | "messages" | "scorecard">("overview");
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const t = useTranslations("employerApplications");
  const tc = useTranslations("employerCommon");
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => { setNoteText(""); setNoteSaved(false); }, [app._id]);
  const pipelineStages = usePipelineStages();
  const currentRole = getCurrentRole(app);
  const candidateName = getCandidateName(app);
  const avatarUrl = getCandidateAvatar(app);
  const candidateInitials = getCandidateInitials(candidateName);
  const candidateExperienceYears = app.jobSeekerId?.totalExperienceYears;
  const displayDateLocale = locale === "ar" ? "ar-SA" : "en-US";
  const appliedDate = new Date(app.appliedAt).toLocaleDateString(displayDateLocale);
  const matchItems = app.matchBreakdown
    ? [
        { label: t("skills"), value: app.matchBreakdown.skills },
        { label: t("experience"), value: app.matchBreakdown.experience },
        { label: t("overall"), value: app.matchBreakdown.overall },
      ]
    : [];
  const stageOptions = pipelineStages
    .filter((stage) => stage.value !== app.status)
    .map((stage) => ({ value: stage.value, label: stage.label }));

  const matchLabel = app.aiMatchScore == null
    ? t("aiScorePending")
    : app.aiMatchScore >= 80 ? t("matchExcellent")
    : app.aiMatchScore >= 70 ? t("matchVeryGood")
    : app.aiMatchScore >= 50 ? t("matchGood")
    : t("matchLow");
  const matchLabelColor = app.aiMatchScore == null
    ? "text-muted-foreground"
    : app.aiMatchScore >= 80 ? "text-status-selected"
    : app.aiMatchScore >= 70 ? "text-status-applied"
    : app.aiMatchScore >= 50 ? "text-status-shortlisted"
    : "text-rose-500";
  const resumeDoc = app.documents?.find((doc) => doc.type === "resume");
  const resumeDocIndex = app.documents?.findIndex((doc) => doc.type === "resume") ?? -1;
  const hasResume = !!app.jobSeekerId?.cv?.originalUrl || !!resumeDoc;

  function handleViewResume() {
    if (app.jobSeekerId?.cv?.originalUrl && onViewCv) {
      onViewCv(app);
      return;
    }
    if (resumeDoc && resumeDocIndex >= 0 && onViewDocument) {
      onViewDocument(app, `/api/applications/${app._id}/documents/download?i=${resumeDocIndex}&view=1#${encodeURIComponent(resumeDoc.name)}`);
    }
  }

  async function handleAddNote() {
    const content = noteText.trim();
    if (!content || noteSaving) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/applications/${app._id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setNoteText("");
      setNoteSaved(true);
    } catch {
      setNoteSaved(false); // keep the draft so the user can retry
    } finally {
      setNoteSaving(false);
    }
  }

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
  }, []);

  useEffect(() => {
    if (variant !== "modal") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [variant]);

  useEffect(() => {
    if (!mounted || variant !== "modal") return;
    closeButtonRef.current?.focus();
  }, [mounted, variant]);

  useEffect(() => {
    setNextStage("");
    setRejectReason("");
  }, [app._id, app.status]);

  useEffect(() => {
    setActiveTab("overview");
    setStageMenuOpen(false);
  }, [app._id]);

  const detailTrapRef = useFocusTrap<HTMLDivElement>(variant === "modal");

  useEffect(() => {
    if (variant !== "modal") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, variant]);

  const panelBody = (
    <>
        <div className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="h-14 w-14 shrink-0 ring-2 ring-background shadow-sm">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={candidateName} className="object-cover" /> : null}
                <AvatarFallback className="bg-status-applied-bg text-lg font-bold text-status-applied">
                  {candidateInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <a
                    href={`/${locale}/employer/candidates/${app.jobSeekerId?._id}`}
                    className="truncate text-lg font-bold tracking-tight text-foreground hover:text-status-applied hover:underline"
                  >
                    {candidateName}
                  </a>
                  <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />
                </div>
                <p className="truncate text-sm font-medium text-foreground/80">{currentRole || t("roleNotSpecified")}</p>
                {app.jobId?.title ? (
                  <p className="truncate text-xs text-muted-foreground">{t("appliedForJob", { title: app.jobId.title })}</p>
                ) : null}
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {app.jobSeekerId?.currentLocation ?? t("notSpecified")}
                    {candidateExperienceYears != null ? ` • ${t("yearsExp", { count: candidateExperienceYears })}` : ""}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="text-end">
                <p className="text-2xl font-bold leading-none tracking-tight text-foreground">{app.aiMatchScore != null ? `${app.aiMatchScore}%` : "—"}</p>
                <p className={`mt-1 text-xs font-semibold ${matchLabelColor}`}>{matchLabel}</p>
              </div>
              <Button ref={closeButtonRef} variant="ghost" size="dense" className="w-8 rounded-full p-0 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500" onClick={onClose} aria-label={t("closeCandidateDetails")}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {onChangeStatus && stageOptions.length > 0 ? (
              <div className="relative">
                <Button
                  size="sm"
                  className="rounded-lg px-3 text-sm"
                  disabled={statusPending}
                  onClick={() => setStageMenuOpen((open) => !open)}
                >
                  {t("moveStage")}
                  <ChevronDown className="ms-1 h-3.5 w-3.5" />
                </Button>
                {stageMenuOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStageMenuOpen(false)} aria-hidden="true" />
                    <div className="absolute start-0 top-full z-20 mt-1 w-52 rounded-xl border border-border bg-popover p-1 shadow-lg">
                      {stageOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className="flex w-full items-center rounded-lg px-3 py-2 text-start text-sm text-foreground transition hover:bg-muted"
                          onClick={() => {
                            setStageMenuOpen(false);
                            if (opt.value === "rejected") {
                              setNextStage("rejected");
                              setActiveTab("overview");
                            } else {
                              handleQuickStageChange(opt.value);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {onScheduleInterview ? (
              <Button variant="outline" size="sm" className="rounded-lg border-border px-3 text-sm" onClick={() => onScheduleInterview(app)}>
                <Calendar className="me-1.5 h-3.5 w-3.5" />
                {t("scheduleInterview")}
              </Button>
            ) : null}
            <AIEmailDraftButton
              applicationId={app._id}
              candidateName={candidateName}
              defaultContext={
                app.status === "applied" ? "after_application" :
                app.status === "shortlisted" ? "after_shortlist" :
                app.status === "interview_scheduled" ? "after_interview" :
                app.status === "rejected" ? "after_rejection" :
                app.status === "offer" ? "after_offer" :
                "follow_up_general"
              }
            />
            <Button variant="outline" size="sm" className="h-9 w-9 rounded-lg border-border p-0" aria-label={t("moreActions")}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <StageStepper currentStatus={app.status} appliedDate={appliedDate} />
        </div>

        <div className="shrink-0 border-b border-border bg-background px-4 sm:px-5">
          <div className="flex gap-4 overflow-x-auto">
            {([
              { key: "overview", label: t("tabOverview") },
              { key: "resume", label: t("tabResume") },
              { key: "timeline", label: t("tabTimeline") },
              { key: "notes", label: t("tabNotes") },
              { key: "scorecard", label: t("tabScorecard") },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap border-b-2 py-2.5 text-sm font-medium transition ${activeTab === tab.key ? "border-sky-500 text-status-applied" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-5">
          {activeTab === "overview" ? (
          <div className="space-y-4">
            {/* Reject confirmation — shown when "Rejected" is picked from Move Stage */}
            {nextStage === "rejected" && onChangeStatus ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 card-pad">
                <p className="text-xs font-semibold text-status-rejected">{t("rejectAction")}</p>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder={t("rejectionReasonRequired")}
                  maxLength={500}
                  autoFocus
                  className="mt-2 h-16 w-full rounded-xl border border-border bg-background/80 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-rose-300 chip-pad"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="rounded-xl px-4 text-xs" onClick={() => { setNextStage(""); setRejectReason(""); }}>
                    {t("cancel")}
                  </Button>
                  <Button size="sm" variant="destructive" className="rounded-xl px-4 text-xs" disabled={!rejectReason.trim() || statusPending} onClick={handleApplyStageChange}>
                    {statusPending ? t("updating") : t("rejectAction")}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Row 1: AI Match Score | Application Overview (2 equal cards) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="workspace-glass-panel card-pad rounded-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("aiMatchScore")}</p>
                {app.aiMatchScore != null ? (
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-foreground">{app.aiMatchScore}%</span>
                      <span className={`text-sm font-semibold ${matchLabelColor}`}>{matchLabel}</span>
                    </div>
                    {matchItems.length ? (
                      <div className="mt-3 space-y-2">
                        {matchItems.map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <span className="w-20 text-[11px] text-muted-foreground">{item.label}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                              <div
                                className={`h-full rounded-full ${item.value >= 70 ? "bg-emerald-500" : item.value >= 50 ? "bg-amber-500" : "bg-rose-400"}`}
                                style={{ width: `${item.value}%` }}
                              />
                            </div>
                            <span className="w-9 text-right text-[11px] font-medium text-foreground/80">{item.value}%</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3">
                    {onGenerateAiMatch ? (
                      <Button size="dense" variant="ghost" className="rounded-xl px-3 text-xs text-status-applied hover:bg-sky-500/10" disabled={aiMatchPendingId === app._id} onClick={() => onGenerateAiMatch(app)}>
                        <Sparkles className={`mr-1.5 h-3.5 w-3.5 ${aiMatchPendingId === app._id ? "animate-pulse text-status-applied" : ""}`} />
                        {t("generateScore")}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("aiScorePending")}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("applicationOverview")}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{t("appliedRoles")}</span>
                    <span className="text-[11px] font-semibold text-foreground">{(app.otherApplicationsCount ?? 0) > 0 ? t("otherRolesCount", { count: app.otherApplicationsCount ?? 0 }) : "1"}</span>
                  </div>
                </div>
                {(app.otherApplicationsCount ?? 0) > 0 ? (
                  <Button variant="outline" size="dense" className="mt-3 w-full rounded-xl border-border text-[11px]">
                    {t("viewAllApplications")}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Resume lives in its own tab — no duplicate quick card here. */}

            {/* Row 3: Skills | Experience (2 cards) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="workspace-glass-panel card-pad rounded-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("keySkills")}</p>
                {app.jobSeekerId?.skills?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {app.jobSeekerId.skills.map((skill) => (
                      <span key={skill} className="rounded-md border border-border bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">{t("noSkills")}</p>
                )}
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("experience")}</p>
                {app.jobSeekerId?.experience?.length ? (
                  <div className="mt-3 space-y-2">
                    {app.jobSeekerId.experience.map((exp, i) => (
                      <div key={i} className="space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">{exp.jobTitle}{exp.isCurrent ? ` (${t("current")})` : ""}</p>
                        <p className="text-[11px] text-muted-foreground">{exp.company}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">{t("noExperience")}</p>
                )}
              </div>
            </div>

            {/* Row 4: Strengths | Watchouts (2 cards) */}
            {(app.matchStrengths?.length || app.matchGaps?.length) ? (
              <div className="grid grid-cols-2 gap-4">
                {app.matchStrengths?.length ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 card-pad">
                    <p className="text-xs font-semibold text-emerald-700">{t("strengths")}</p>
                    <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      {app.matchStrengths.map((s) => (
                        <li key={s} className="flex gap-1.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <div />}
                {app.matchGaps?.length ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 card-pad">
                    <p className="text-xs font-semibold text-status-shortlisted">{t("watchouts")}</p>
                    <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      {app.matchGaps.map((g) => (
                        <li key={g} className="flex gap-1.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <div />}
              </div>
            ) : null}

            {/* Row 5: Quick Actions (full width) */}
            <div className="workspace-glass-panel card-pad rounded-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("quickActions")}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="rounded-xl border-border text-[11px]" onClick={() => setActiveTab("notes")}>
                  <Plus className="me-1.5 h-3.5 w-3.5" /> {t("addNote")}
                </Button>
                {onOpenScorecard ? (
                  <Button variant="outline" size="sm" className="rounded-xl border-border text-[11px]" onClick={() => onOpenScorecard({ applicationId: app._id })}>
                    <Award className="me-1.5 h-3.5 w-3.5" /> {t("addScorecard")}
                  </Button>
                ) : null}
                {onChangeStatus && app.status === "applied" ? (
                  <Button variant="outline" size="sm" className="rounded-xl border-border text-[11px] text-status-applied" disabled={statusPending} onClick={() => handleQuickStageChange("shortlisted")}>
                    <CheckCheck className="me-1.5 h-3.5 w-3.5" /> {t("shortlistAction")}
                  </Button>
                ) : null}
                {!(["rejected", "offer"]).includes(app.status) && onChangeStatus ? (
                  <Button size="sm" variant="ghost" className="rounded-xl bg-rose-500/10 text-[11px] text-status-rejected hover:bg-rose-500/15" onClick={() => setNextStage("rejected")}>
                    {t("rejectAction")}
                  </Button>
                ) : null}
              </div>
            </div>

          </div>
          ) : null}

          {activeTab === "resume" ? (
            <div className="space-y-4">
              <div className="workspace-glass-panel rounded-3xl panel-body">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("tabResume")}</p>
                {hasResume ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 card-pad">
                      <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{resumeDoc?.name ?? t("docResume")}</p>
                        <p className="text-xs text-muted-foreground">{t("docResume")}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-10 w-full rounded-xl border-border bg-background/80 text-sm" onClick={handleViewResume}>
                      <FileText className="me-2 h-4 w-4" /> {t("viewResume")}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{t("noResumeUploaded")}</p>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "timeline" ? (
            <div className="workspace-glass-panel rounded-3xl text-center panel-body">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-status-applied">
                <History className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{t("timeline")}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{t("timelineHint")}</p>
              {onOpenTimeline ? (
                <Button variant="outline" size="sm" className="mt-4 rounded-xl border-border bg-background/80 text-sm" onClick={() => onOpenTimeline(app._id, candidateName)}>
                  <History className="me-2 h-3.5 w-3.5" /> {t("openFullTimeline")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {activeTab === "notes" ? (
            <div className="workspace-glass-panel rounded-3xl space-y-3 panel-body">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-status-interview" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("notes")}</p>
              </div>
              <p className="text-xs text-muted-foreground">Add private notes about this candidate for your team.</p>
              <textarea
                value={noteText}
                onChange={(e) => { setNoteText(e.target.value); setNoteSaved(false); }}
                placeholder={t("addNote")}
                maxLength={2000}
                className="h-28 w-full rounded-xl border border-border bg-background/80 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-sky-300 chip-pad"
              />
              <div className="flex items-center justify-between">
                {noteSaved ? <span className="text-xs text-emerald-600">Saved</span> : <span />}
                <Button size="sm" className="rounded-xl px-4 text-xs" disabled={!noteText.trim() || noteSaving} onClick={handleAddNote}>
                  <Plus className="me-1.5 h-3.5 w-3.5" /> {noteSaving ? t("updating") : t("addNote")}
                </Button>
              </div>
              {/* ponytail: composer only — listing past notes needs `notes` on the Applicant type + a GET route. Add when the team wants to read history here. */}
            </div>
          ) : null}


          {activeTab === "scorecard" ? (
            <div className="workspace-glass-panel rounded-3xl panel-body">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("scorecard")}</p>
              {scorecard ? (
                <div className="mt-3">
                  <p className="text-3xl font-bold tracking-tight text-foreground">{t("overallScore", { score: scorecard.overallScore.toFixed(1) })}</p>
                  {onOpenScorecard ? (
                    <Button variant="outline" size="sm" className="mt-4 rounded-xl border-border bg-background/80 text-sm" onClick={() => onOpenScorecard({ applicationId: app._id })}>
                      <Award className="me-2 h-3.5 w-3.5" /> {t("viewScorecard")}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-status-shortlisted">
                    <Award className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{t("scorecardEmptyHint")}</p>
                  {onOpenScorecard && ["interview_scheduled", "selected"].includes(app.status) ? (
                    <Button variant="outline" size="sm" className="mt-4 rounded-xl border-border bg-background/80 text-sm" onClick={() => onOpenScorecard({ applicationId: app._id })}>
                      <Award className="me-2 h-3.5 w-3.5" /> {t("addScorecard")}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
    </>
  );

  if (!mounted) return null;

  if (variant === "inline") {
    return (
      <aside
        role="region"
        aria-label={t("candidateDetailsFor", { name: candidateName })}
        className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-sm"
      >
        {panelBody}
      </aside>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={detailTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("candidateDetailsFor", { name: candidateName })}
        className="absolute inset-y-0 right-0 flex h-dvh min-h-0 w-[96vw] max-w-[760px] flex-col overflow-hidden border-l border-border bg-background shadow-[0_24px_80px_rgba(15,23,42,0.24)] animate-in slide-in-from-right duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        {panelBody}
      </div>
    </div>,
    document.body,
  );
}

function BulkInterviewScheduleModal({
  candidateCount,
  candidateNames,
  onSubmit,
  onCancel,
  isLoading,
}: {
  candidateCount: number;
  candidateNames: string[];
  onSubmit: (data: {
    scheduledAt: string; type: string; duration: number;
    durationPerCandidate: number; gapMinutes: number;
    location?: string; meetLink?: string;
    workingHours?: { start: string; end: string };
    breaks?: { label: string; start: string; end: string }[];
  }) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [type, setType] = useState<"video" | "offline" | "hybrid">("video");
  const [durationPerCandidate, setDurationPerCandidate] = useState(30);
  const [gapMinutes, setGapMinutes] = useState(5);
  const [location, setLocation] = useState("");
  const [meetLink, setMeetLink] = useState("");

  // Working hours & breaks
  const [whStart, setWhStart] = useState("09:00");
  const [whEnd, setWhEnd] = useState("21:00");
  const [breaks, setBreaks] = useState<{ label: string; start: string; end: string }[]>([
    { label: "Lunch Break", start: "13:00", end: "14:00" },
  ]);

  const addBreak = () => setBreaks((p) => [...p, { label: "", start: "16:00", end: "16:15" }]);
  const removeBreak = (idx: number) => setBreaks((p) => p.filter((_, i) => i !== idx));
  const updateBreak = (idx: number, field: "label" | "start" | "end", value: string) =>
    setBreaks((p) => p.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));

  // ---- Smart slot scheduler ----
  type PreviewItem =
    | { kind: "interview"; name: string; index: number; start: string; end: string; date: string; scheduledAt: Date }
    | { kind: "break"; label: string; start: string; end: string; date: string }
    | { kind: "day"; date: string };

  function computeSlots(): { items: PreviewItem[]; lastEnd: Date | null } {
    if (!scheduledAt) return { items: [], lastEnd: null };

    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    const fmtDate = (d: Date) => d.toLocaleDateString([], { day: "2-digit", month: "short" });

    // Parse HH:mm to minutes-since-midnight
    const parseHM = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
    const whStartMin = parseHM(whStart);
    const whEndMin = parseHM(whEnd);

    // Sort breaks by start time
    const sortedBreaks = [...breaks]
      .filter((b) => b.start && b.end && parseHM(b.start) < parseHM(b.end))
      .sort((a, b) => parseHM(a.start) - parseHM(b.start));

    // Set date's time to HH:mm
    const setTime = (d: Date, hm: string) => {
      const [h, m] = hm.split(":").map(Number);
      const n = new Date(d);
      n.setHours(h, m, 0, 0);
      return n;
    };

    // Get minutes-since-midnight from a Date
    const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

    // Advance cursor past any overlap with a break or past working hours end
    function nextAvailable(cursor: Date, durationMin: number): Date {
      let c = new Date(cursor);
      // Safety: max 50 iterations to prevent infinite loop
      for (let iter = 0; iter < 50; iter++) {
        const cMin = minuteOfDay(c);
        const slotEndMin = cMin + durationMin;

        // If cursor is before working hours start → advance to WH start
        if (cMin < whStartMin) {
          c = setTime(c, whStart);
          continue;
        }

        // If slot would end past working hours → advance to next day WH start
        if (slotEndMin > whEndMin) {
          const next = new Date(c);
          next.setDate(next.getDate() + 1);
          c = setTime(next, whStart);
          continue;
        }

        // Check break overlaps
        let pushed = false;
        for (const brk of sortedBreaks) {
          const bStart = parseHM(brk.start);
          const bEnd = parseHM(brk.end);
          // Overlap: slot starts before break ends AND slot ends after break starts
          if (cMin < bEnd && slotEndMin > bStart) {
            c = setTime(c, brk.end);
            pushed = true;
            break;
          }
        }
        if (pushed) continue;

        return c;
      }
      return c;
    }

    const items: PreviewItem[] = [];
    let cursor = new Date(scheduledAt);
    let lastEnd: Date | null = null;
    let prevDate = "";
    let interviewIdx = 0;

    for (let i = 0; i < candidateNames.length; i++) {
      cursor = nextAvailable(cursor, durationPerCandidate);
      const curDate = fmtDate(cursor);

      // Day header when date changes
      if (curDate !== prevDate) {
        items.push({ kind: "day", date: curDate });
        prevDate = curDate;
      }

      // Check if any breaks fall between previous slot end and this slot start — show them
      if (lastEnd) {
        const prevEndMin = minuteOfDay(lastEnd);
        const curStartMin = minuteOfDay(cursor);
        const isSameDay = cursor.toDateString() === lastEnd.toDateString();
        if (isSameDay) {
          for (const brk of sortedBreaks) {
            const bStart = parseHM(brk.start);
            const bEnd = parseHM(brk.end);
            if (bStart >= prevEndMin && bEnd <= curStartMin) {
              items.push({
                kind: "break",
                label: brk.label || "Break",
                start: fmt(setTime(cursor, brk.start)),
                end: fmt(setTime(cursor, brk.end)),
                date: curDate,
              });
            }
          }
        }
      }

      const slotEnd = new Date(cursor.getTime() + durationPerCandidate * 60_000);
      items.push({
        kind: "interview",
        name: candidateNames[i],
        index: ++interviewIdx,
        start: fmt(cursor),
        end: fmt(slotEnd),
        date: curDate,
        scheduledAt: new Date(cursor),
      });

      lastEnd = slotEnd;
      // Advance cursor by gap
      cursor = new Date(slotEnd.getTime() + gapMinutes * 60_000);
    }

    return { items, lastEnd };
  }

  const { items: previewItems, lastEnd: lastSlotEnd } = computeSlots();
  const interviewCount = previewItems.filter((p) => p.kind === "interview").length;
  const dayCount = previewItems.filter((p) => p.kind === "day").length;

  // Duration summary
  const interviewMinutes = interviewCount * durationPerCandidate;
  const totalMinutes = lastSlotEnd && scheduledAt
    ? Math.round((lastSlotEnd.getTime() - new Date(scheduledAt).getTime()) / 60_000)
    : 0;

  const isPast = scheduledAt ? new Date(scheduledAt) < new Date() : false;

  async function handleSubmit() {
    if (!scheduledAt || isPast) return;
    const validBreaks = breaks.filter((b) => b.start && b.end && b.start < b.end);
    await onSubmit({
      scheduledAt: new Date(scheduledAt).toISOString(),
      type,
      duration: durationPerCandidate,
      durationPerCandidate,
      gapMinutes,
      ...(location && { location }),
      ...(meetLink && { meetLink }),
      workingHours: { start: whStart, end: whEnd },
      ...(validBreaks.length > 0 && { breaks: validBreaks }),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="heading-section font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-status-applied" />
            Bulk Schedule Interviews
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule interviews for {candidateCount} candidate{candidateCount > 1 ? "s" : ""} with auto-staggered time slots
          </p>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Start Date & Time */}
          <DateTimePicker
            label="Start Date & Time *"
            value={scheduledAt}
            onChange={setScheduledAt}
            minDate={new Date()}
            placeholder="Pick date & time"
          />
          {isPast && (
            <p className="text-xs text-red-500 -mt-2">Please select a future date and time</p>
          )}

          {/* Type / Duration / Gap row */}
          <div className="grid grid-cols-3 gap-3">
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
              <label className="block text-xs font-medium mb-1">Per Candidate</label>
              <SearchableSelect
                className="h-9"
                options={[
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                  { value: "45", label: "45 min" },
                  { value: "60", label: "60 min" },
                ]}
                value={String(durationPerCandidate)}
                onValueChange={(v) => setDurationPerCandidate(+v)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Gap Between</label>
              <SearchableSelect
                className="h-9"
                options={[
                  { value: "0", label: "No gap" },
                  { value: "5", label: "5 min" },
                  { value: "10", label: "10 min" },
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                ]}
                value={String(gapMinutes)}
                onValueChange={(v) => setGapMinutes(+v)}
              />
            </div>
          </div>

          {/* Working Hours */}
          <div className="rounded-lg border border-border space-y-3 chip-pad">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Working Hours
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Start</label>
                <DateTimePicker mode="time" value={whStart} onChange={setWhStart} />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">End</label>
                <DateTimePicker mode="time" value={whEnd} onChange={setWhEnd} />
              </div>
            </div>

            {/* Break Windows */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Break Windows</p>
              {breaks.map((brk, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                  <div>
                    <input
                      value={brk.label}
                      onChange={(e) => updateBreak(idx, "label", e.target.value)}
                      placeholder="e.g. Lunch Break"
                      className="w-full h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                  <div>
                    <DateTimePicker mode="time" value={brk.start}
                      onChange={(v) => updateBreak(idx, "start", v)} />
                  </div>
                  <div>
                    <DateTimePicker mode="time" value={brk.end}
                      onChange={(v) => updateBreak(idx, "end", v)} />
                  </div>
                  <button onClick={() => removeBreak(idx)} className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-status-rejected-bg transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {breaks.length < 10 && (
                <button onClick={addBreak}
                  className="flex items-center gap-1.5 text-xs text-status-applied hover:text-status-applied font-medium mt-1">
                  <Plus className="h-3.5 w-3.5" /> Add Break
                </button>
              )}
            </div>
          </div>

          {/* Location / Meeting Link */}
          {type !== "video" && (
            <div>
              <label className="block text-xs font-medium mb-1">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Office address or room"
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-sky-400" />
            </div>
          )}
          {type !== "offline" && (
            <div>
              <label className="block text-xs font-medium mb-1">Meeting Link</label>
              <input value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-sky-400" />
            </div>
          )}

          {/* Time slots preview */}
          {previewItems.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-status-applied-bg/40 card-pad">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-status-applied mb-3">
                Auto-calculated Schedule{dayCount > 1 ? ` · ${dayCount} Days` : ""}
              </p>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {previewItems.map((item, i) => (
                  <div key={i}>
                    {item.kind === "day" ? (
                      <div className="flex items-center gap-2 py-1.5 mt-1 first:mt-0">
                        <div className="flex-1 border-t border-sky-300/40" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-status-applied">{item.date}</span>
                        <div className="flex-1 border-t border-sky-300/40" />
                      </div>
                    ) : item.kind === "break" ? (
                      <div className="flex items-center gap-2 py-1 my-0.5 rounded-md bg-status-shortlisted-bg/60 px-3">
                        <Clock className="h-3.5 w-3.5 text-status-shortlisted shrink-0" />
                        <span className="flex-1 text-xs font-medium text-status-shortlisted truncate">{item.label}</span>
                        <span className="font-mono text-[11px] text-status-shortlisted">{item.start} – {item.end}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-6 text-center text-xs font-bold text-status-applied">{item.index}</span>
                        <span className="flex-1 truncate font-medium text-foreground">{item.name}</span>
                        <span className="font-mono text-xs text-status-applied">{item.start} – {item.end}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {lastSlotEnd && (
                <div className="mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2 space-y-0.5">
                  <p>
                    Total: {totalMinutes} min · Interviews: {interviewMinutes} min
                    (ends at {lastSlotEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })})
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} className="">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!scheduledAt || isPast || isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Calendar className="w-3.5 h-3.5 me-1" />
            {isLoading ? "Scheduling..." : `Schedule ${candidateCount} Interview${candidateCount > 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmailPreviewModal({
  action,
  targetStage,
  rejectionReason,
  candidateCount,
  jobTitle,
  onConfirm,
  onCancel,
  isLoading,
}: {
  action: "reject" | "move_stage" | "send_message";
  targetStage?: string;
  rejectionReason?: string;
  candidateCount: number;
  jobTitle: string;
  onConfirm: (emailOverride?: { emailSubject?: string; emailBody?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const statusLabel =
    action === "reject" ? "Rejection" :
    targetStage === "shortlisted" ? "Shortlisted" :
    targetStage === "selected" ? "Selected" :
    targetStage === "offer" ? "Offer" :
    targetStage === "hired" ? "Hired" :
    action === "send_message" ? "Message" :
    (targetStage ?? "Update").replace(/_/g, " ");

  // Default email subject/body based on action
  const defaultSubject = action === "reject"
    ? `Application Update – ${jobTitle}`
    : action === "send_message"
    ? `Update regarding ${jobTitle}`
    : targetStage === "offer"
    ? `Offer Extended – ${jobTitle}`
    : `Application Update – ${jobTitle}`;

  const defaultBody = action === "reject"
    ? `<p>Dear <strong>{{candidateName}}</strong>,</p>
<p>Thank you for your interest in the <strong>{{jobTitle}}</strong> position at <strong>{{companyName}}</strong>.</p>
<p>After careful consideration, we have decided to move forward with other candidates at this time.</p>
${rejectionReason ? `<p><em>Reason: ${rejectionReason}</em></p>` : ""}
<p>We appreciate your time and wish you the best in your career journey.</p>`
    : targetStage === "offer"
    ? `<p>Dear <strong>{{candidateName}}</strong>,</p>
<p>We are pleased to inform you that <strong>{{companyName}}</strong> has extended an offer for the <strong>{{jobTitle}}</strong> position.</p>
<p>Please log in to your MPLOYEDIN dashboard to review the offer details.</p>`
    : targetStage === "selected"
    ? `<p>Dear <strong>{{candidateName}}</strong>,</p>
<p>Congratulations! You have been selected for the <strong>{{jobTitle}}</strong> position at <strong>{{companyName}}</strong>.</p>
<p>We will be in touch shortly with the next steps.</p>`
    : targetStage === "shortlisted"
    ? `<p>Dear <strong>{{candidateName}}</strong>,</p>
<p>Great news! Your application for <strong>{{jobTitle}}</strong> at <strong>{{companyName}}</strong> has been shortlisted.</p>
<p>The hiring team will review your profile further and contact you regarding the next steps.</p>`
    : `<p>Dear <strong>{{candidateName}}</strong>,</p>
<p>We have an update regarding your application for <strong>{{jobTitle}}</strong> at <strong>{{companyName}}</strong>.</p>
<p>Your application status has been updated to: <strong>{{status}}</strong>.</p>`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [customized, setCustomized] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-2xl w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="heading-section font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-status-applied" />
            {action === "send_message" ? "Send Bulk Email" : `${statusLabel} — Email Preview`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {action === "send_message"
              ? `Send email to ${candidateCount} candidate${candidateCount > 1 ? "s" : ""}`
              : `This email will be sent to ${candidateCount} candidate${candidateCount > 1 ? "s" : ""} after the status change`}
          </p>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[calc(100vh-240px)] overflow-y-auto">
          <div className="rounded-xl border border-border/60 bg-status-applied-bg/30 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">
              Available placeholders: <code className="text-[11px]">{`{{candidateName}}`}</code> <code className="text-[11px]">{`{{jobTitle}}`}</code> <code className="text-[11px]">{`{{companyName}}`}</code> <code className="text-[11px]">{`{{status}}`}</code>
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email Subject</label>
            <input
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setCustomized(true); }}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-sky-400"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setCustomized(true); }}
              className="w-full h-40 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none font-mono chip-pad"
              maxLength={10000}
            />
          </div>

          {/* Live preview */}
          <div>
            <label className="block text-xs font-medium mb-2">Preview</label>
            <div className="rounded-xl border border-border bg-card text-sm card-pad">
              <div className="border-b border-border pb-2 mb-3">
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="font-medium">{subject.replace(/\{\{jobTitle\}\}/g, jobTitle).replace(/\{\{companyName\}\}/g, "Company")}</p>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(
                    body
                      .replace(/\{\{candidateName\}\}/g, "John Doe")
                      .replace(/\{\{jobTitle\}\}/g, jobTitle)
                      .replace(/\{\{companyName\}\}/g, "Company")
                      .replace(/\{\{status\}\}/g, statusLabel.toLowerCase())
                  ),
                }}
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-between">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
            onClick={() => { setSubject(defaultSubject); setBody(defaultBody); setCustomized(false); }}>
            Reset to Default
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel} className="">Cancel</Button>
            {action !== "send_message" && (
              <Button variant="outline" onClick={() => onConfirm()} disabled={isLoading} className="h-9">
                {isLoading ? "Processing..." : `${statusLabel} Without Email`}
              </Button>
            )}
            <Button
              onClick={() => onConfirm(customized ? { emailSubject: subject, emailBody: body } : { emailSubject: subject, emailBody: body })}
              disabled={isLoading || (!subject.trim() && action === "send_message")}
              className="h-9"
            >
              <Send className="w-3.5 h-3.5 me-1" />
              {isLoading ? "Sending..." : `${action === "send_message" ? "Send" : statusLabel} & Email ${candidateCount}`}
            </Button>
          </div>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="heading-section font-semibold">Schedule Interview</h2>
          <p className="text-sm text-muted-foreground mt-1">Set up the interview details</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <DateTimePicker
            label="Date & Time *"
            value={scheduledAt}
            onChange={setScheduledAt}
            minDate={new Date()}
            placeholder="Pick date & time"
          />
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
              className="w-full h-16 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} className="">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!scheduledAt || submitting} className="">
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-background rounded-lg border border-border shadow-lg max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="heading-section font-semibold">Create Offer</h2>
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
              <DateTimePicker mode="date" value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expires On</label>
              <DateTimePicker mode="date" value={expiresAt} onChange={setExpiresAt} />
              <p className="text-[11px] text-muted-foreground mt-0.5">Default: 7 days</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Benefits</label>
            <textarea value={benefits} onChange={(e) => setBenefits(e.target.value)}
              placeholder="Health insurance, PTO, remote work..."
              maxLength={2000}
              className="w-full h-16 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details for the candidate..."
              maxLength={1000}
              className="w-full h-16 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none chip-pad" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} className="">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!amount || !startDate || submitting} className="">
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
  const t = useTranslations("employerApplications");
  const actionLabels: Record<string, { label: string; color: string }> = {
    "application.created": { label: "Applied", color: "bg-sky-500" },
    "application.status_changed": { label: "Status Changed", color: "bg-amber-500" },
    "application.shortlisted": { label: "Shortlisted", color: "bg-amber-500" },
    "application.interview_scheduled": { label: "Interview Scheduled", color: "bg-purple-500" },
    "application.offer_sent": { label: "Offer Sent", color: "bg-cyan-500" },
    "application.selected": { label: "Selected", color: "bg-emerald-500" },
    "application.rejected": { label: "Rejected", color: "bg-rose-500" },
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

  const timelineTrapRef = useFocusTrap<HTMLDivElement>(true);

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
        ref={timelineTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Activity timeline for ${candidateLabel}`}
        className="absolute inset-y-0 right-0 flex h-dvh min-h-0 w-[92vw] max-w-[460px] flex-col overflow-hidden border-l border-border/60 bg-background shadow-[0_24px_80px_rgba(15,23,42,0.24)] animate-in slide-in-from-right duration-300 sm:w-[520px] sm:max-w-[520px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-gradient-to-br from-slate-50 via-background to-blue-50/70 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 shadow-sm ring-1 ring-primary/10">
                  <History className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Application Activity</p>
                  <h2 className="heading-section truncate font-semibold text-foreground">{candidateLabel}</h2>
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
                    <span className="ml-1.5">{formatDate(new Date(latestEntry.createdAt), { day: "2-digit", month: "short" })}</span>
                  </div>
                )}
              </div>
            </div>

            <Button variant="ghost" size="sm" className="w-9 rounded-full p-0 hover:bg-destructive/10 hover:text-destructive" onClick={onClose} aria-label={t("a11yCloseActivityTimeline")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_28%),linear-gradient(to_bottom,rgba(148,163,184,0.08),transparent_28%)] px-4 py-4 sm:px-5">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 bg-background/80 shadow-sm card-pad">
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
                      <div className="rounded-2xl border border-border/55 bg-background/92 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)] card-pad">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">
                                {info.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(new Date(entry.createdAt), { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(new Date(entry.createdAt), { hour: "2-digit", minute: "2-digit" })}
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
                          <div className="mt-3 rounded-2xl border border-border/45 bg-secondary/65/80 chip-pad">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Updated Fields</p>
                            <div className="grid gap-2">
                              {Object.entries(entry.changes.after).map(([key, val]) => (
                                <div key={key} className="rounded-xl border border-border/35 bg-background/90 text-sm shadow-sm chip-pad">
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
