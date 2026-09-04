"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useConfirm } from "@/hooks/useConfirm";
import {
  Inbox, Sparkles, CalendarDays, CircleCheckBig, RotateCcw, ArrowRight, Clock3, ClipboardCheck,
  CalendarClock, CheckCircle2, XCircle, AlertTriangle, Forward, FileText,
  Send, Ban, Loader2, BookOpen, Search, Filter, ChevronDown, ChevronUp, ChevronRight, X,
  List,
  MoreHorizontal,
} from "lucide-react";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { AIInterviewQuestionsPanel } from "@/components/features/employer/AIInterviewQuestionsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useInterviews, useUpdateInterview, useScheduleNextRound } from "@/hooks/useInterviews";
import { useCreateOffer } from "@/hooks/useOffers";
import { useCreateScorecard } from "@/hooks/useApplications";
import { ScorecardForm } from "@/components/scorecards/ScorecardForm";
import { FeatureGate } from "@/components/shared/FeatureGate";
import type { Interview } from "@/hooks/useInterviews";
import type { ExportColumn } from "@/lib/export";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/lib/formatNumber";
import { formatDateTime as formatIntlDateTime } from "@/lib/ui/intlFormat";

interface AIQuestionsTarget {
  interviewId: string;
  jobTitle: string;
  candidateName: string;
  skills: string[];
  experienceYears: number;
}

type ModalType =
  | { kind: "none" }
  | { kind: "complete"; interview: Interview }
  | { kind: "reschedule"; interview: Interview }
  | { kind: "next-round"; interview: Interview }
  | { kind: "offer"; interview: Interview };

interface PrepBriefResult {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  round: number;
  type: string;
  duration: number;
  candidateSummary: string;
  keyStrengths: string[];
  areasToProbe: string[];
  suggestedQuestions: { question: string; purpose: string; followUp: string }[];
  redFlags: string[];
  interviewStrategy: string;
  timeAllocation: { intro: number; technical: number; behavioral: number; questions: number; closing: number };
}

/**
 * The filter vocabularies, kept beside the selects that offer them so a value
 * arriving from a link, a dashboard tile or a hand-edited URL is checked
 * against the same list the UI can produce.
 */
const INTERVIEW_STATUSES = ["scheduled", "confirmed", "completed", "cancelled"] as const;
const INTERVIEW_TYPES = ["video", "offline", "hybrid"] as const;
const INTERVIEW_OUTCOMES = ["passed", "failed", "hold", "no_show"] as const;
const INTERVIEW_SORT_FIELDS = ["scheduledAt", "createdAt"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

export default function EmployerInterviewsPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("employerInterviews");
  const tc = useTranslations("employerCommon");
  const tn = useTranslations("nav");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  const { can } = usePermissions();
  const [aiTarget, setAiTarget] = useState<AIQuestionsTarget | null>(null);
  const [modal, setModal] = useState<ModalType>({ kind: "none" });
  const [prepBrief, setPrepBrief] = useState<PrepBriefResult | null>(null);
  const [loadingPrepBriefId, setLoadingPrepBriefId] = useState<string | null>(null);
  const [detailInterview, setDetailInterview] = useState<Interview | null>(null);

  // ── Filter state ──────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useUrlFilter("status", "", { allow: INTERVIEW_STATUSES });
  const [search, setSearch] = useUrlFilter("q", "", { debounceMs: 400 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useUrlFilter("type", "", { allow: INTERVIEW_TYPES });
  const [outcomeFilter, setOutcomeFilter] = useUrlFilter("outcome", "", { allow: INTERVIEW_OUTCOMES });
  const [dateFrom, setDateFrom] = useUrlFilter("from", "");
  const [dateTo, setDateTo] = useUrlFilter("to", "");
  const [sortBy, setSortBy] = useUrlFilter("sort", "scheduledAt", { allow: INTERVIEW_SORT_FIELDS });
  const [sortOrder, setSortOrder] = useUrlFilter("dir", "asc", { allow: SORT_ORDERS }) as [
    "asc" | "desc",
    (next: "asc" | "desc") => void,
  ];

  // AI search
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const activeFilterCount = [status, debouncedSearch, typeFilter, outcomeFilter, dateFrom, dateTo].filter(Boolean).length;

  const { data, isLoading: loading, error, refetch } = useInterviews({
    page, limit,
    status: status || undefined,
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
    outcome: outcomeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    sortOrder,
  });
  const updateMutation = useUpdateInterview();
  const nextRoundMutation = useScheduleNextRound();
  const createOfferMutation = useCreateOffer();

  const interviews = data?.interviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const statusCounts = data?.statusCounts ?? {};

  // Deduplicate: per application show only the latest actionable interview,
  // but keep the earlier rounds so the row can expand into a round history.
  const { deduplicatedInterviews, historyByApp } = (() => {
    const bestByApp = new Map<string, Interview>();
    const allByApp = new Map<string, Interview[]>();
    for (const iv of interviews) {
      const appKey = iv.applicationId ?? iv._id;
      allByApp.set(appKey, [...(allByApp.get(appKey) ?? []), iv]);
      const existing = bestByApp.get(appKey);
      if (!existing) {
        bestByApp.set(appKey, iv);
        continue;
      }
      const ivRound = iv.interviewRound ?? 1;
      const exRound = existing.interviewRound ?? 1;
      // Prefer higher round
      if (ivRound > exRound) {
        bestByApp.set(appKey, iv);
      } else if (ivRound === exRound) {
        // Same round: prefer active status over "rescheduled"
        const isIvActive = iv.status !== "rescheduled";
        const isExActive = existing.status !== "rescheduled";
        if (isIvActive && !isExActive) {
          bestByApp.set(appKey, iv);
        }
      }
    }
    const history = new Map<string, Interview[]>();
    for (const [appKey, best] of bestByApp) {
      const prior = (allByApp.get(appKey) ?? [])
        .filter((iv) => iv._id !== best._id && iv.status !== "rescheduled")
        .sort((a, b) => (a.interviewRound ?? 1) - (b.interviewRound ?? 1));
      if (prior.length) history.set(appKey, prior);
    }
    return {
      deduplicatedInterviews: [...bestByApp.values()].filter((iv) => iv.status !== "rescheduled"),
      historyByApp: history,
    };
  })();

  // Stats from API statusCounts (covers ALL records, not just current page)
  const scheduledTotal = (statusCounts.scheduled ?? 0) + (statusCounts.confirmed ?? 0);
  const completedTotal = statusCounts.completed ?? 0;
  const attentionTotal = (statusCounts.rescheduled ?? 0) + (statusCounts.cancelled ?? 0);
  const confirmedTotal = statusCounts.confirmed ?? 0;

  // AI-powered search: parse natural language into filters
  async function handleAiSearch() {
    if (!aiSearchQuery.trim()) return;
    setAiSearching(true);
    try {
      const res = await fetch("/api/ai/interview-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiSearchQuery }),
      });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed.search) setSearch(parsed.search);
        if (parsed.status) setStatus(parsed.status);
        if (parsed.type) setTypeFilter(parsed.type);
        if (parsed.outcome) setOutcomeFilter(parsed.outcome);
        if (parsed.dateFrom) setDateFrom(parsed.dateFrom);
        if (parsed.dateTo) setDateTo(parsed.dateTo);
        setPage(1);
        setFiltersOpen(true);
      } else {
        // Fallback: use query as search text
        setSearch(aiSearchQuery);
        setPage(1);
      }
    } catch {
      // Fallback: use query as text search
      setSearch(aiSearchQuery);
      setPage(1);
    } finally {
      setAiSearching(false);
    }
  }

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: tc("candidate"), key: "jobSeekerId", formatter: (_v, r) => (r as Record<string, any>).jobSeekerId?.fullName ?? tc("candidate") },
    { header: tc("email"), key: "jobSeekerId", formatter: (_v, r) => (r as Record<string, any>).jobSeekerId?.email ?? "—" },
    { header: tc("role"), key: "jobId", formatter: (_v, r) => (r as Record<string, any>).jobId?.title ?? "Untitled role" },
    { header: tc("round"), key: "interviewRound", formatter: (v) => `R${v ?? 1}` },
    { header: tc("type"), key: "type", formatter: (v) => String(v ?? "in-person") },
    { header: tc("scheduled"), key: "scheduledAt", formatter: (v) => v ? formatIntlDateTime(new Date(String(v))) : "—" },
    { header: tc("status"), key: "status", formatter: (v) => String(v ?? "—") },
    { header: tc("outcome"), key: "outcome", formatter: (v) => String(v ?? "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: interviews as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "interviews",
    title: "Interviews",
  });

  function formatDateTime(value: string): { date: string; time: string } {
    const date = new Date(value);
    // An `undefined` locale resolves to the server's locale during SSR and the
    // browser's on the client, which produced a hydration mismatch on every
    // load of this page. Use the route locale, as the rest of the workspace does.
    const dateLocale = locale === "ar" ? "ar-SA" : "en-US";
    return {
      date: date.toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }),
    };
  }

  function getInterviewSkills(interview: Interview): string[] {
    const merged = [
      ...(interview.jobId?.requirements?.skills ?? []),
      ...(interview.jobSeekerId?.skills ?? []),
    ].filter((skill, index, values) => Boolean(skill) && values.indexOf(skill) === index);
    return merged.slice(0, 3);
  }

  function openAIQuestions(iv: Interview) {
    const skills = [
      ...(iv.jobId?.requirements?.skills ?? []),
      ...(iv.jobSeekerId?.skills ?? []),
    ].filter((s, i, a) => a.indexOf(s) === i).slice(0, 15);

    const expYears = iv.jobSeekerId?.experience?.length
      ? iv.jobSeekerId.experience.reduce((acc, e) => {
          if (!e.startDate) return acc;
          const years = (Date.now() - new Date(e.startDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
          return acc + Math.min(years, 30);
        }, 0)
      : (iv.jobId?.requirements?.experienceMin ?? 3);

    setAiTarget({
      interviewId: iv._id,
      jobTitle: iv.jobId?.title ?? "Unknown Role",
      candidateName: iv.jobSeekerId?.fullName ?? "Candidate",
      skills,
      experienceYears: Math.round(expYears),
    });
  }

  function getOutcomeLabel(outcome?: string) {
    switch (outcome) {
      case "passed": return { label: "Passed", color: "text-emerald-700 bg-status-selected-bg border-status-selected/20" };
      case "failed": return { label: "Rejected", color: "text-status-rejected bg-status-rejected-bg border-status-rejected/20" };
      case "hold": return { label: "On Hold", color: "text-status-shortlisted bg-status-shortlisted-bg border-status-shortlisted/20" };
      case "no_show": return { label: "No Show", color: "text-muted-foreground bg-secondary/75 border-border" };
      default: return null;
    }
  }

  async function generatePrepBrief(interviewId: string) {
    setLoadingPrepBriefId(interviewId);
    try {
      const res = await fetch("/api/ai/interview-prep-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Prep brief generation failed");
      }
      const data: PrepBriefResult = await res.json();
      setPrepBrief(data);
    } catch (e) {
      toast.error("We couldn't generate the preparation brief. No brief was saved. Try again.");
    } finally {
      setLoadingPrepBriefId(null);
    }
  }

  const exportCalendar = async () => {
    try {
      const res = await fetch("/api/interviews/export/ical", { credentials: "include" });
      if (!res.ok) {
        toast.error(t("failedExportCalendar"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mployedin-interviews.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("calendarExportFailed"));
    }
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {aiTarget && (
        <AIInterviewQuestionsPanel
          interviewId={aiTarget.interviewId}
          jobTitle={aiTarget.jobTitle}
          candidateName={aiTarget.candidateName}
          skills={aiTarget.skills}
          experienceYears={aiTarget.experienceYears}
          onClose={() => setAiTarget(null)}
        />
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {modal.kind !== "none" && (
        <InterviewActionModal
          modal={modal}
          onClose={() => setModal({ kind: "none" })}
          updateMutation={updateMutation}
          nextRoundMutation={nextRoundMutation}
          createOfferMutation={createOfferMutation}
          locale={locale}
          onOfferCreated={() => router.push(`/${locale}/employer/offers`)}
        />
      )}

      {/* ── Page header (Pattern A: compact workspace) ────────────────── */}
      <WorkspaceHeader
        title={tn("interviews")}
        context={`${formatNumber(deduplicatedInterviews.length, locale)} ${t("active")} · ${formatNumber(total, locale)} ${t("total")}`}
        actions={
          <>
          {/* The calendar left the sidebar; it is a view of this page now. */}
          <ViewToggle
            ariaLabel={t("viewToggleLabel")}
            active="list"
            options={[
              { key: "list", href: `/${locale}/employer/interviews`, label: t("viewList"), icon: List },
              { key: "calendar", href: `/${locale}/employer/calendar`, label: t("viewCalendar"), icon: CalendarDays },
            ]}
          />
          {/* Scorecards left the sidebar: filling one is a step in completing
              an interview, and reading them back belongs beside the interviews
              they came from rather than in a menu of its own. */}
          <Button
            asChild
            variant="outline"
            className="hidden gap-2 rounded-xl px-3 text-sm font-semibold sm:inline-flex sm:px-4"
          >
            <Link href={`/${locale}/employer/scorecards`} aria-label={tn("scorecards")}>
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden lg:inline">{tn("scorecards")}</span>
            </Link>
          </Button>
          {can("interviews", "create") ? (
            <Button
              asChild
              className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4"
            >
              <Link href={`/${locale}/employer/interviews/bulk`} aria-label={t("bulkSchedule")}>
                <span className="hidden sm:inline">{t("bulkSchedule")}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            variant="outline"
            aria-label={t("exportCalendar")}
            className="hidden gap-2 rounded-xl px-3 text-sm font-semibold sm:inline-flex sm:px-4"
            onClick={exportCalendar}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden lg:inline">{t("exportCalendar")}</span>
          </Button>
          {/* Phones: the two secondary actions live in a menu so the title keeps
              its row; tablets show them as icon buttons for the same reason. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label={tn("more")} className="rounded-xl px-3 sm:hidden">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={`/${locale}/employer/scorecards`}>
                  <ClipboardCheck className="me-2 h-4 w-4" />
                  {tn("scorecards")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void exportCalendar(); }}>
                <CalendarDays className="me-2 h-4 w-4" />
                {t("exportCalendar")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
        }
        metrics={([
          { key: "scheduled", label: t("scheduled"), value: scheduledTotal, icon: CalendarDays, tone: "primary" },
          { key: "completed", label: t("completed"), value: completedTotal, icon: CircleCheckBig, tone: "success" },
          { key: "cancelled", label: t("needsAttention"), shortLabel: t("attentionShort"), value: attentionTotal, icon: RotateCcw, tone: "warning" },
          { key: "confirmed", label: t("confirmed"), value: confirmedTotal, icon: Clock3, tone: "info" },
        ] as const).map((m) => ({
          label: m.label,
          shortLabel: "shortLabel" in m ? m.shortLabel : undefined,
          value: formatNumber(m.value, locale),
          icon: m.icon,
          tone: m.tone,
          active: status === m.key,
          // Tap a tile to filter the list by that status; tap again to clear.
          onClick: () => { setStatus(status === m.key ? "" : m.key); setPage(1); },
        }))}
      />

      {/* ── List toolbar — search, Filters and Export sit with the list ──
          No select on this page, so the search shares the phone row with the
          two buttons instead of leaving them stranded on a row of their own. */}
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-search basis-0 sm:basis-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={tc("search")}
            aria-label={tc("search")}
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-background ps-9 pe-9 text-sm shadow-none focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:h-10"
          />
          {search && (
            <button
              type="button"
              aria-label={tc("clearFilters")}
              onClick={() => setSearch("")}
              className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-11 px-2 text-xs text-muted-foreground hover:text-destructive sm:h-10"
            onClick={() => { setStatus(""); setTypeFilter(""); setOutcomeFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
            <X className="h-3 w-3 sm:me-1" /> <span className="hidden sm:inline">{tc("clearFilters")}</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          aria-label={t("filters")}
          className={`h-11 rounded-xl border-border bg-background px-3 text-sm font-semibold sm:h-10 sm:px-4 ${filtersOpen ? "border-primary/30 bg-primary/10 text-primary" : ""}`}
        >
          <Filter className="h-4 w-4 sm:me-2" aria-hidden="true" />
          <span className="hidden sm:inline">{t("filters")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
          {activeFilterCount > 0 ? (
            <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground sm:hidden">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        <TableToolbar
          className="ms-auto"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        />
      </div>

      {/* Expanded filters — a panel of its own under the toolbar */}
      {filtersOpen && (
        <section className="workspace-panel-surface rounded-2xl panel-body">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("statusLabel")}</label>
              <SearchableSelect
                className="w-full"
                options={[
                  { value: "all", label: t("allStatuses") },
                  { value: "scheduled", label: t("scheduledStatus") },
                  { value: "confirmed", label: t("confirmedStatus") },
                  { value: "completed", label: t("completedStatus") },
                  { value: "cancelled", label: t("cancelledStatus") },
                ]}
                value={status || "all"}
                onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}
                placeholder={t("allStatuses")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("typeLabel")}</label>
              <SearchableSelect
                className="w-full"
                options={[
                  { value: "all", label: t("allTypes") },
                  { value: "video", label: t("video") },
                  { value: "offline", label: t("inPerson") },
                  { value: "hybrid", label: t("hybrid") },
                ]}
                value={typeFilter || "all"}
                onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}
                placeholder={t("allTypes")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("outcomeLabel")}</label>
              <SearchableSelect
                className="w-full"
                options={[
                  { value: "all", label: t("allOutcomes") },
                  { value: "passed", label: t("passed") },
                  { value: "failed", label: t("rejected") },
                  { value: "hold", label: t("onHold") },
                  { value: "no_show", label: t("noShow") },
                ]}
                value={outcomeFilter || "all"}
                onValueChange={(v) => { setOutcomeFilter(v === "all" ? "" : v); setPage(1); }}
                placeholder={t("allOutcomes")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("sortBy")}</label>
              <SearchableSelect
                className="w-full"
                options={[
                  { value: "scheduledAt-asc", label: t("dateEarliest") },
                  { value: "scheduledAt-desc", label: t("dateLatest") },
                  { value: "createdAt-desc", label: t("recentlyAdded") },
                ]}
                value={`${sortBy}-${sortOrder}`}
                onValueChange={(v) => {
                  const [field, order] = v.split("-") as [string, "asc" | "desc"];
                  setSortBy(field); setSortOrder(order); setPage(1);
                }}
                placeholder={t("sortBy")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("fromDate")}</label>
              <DateTimePicker
                mode="date"
                value={dateFrom}
                onChange={(v) => { setDateFrom(v); setPage(1); }}
                placeholder={t("fromDate")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("toDate")}</label>
              <DateTimePicker
                mode="date"
                value={dateTo}
                onChange={(v) => { setDateTo(v); setPage(1); }}
                placeholder={t("toDate")}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="me-1 inline h-3 w-3 text-violet-500" /> {t("aiSearch")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiSearchQuery}
                  onChange={(e) => setAiSearchQuery(e.target.value)}
                  placeholder="e.g. &quot;candidates with React skills scheduled next week&quot;"
                  className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiSearchQuery.trim()) {
                      handleAiSearch();
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700"
                  disabled={aiSearching || !aiSearchQuery.trim()}
                  onClick={handleAiSearch}
                >
                  {aiSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Error State ───────────────────────────────────────────────── */}
      {error ? (
        <section className="workspace-panel-surface rounded-3xl border border-destructive/30 panel-body">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-status-rejected">{t("interviewList")}</p>
              <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{tc("somethingWentWrong")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("unableToLoadDesc")}
              </p>
            </div>
            <Button size="lg" className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => void refetch()}>
              {tc("tryAgain")}
            </Button>
          </div>
        </section>
      ) : (
      /* ── Interview Table ──────────────────────────────────────────── */
      <section className="workspace-panel-surface rounded-2xl panel-body">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <h2 className="heading-label font-semibold text-foreground">
            {formatNumber(deduplicatedInterviews.length, locale)} {tn("interviews")}
          </h2>
          {/* Privacy info at the point candidate data is shown, compacted to
              an icon + popover to keep the list above the fold. */}
          <CandidateDataNotice variant="candidateList" compact />
        </div>

        <div className="workspace-subtle-surface mt-3 hidden overflow-x-auto rounded-xl border border-border sm:block">
          <Table>
            <TableHeader>
              <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                <TableHead className="min-w-[220px]">{t("candidate")}</TableHead>
                <TableHead className="min-w-[260px]">{t("role")}</TableHead>
                <TableHead>{t("round")}</TableHead>
                <TableHead>{t("typeLabel")}</TableHead>
                <TableHead>{t("scheduledCol")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("outcomeLabel")}</TableHead>
                <TableHead>{t("ai")}</TableHead>
                {can("interviews", "update") ? <TableHead className="text-right min-w-[280px]">{t("actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: can("interviews", "update") ? 9 : 8 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : deduplicatedInterviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={can("interviews", "update") ? 9 : 8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="workspace-tone-sky flex h-14 w-14 items-center justify-center rounded-3xl">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{t("noInterviews")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : deduplicatedInterviews.map((iv) => {
                const scheduled = formatDateTime(iv.scheduledAt);
                const skills = getInterviewSkills(iv);
                const outcomeMeta = getOutcomeLabel(iv.outcome);
                const round = iv.interviewRound ?? 1;
                const isScheduled = iv.status === "scheduled" || iv.status === "confirmed";
                const isCompleted = iv.status === "completed";
                const isPassed = isCompleted && iv.outcome === "passed";

                return (
                  <TableRow key={iv._id} className="hover:bg-secondary/50">
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{iv.jobSeekerId?.fullName ?? "Candidate"}</p>
                        <p className="text-xs text-muted-foreground">{iv.jobSeekerId?.email ?? "No email available"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">{iv.jobId?.title ?? "Untitled role"}</p>
                        {skills.length ? (
                          <div className="flex flex-wrap gap-2">
                            {skills.map((skill) => (
                              <span key={skill} className="workspace-muted-pill rounded-full px-2.5 py-1 text-[11px] font-medium">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-interview-bg px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-status-interview/20">
                        R{round}
                      </span>
                      {(() => {
                        const prior = historyByApp.get(iv.applicationId ?? iv._id);
                        if (!prior?.length) return null;
                        return (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                              {t("priorRounds", { count: prior.length })}
                            </summary>
                            <ul className="mt-1 space-y-1">
                              {prior.map((p) => {
                                const pOutcome = getOutcomeLabel(p.outcome);
                                return (
                                  <li key={p._id} className="text-[11px] text-muted-foreground">
                                    R{p.interviewRound ?? 1} · {formatDateTime(p.scheduledAt).date} · {pOutcome?.label ?? p.status}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{iv.type ?? "in-person"}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>{scheduled.date}</p>
                        <p className="text-xs text-muted-foreground">{scheduled.time}</p>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={iv.status} /></TableCell>
                    <TableCell>
                      {outcomeMeta ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeMeta.color}`}>
                          {outcomeMeta.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="dense"
                          className="rounded-xl px-3 text-xs font-semibold text-status-applied hover:bg-status-applied-bg hover:text-sky-800"
                          onClick={() => openAIQuestions(iv)}
                          title="Generate AI interview questions"
                        >
                          <Sparkles className="me-1 h-3.5 w-3.5" />
                          {t("questions")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="dense"
                          className="rounded-xl px-3 text-xs font-semibold text-status-interview hover:bg-status-interview-bg hover:text-violet-800"
                          onClick={() => generatePrepBrief(iv._id)}
                          disabled={loadingPrepBriefId === iv._id}
                          title={t("prepBrief")}
                        >
                          {loadingPrepBriefId === iv._id ? (
                            <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BookOpen className="me-1 h-3.5 w-3.5" />
                          )}
                          {t("prepBrief")}
                        </Button>
                      </div>
                    </TableCell>
                    {can("interviews", "update") ? (
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {/* Scheduled/Confirmed → Complete, Reschedule, Cancel */}
                          {isScheduled && (
                            <>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-status-selected-bg"
                                onClick={() => setModal({ kind: "complete", interview: iv })}>
                                <CheckCircle2 className="me-1 h-3 w-3" />
                                {t("complete")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-status-applied hover:bg-status-applied-bg"
                                onClick={() => setModal({ kind: "reschedule", interview: iv })}>
                                <CalendarClock className="me-1 h-3 w-3" />
                                {t("reschedule")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-status-rejected hover:bg-status-rejected-bg"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: t("cancelAction"),
                                    message: `${t("cancelConfirm")} ${iv.jobSeekerId?.fullName ?? t("thisCandidate")}?`,
                                    confirmLabel: t("cancelAction"),
                                    variant: "destructive",
                                  });
                                  if (ok) {
                                    updateMutation.mutate({ id: iv._id, status: "cancelled" });
                                  }
                                }}>
                                <Ban className="me-1 h-3 w-3" />
                                {t("cancelAction")}
                              </Button>
                            </>
                          )}

                          {/* Completed + Passed → Next Round, Make Offer */}
                          {isPassed && (
                            <>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-indigo-700 hover:bg-status-interview-bg"
                                onClick={() => setModal({ kind: "next-round", interview: iv })}>
                                <Forward className="me-1 h-3 w-3" />
                                {t("nextRound")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-status-selected-bg"
                                onClick={() => setModal({ kind: "offer", interview: iv })}>
                                <FileText className="me-1 h-3 w-3" />
                                {t("makeOffer")}
                              </Button>
                            </>
                          )}

                          {/* Completed but no outcome yet → show "Set Outcome" */}
                          {isCompleted && !iv.outcome && (
                            <Button variant="ghost" size="sm"
                              className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-status-shortlisted hover:bg-status-shortlisted-bg"
                              onClick={() => setModal({ kind: "complete", interview: iv })}>
                              <AlertTriangle className="me-1 h-3 w-3" />
                              {t("setOutcome")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Compact mobile cards — the generic table→card CSS turned every field
            (Candidate/Role/Round/Type/Scheduled/Status/Outcome/AI/Actions) into
            its own bordered row, making each interview a very tall stacked card.
            This mirrors the candidate list's compact-row + detail-popup pattern. */}
        <div className="mt-5 space-y-2.5 sm:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))
          ) : deduplicatedInterviews.length === 0 ? (
            <div className="workspace-subtle-surface flex flex-col items-center gap-3 rounded-3xl border border-border px-4 py-12 text-center">
              <div className="workspace-tone-sky flex h-14 w-14 items-center justify-center rounded-3xl">
                <Inbox className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{t("noInterviews")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
              </div>
            </div>
          ) : deduplicatedInterviews.map((iv) => {
            const scheduled = formatDateTime(iv.scheduledAt);
            const round = iv.interviewRound ?? 1;
            return (
              <div
                key={iv._id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailInterview(iv)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDetailInterview(iv);
                  }
                }}
                className="workspace-subtle-surface card-pad flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border text-left transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/75 text-sm font-semibold text-foreground">
                  {(iv.jobSeekerId?.fullName ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-semibold text-foreground">{iv.jobSeekerId?.fullName ?? "Candidate"}</p>
                  <p className="truncate text-xs text-muted-foreground">{iv.jobId?.title ?? "Untitled role"}</p>
                  <p className="text-xs text-muted-foreground">R{round} · <span className="capitalize">{iv.type ?? "in-person"}</span> · {scheduled.date}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={iv.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        // Rounds are collapsed into one row per application, so the raw page
        // size would over-report what is actually on screen.
        shown={deduplicatedInterviews.length}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />

      {/* ── Mobile Interview Detail Popup ───────────────────────────────
          Tapping a compact card opens the full field set + stage actions
          here instead of stacking them into the card itself. */}
      <Dialog open={Boolean(detailInterview)} onOpenChange={(open) => { if (!open) setDetailInterview(null); }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-3xl border-border bg-background p-0">
          {detailInterview && (() => {
            const iv = detailInterview;
            const scheduled = formatDateTime(iv.scheduledAt);
            const skills = getInterviewSkills(iv);
            const outcomeMeta = getOutcomeLabel(iv.outcome);
            const round = iv.interviewRound ?? 1;
            const isScheduled = iv.status === "scheduled" || iv.status === "confirmed";
            const isCompleted = iv.status === "completed";
            const isPassed = isCompleted && iv.outcome === "passed";
            const prior = historyByApp.get(iv.applicationId ?? iv._id);

            return (
              <>
                <DialogHeader className="border-b border-border px-5 py-4">
                  <DialogTitle className="text-lg font-semibold">{iv.jobSeekerId?.fullName ?? "Candidate"}</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    {iv.jobSeekerId?.email ?? "No email available"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("role")}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{iv.jobId?.title ?? "Untitled role"}</p>
                    {skills.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {skills.map((skill) => (
                          <span key={skill} className="workspace-muted-pill rounded-full px-2.5 py-1 text-[11px] font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("round")}</p>
                      <p className="mt-1 font-medium text-foreground">R{round}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("typeLabel")}</p>
                      <p className="mt-1 font-medium capitalize text-foreground">{iv.type ?? "in-person"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("scheduledCol")}</p>
                      <p className="mt-1 font-medium text-foreground">{scheduled.date}</p>
                      <p className="text-xs text-muted-foreground">{scheduled.time}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("status")}</p>
                      <div className="mt-1"><StatusBadge status={iv.status} /></div>
                    </div>
                  </div>

                  {outcomeMeta && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("outcomeLabel")}</p>
                      <span className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeMeta.color}`}>
                        {outcomeMeta.label}
                      </span>
                    </div>
                  )}

                  {prior?.length ? (
                    <details>
                      <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground hover:text-foreground">
                        {t("priorRounds", { count: prior.length })}
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {prior.map((p) => {
                          const pOutcome = getOutcomeLabel(p.outcome);
                          return (
                            <li key={p._id} className="text-xs text-muted-foreground">
                              R{p.interviewRound ?? 1} · {formatDateTime(p.scheduledAt).date} · {pOutcome?.label ?? p.status}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ) : null}

                  <div className="flex gap-2 border-t border-border pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl text-xs font-semibold text-status-applied"
                      onClick={() => { openAIQuestions(iv); setDetailInterview(null); }}
                    >
                      <Sparkles className="me-1.5 h-3.5 w-3.5" />
                      {t("questions")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl text-xs font-semibold text-status-interview"
                      disabled={loadingPrepBriefId === iv._id}
                      onClick={() => generatePrepBrief(iv._id)}
                    >
                      {loadingPrepBriefId === iv._id ? (
                        <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BookOpen className="me-1.5 h-3.5 w-3.5" />
                      )}
                      {t("prepBrief")}
                    </Button>
                  </div>

                  {can("interviews", "update") && (isScheduled || isPassed || (isCompleted && !iv.outcome)) && (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                      {isScheduled && (
                        <>
                          <Button size="sm" className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                            onClick={() => { setModal({ kind: "complete", interview: iv }); setDetailInterview(null); }}>
                            <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
                            {t("complete")}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-xl px-3 text-xs font-semibold"
                            onClick={() => { setModal({ kind: "reschedule", interview: iv }); setDetailInterview(null); }}>
                            <CalendarClock className="me-1.5 h-3.5 w-3.5" />
                            {t("reschedule")}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-xl border-destructive/30 px-3 text-xs font-semibold text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: t("cancelAction"),
                                message: `${t("cancelConfirm")} ${iv.jobSeekerId?.fullName ?? t("thisCandidate")}?`,
                                confirmLabel: t("cancelAction"),
                                variant: "destructive",
                              });
                              if (ok) {
                                updateMutation.mutate({ id: iv._id, status: "cancelled" });
                                setDetailInterview(null);
                              }
                            }}>
                            <Ban className="me-1.5 h-3.5 w-3.5" />
                            {t("cancelAction")}
                          </Button>
                        </>
                      )}
                      {isPassed && (
                        <>
                          <Button size="sm" className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                            onClick={() => { setModal({ kind: "next-round", interview: iv }); setDetailInterview(null); }}>
                            <Forward className="me-1.5 h-3.5 w-3.5" />
                            {t("nextRound")}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-xl px-3 text-xs font-semibold"
                            onClick={() => { setModal({ kind: "offer", interview: iv }); setDetailInterview(null); }}>
                            <FileText className="me-1.5 h-3.5 w-3.5" />
                            {t("makeOffer")}
                          </Button>
                        </>
                      )}
                      {isCompleted && !iv.outcome && (
                        <Button size="sm" className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          onClick={() => { setModal({ kind: "complete", interview: iv }); setDetailInterview(null); }}>
                          <AlertTriangle className="me-1.5 h-3.5 w-3.5" />
                          {t("setOutcome")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── AI Prep Brief Dialog ──────────────────────────────────────── */}
      <Dialog open={Boolean(prepBrief)} onOpenChange={(open) => { if (!open) setPrepBrief(null); }}>
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col rounded-3xl border-border bg-background p-0">
          {prepBrief && (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-violet-500" />
                  <DialogTitle className="text-lg font-semibold">{t("interviewPrepBrief")}</DialogTitle>
                </div>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {prepBrief.candidateName} — {prepBrief.jobTitle} (Round {prepBrief.round}, {prepBrief.duration}min {prepBrief.type})
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {/* Candidate Summary */}
                <div className="workspace-glass-panel card-pad rounded-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("candidateSummary")}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{prepBrief.candidateSummary}</p>
                </div>

                {/* Strategy */}
                <div className="workspace-glass-panel card-pad rounded-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("interviewStrategy")}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{prepBrief.interviewStrategy}</p>
                </div>

                {/* Time Allocation */}
                {prepBrief.timeAllocation && (
                  <div className="workspace-glass-panel card-pad rounded-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("timeAllocation")} ({prepBrief.duration} {t("min")})</p>
                    <div className="mt-3 flex gap-1.5">
                      {Object.entries(prepBrief.timeAllocation).map(([key, mins]) => (
                        <div
                          key={key}
                          className="flex flex-1 flex-col items-center rounded-xl bg-status-interview-bg p-2"
                          style={{ flex: mins }}
                        >
                          <span className="text-lg font-semibold text-status-interview">{mins}m</span>
                          <span className="text-[11px] capitalize text-muted-foreground">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Key Strengths */}
                  <div className="rounded-2xl border border-status-selected/20 bg-status-selected-bg/60 card-pad">
                    <p className="text-xs font-semibold text-emerald-700">{t("keyStrengths")}</p>
                    <ul className="mt-2 space-y-1.5">
                      {prepBrief.keyStrengths.map((s) => (
                        <li key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Areas to Probe */}
                  <div className="rounded-2xl border border-status-shortlisted/20 bg-status-shortlisted-bg/60 card-pad">
                    <p className="text-xs font-semibold text-status-shortlisted">{t("areasToProbe")}</p>
                    <ul className="mt-2 space-y-1.5">
                      {prepBrief.areasToProbe.map((a) => (
                        <li key={a} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Suggested Questions */}
                <div className="workspace-glass-panel card-pad rounded-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("suggestedQuestions")}</p>
                  <div className="mt-3 space-y-3">
                    {prepBrief.suggestedQuestions.map((q, i) => (
                      <div key={i} className="rounded-xl border border-border bg-background/60 chip-pad">
                        <p className="text-sm font-medium text-foreground">{i + 1}. {q.question}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Purpose:</span> {q.purpose}</p>
                        <p className="text-xs text-muted-foreground"><span className="font-semibold">Follow-up:</span> {q.followUp}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Red Flags */}
                {prepBrief.redFlags.length > 0 && (
                  <div className="rounded-2xl border border-status-rejected/20 bg-status-rejected-bg/60 card-pad">
                    <p className="text-xs font-semibold text-rose-700">{t("redFlags")}</p>
                    <ul className="mt-2 space-y-1.5">
                      {prepBrief.redFlags.map((r) => (
                        <li key={r} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Interview Action Modal – handles Complete, Reschedule, Next Round, Offer
   ══════════════════════════════════════════════════════════════════════ */

function InterviewActionModal({
  modal,
  onClose,
  updateMutation,
  nextRoundMutation,
  createOfferMutation,
  locale,
  onOfferCreated,
}: {
  modal: Exclude<ModalType, { kind: "none" }>;
  onClose: () => void;
  updateMutation: ReturnType<typeof useUpdateInterview>;
  nextRoundMutation: ReturnType<typeof useScheduleNextRound>;
  createOfferMutation: ReturnType<typeof useCreateOffer>;
  locale: string;
  onOfferCreated: () => void;
}) {
  const t = useTranslations("employerInterviews");
  const tc = useTranslations("employerCommon");
  const [outcome, setOutcome] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(45);
  const [type, setType] = useState<string>("video");
  const [location, setLocation] = useState("");
  const [meetLink, setMeetLink] = useState("");

  // FG-8: structured scorecard capture as part of interview completion.
  const createScorecard = useCreateScorecard();
  const [showScorecard, setShowScorecard] = useState(false);

  // Offer fields
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("AED");
  const [salaryPeriod, setSalaryPeriod] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [benefits, setBenefits] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const iv = modal.interview;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      if (modal.kind === "complete") {
        if (!outcome) { setSubmitError(t("selectOutcome")); setSubmitting(false); return; }
        await updateMutation.mutateAsync({
          id: iv._id,
          status: "completed",
          outcome,
          feedback: feedback || undefined,
        });
        // FG-8: after the interview is marked completed, offer a structured
        // scorecard (per-competency rubric) instead of closing immediately.
        setSubmitting(false);
        setShowScorecard(true);
        return;
      } else if (modal.kind === "reschedule") {
        if (!scheduledAt) { setSubmitError(t("selectDateTime")); setSubmitting(false); return; }
        // Update interview in-place — no duplicate creation
        await updateMutation.mutateAsync({
          id: iv._id,
          scheduledAt: new Date(scheduledAt).toISOString(),
          duration,
          type,
          location: type !== "video" ? (location || undefined) : undefined,
          meetLink: type !== "offline" ? (meetLink || undefined) : undefined,
        });
      } else if (modal.kind === "next-round") {
        if (!scheduledAt) { setSubmitError(t("selectDateTime")); setSubmitting(false); return; }
        await nextRoundMutation.mutateAsync({
          interviewId: iv._id,
          scheduledAt: new Date(scheduledAt).toISOString(),
          duration,
          type,
          location: type !== "video" ? (location || undefined) : undefined,
          meetLink: type !== "offline" ? (meetLink || undefined) : undefined,
        });
      } else if (modal.kind === "offer") {
        if (!salaryAmount || !startDate) { setSubmitError(t("salaryStartRequired")); setSubmitting(false); return; }
        await createOfferMutation.mutateAsync({
          applicationId: iv.applicationId!,
          salary: { amount: Number(salaryAmount), currency: salaryCurrency, period: salaryPeriod },
          startDate: new Date(startDate).toISOString(),
          benefits: benefits || undefined,
          notes: offerNotes || undefined,
        });
        onClose();
        onOfferCreated();
        return;
      }
      onClose();
    } catch (e) {
      setSubmitError(tc("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }, [modal, iv, outcome, feedback, scheduledAt, duration, type, location, meetLink,
      salaryAmount, salaryCurrency, salaryPeriod, startDate, benefits, offerNotes,
      updateMutation, nextRoundMutation, createOfferMutation, onClose, onOfferCreated]);

  const handleScorecardSubmit = useCallback(async (data: {
    scores: {
      technicalSkills: number;
      communication: number;
      cultureFit: number;
      problemSolving: number;
      motivation: number;
    };
    recommendation: string;
    notes?: string;
    strengths?: string;
    concerns?: string;
  }) => {
    try {
      await createScorecard.mutateAsync({ interviewId: iv._id, ...data });
      toast.success(t("scorecardSaved"));
      onClose();
    } catch {
      setSubmitError(tc("somethingWentWrong"));
    }
  }, [createScorecard, iv._id, onClose, t, tc]);

  const title = {
    complete: t("completeTitle"),
    reschedule: t("rescheduleTitle"),
    "next-round": `${t("scheduleRound")} ${(iv.interviewRound ?? 1) + 1}`,
    offer: t("makeOfferTitle"),
  }[modal.kind];

  const isScheduleForm = modal.kind === "reschedule" || modal.kind === "next-round";

  // FG-8: scorecard capture step shown after a completion is saved.
  if (showScorecard) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 py-8 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="mx-4 w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-6 py-4">
            <h3 className="heading-subsection font-semibold text-foreground">{t("scorecardStepTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {iv.jobSeekerId?.fullName ?? t("candidate")} · {iv.jobId?.title ?? t("role")} · {t("round")} {iv.interviewRound ?? 1}
            </p>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-6 py-4">
            <FeatureGate
              feature="scorecardEvaluations"
              fallback={
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("scorecardSkipNote")}</p>
                  <Button onClick={onClose} className="rounded-xl px-5 text-sm">{tc("done")}</Button>
                </div>
              }
            >
              <ScorecardForm
                interviewId={iv._id}
                onSubmit={handleScorecardSubmit}
                onCancel={onClose}
                isLoading={createScorecard.isPending}
              />
            </FeatureGate>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl panel-body">
        <div className="mb-5">
          <h3 className="heading-subsection font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {iv.jobSeekerId?.fullName ?? t("candidate")} · {iv.jobId?.title ?? t("role")} · {t("round")} {iv.interviewRound ?? 1}
          </p>
        </div>

        <div className="space-y-4">
          {/* Complete: Outcome selection */}
          {modal.kind === "complete" && (
            <>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("interviewOutcome")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "passed", label: t("passedMoveForward"), icon: CheckCircle2, color: "border-status-selected/20 bg-status-selected-bg text-emerald-700" },
                    { value: "failed", label: t("rejected"), icon: XCircle, color: "border-status-rejected/20 bg-status-rejected-bg text-status-rejected" },
                    { value: "hold", label: t("onHold"), icon: Clock3, color: "border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted" },
                    { value: "no_show", label: t("noShow"), icon: AlertTriangle, color: "border-border bg-secondary/75 text-muted-foreground" },
                  ].map(({ value, label, icon: Icon, color }) => (
                    <button key={value}
                      onClick={() => setOutcome(value)}
                      className={`flex items-center gap-2 rounded-xl border-2 text-left text-sm font-medium transition-all ${outcome === value ? color : "border-border bg-background text-muted-foreground hover:border-primary/30"} chip-pad`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("feedbackOptional")}</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="w-full rounded-xl border border-border bg-background text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary chip-pad"
                  placeholder={t("feedbackPlaceholder")}
                />
              </div>
            </>
          )}

          {/* Schedule form: for Reschedule and Next Round */}
          {isScheduleForm && (
            <>
              <DateTimePicker
                label={t("dateTime")}
                value={scheduledAt}
                onChange={setScheduledAt}
                minDate={new Date()}
                placeholder={t("pickDateTime")}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("durationMin")}</label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger className="h-auto rounded-xl py-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60, 90, 120].map((d) => (
                        <SelectItem key={d} value={String(d)}>{d} {t("min")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("typeLabel")}</label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-auto rounded-xl py-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">{t("video")}</SelectItem>
                      <SelectItem value="offline">{t("inPerson")}</SelectItem>
                      <SelectItem value="hybrid">{t("hybrid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("locationMeetLink")}</label>
                <input
                  type="text"
                  value={type === "video" ? meetLink : location}
                  onChange={(e) => type === "video" ? setMeetLink(e.target.value) : setLocation(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary chip-pad"
                  placeholder={type === "video" ? t("meetLinkPlaceholder") : t("officePlaceholder")}
                />
                {(type === "video" || type === "hybrid") && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMeetLink(`https://meet.jit.si/Mployedin-${crypto.randomUUID().slice(0, 12)}`)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("generateMeetLink")}
                    </button>
                    <span className="text-xs text-muted-foreground">{t("meetLinkAutoNote")}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Offer form */}
          {modal.kind === "offer" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("salary")}</label>
                  <input type="number" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 chip-pad"
                    placeholder={t("salaryPlaceholder")} min="0" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("currency")}</label>
                  <Select value={salaryCurrency} onValueChange={setSalaryCurrency}>
                    <SelectTrigger className="h-auto rounded-xl py-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["AED", "USD", "INR", "SAR", "QAR", "EUR", "GBP"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("period")}</label>
                  <Select value={salaryPeriod} onValueChange={setSalaryPeriod}>
                    <SelectTrigger className="h-auto rounded-xl py-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("monthly")}</SelectItem>
                      <SelectItem value="annually">{t("annually")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("startDate")}</label>
                <DateTimePicker
                  mode="date"
                  value={startDate}
                  onChange={setStartDate}
                  minDate={new Date()}
                  placeholder={t("startDate")}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("benefitsOptional")}</label>
                <textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-xl border border-border bg-background text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 chip-pad"
                  placeholder={t("benefitsPlaceholder")} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("notesOptional")}</label>
                <textarea value={offerNotes} onChange={(e) => setOfferNotes(e.target.value)} rows={2} maxLength={1000}
                  className="w-full rounded-xl border border-border bg-background text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 chip-pad"
                  placeholder={t("notesPlaceholder")} />
              </div>
            </>
          )}

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {submitError}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="rounded-xl px-4 text-sm">
            {tc("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {modal.kind === "complete" ? t("saveOutcome") :
             modal.kind === "reschedule" ? t("reschedule") :
             modal.kind === "next-round" ? t("scheduleNextRound") :
             t("sendOffer")}
          </Button>
        </div>
      </div>
    </div>
  );
}
