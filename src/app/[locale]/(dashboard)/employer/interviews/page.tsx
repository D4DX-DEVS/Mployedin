"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  Inbox, Sparkles, CalendarDays, CircleCheckBig, RotateCcw, ArrowRight, Clock3,
  CalendarClock, CheckCircle2, XCircle, AlertTriangle, Forward, FileText,
  Send, Ban, Loader2, BookOpen, Search, Filter, ChevronDown, ChevronUp, X,
} from "lucide-react";
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
import { formatNumber } from "@/lib/formatNumber";

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

export default function EmployerInterviewsPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("employerInterviews");
  const tc = useTranslations("employerCommon");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { can } = usePermissions();
  const [aiTarget, setAiTarget] = useState<AIQuestionsTarget | null>(null);
  const [modal, setModal] = useState<ModalType>({ kind: "none" });
  const [prepBrief, setPrepBrief] = useState<PrepBriefResult | null>(null);
  const [loadingPrepBriefId, setLoadingPrepBriefId] = useState<string | null>(null);

  // ── Filter state ──────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("scheduledAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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

  // Deduplicate: per application show only the latest actionable interview
  const deduplicatedInterviews = (() => {
    const bestByApp = new Map<string, Interview>();
    for (const iv of interviews) {
      const appKey = iv.applicationId ?? iv._id;
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
    return [...bestByApp.values()].filter((iv) => iv.status !== "rescheduled");
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
    { header: "Candidate", key: "jobSeekerId", formatter: (_v, r) => (r as Record<string, any>).jobSeekerId?.fullName ?? "Candidate" },
    { header: "Email", key: "jobSeekerId", formatter: (_v, r) => (r as Record<string, any>).jobSeekerId?.email ?? "—" },
    { header: "Role", key: "jobId", formatter: (_v, r) => (r as Record<string, any>).jobId?.title ?? "Untitled role" },
    { header: "Round", key: "interviewRound", formatter: (v) => `R${v ?? 1}` },
    { header: "Type", key: "type", formatter: (v) => String(v ?? "in-person") },
    { header: "Scheduled", key: "scheduledAt", formatter: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
    { header: "Status", key: "status", formatter: (v) => String(v ?? "—") },
    { header: "Outcome", key: "outcome", formatter: (v) => String(v ?? "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: interviews as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "interviews",
    title: "Interviews",
  });

  function formatDateTime(value: string): { date: string; time: string } {
    const date = new Date(value);
    return {
      date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
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
      case "passed": return { label: "Passed", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
      case "failed": return { label: "Rejected", color: "text-red-700 bg-red-50 border-red-200" };
      case "hold": return { label: "On Hold", color: "text-amber-700 bg-amber-50 border-amber-200" };
      case "no_show": return { label: "No Show", color: "text-gray-700 bg-gray-50 border-gray-200" };
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
      toast.error(e instanceof Error ? e.message : "Prep brief generation failed. Please retry.");
    } finally {
      setLoadingPrepBriefId(null);
    }
  }

  return (
    <div className="page-container employer-legacy-surface space-y-6">
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

      {/* ── Hero Section ──────────────────────────────────────────────── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("title")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("subtitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currentView")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(deduplicatedInterviews.length, locale)} {t("active")} · {formatNumber(total, locale)} {t("total")}</p>
              <p className="text-xs text-muted-foreground">{t("activeDesc")} {t("totalDesc")}</p>
            </div>
            {can("interviews", "create") ? (
              <Button
                asChild
                className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Link href={`/${locale}/employer/interviews/bulk`}>
                  {t("bulkSchedule")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11 gap-2 rounded-xl px-4 text-sm font-semibold"
              onClick={async () => {
                try {
                  const res = await fetch("/api/interviews/export/ical", { credentials: "include" });
                  if (!res.ok) {
                    toast.error("Failed to export calendar");
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
                  toast.error("Calendar export failed");
                }
              }}
            >
              <CalendarDays className="h-4 w-4" />
              {t("exportCalendar")}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: t("scheduled"), value: scheduledTotal, note: t("scheduledDesc"), icon: CalendarDays, tone: "text-sky-600", chip: "bg-sky-50" },
            { label: t("completed"), value: completedTotal, note: t("completedDesc"), icon: CircleCheckBig, tone: "text-emerald-600", chip: "bg-emerald-50" },
            { label: t("needsAttention"), value: attentionTotal, note: t("needsAttentionDesc"), icon: RotateCcw, tone: "text-amber-600", chip: "bg-amber-50" },
            { label: t("confirmed"), value: confirmedTotal, note: t("confirmedDesc"), icon: Clock3, tone: "text-violet-600", chip: "bg-violet-50" },
          ].map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{formatNumber(value, locale)}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Filter Section ────────────────────────────────────────────── */}
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        {/* Search + Toggle */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={tc("search")}
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => { setStatus(""); setTypeFilter(""); setOutcomeFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
                <X className="me-1 h-3 w-3" /> {tc("clearFilters")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl text-xs font-medium"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="h-3.5 w-3.5" />
              {t("filters")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Expanded filters */}
        {filtersOpen && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("toDate")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
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
        )}
      </section>

      {/* ── Error State ───────────────────────────────────────────────── */}
      {error ? (
        <section className="workspace-panel-surface rounded-[28px] border border-destructive/30 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">{t("interviewList")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{tc("somethingWentWrong")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : "The interview workspace could not load. Try again in a moment."}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              {tc("tryAgain")}
            </Button>
          </div>
        </section>
      ) : (
      /* ── Interview Table ──────────────────────────────────────────── */
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("interviewList")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("description")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("tableDesc")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{deduplicatedInterviews.length} {t("interviewsOnPage")}</p>
        </div>

        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />

        <div className="workspace-subtle-surface mt-5 overflow-x-auto rounded-3xl border border-border">
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
                        R{round}
                      </span>
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
                          size="sm"
                          className="h-8 rounded-xl px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                          onClick={() => openAIQuestions(iv)}
                          title="Generate AI interview questions"
                        >
                          <Sparkles className="me-1 h-3.5 w-3.5" />
                          {t("questions")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-xl px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 hover:text-violet-800"
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
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setModal({ kind: "complete", interview: iv })}>
                                <CheckCircle2 className="me-1 h-3 w-3" />
                                {t("complete")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                                onClick={() => setModal({ kind: "reschedule", interview: iv })}>
                                <CalendarClock className="me-1 h-3 w-3" />
                                {t("reschedule")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
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
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                                onClick={() => setModal({ kind: "next-round", interview: iv })}>
                                <Forward className="me-1 h-3 w-3" />
                                {t("nextRound")}
                              </Button>
                              <Button variant="ghost" size="sm"
                                className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setModal({ kind: "offer", interview: iv })}>
                                <FileText className="me-1 h-3 w-3" />
                                {t("makeOffer")}
                              </Button>
                            </>
                          )}

                          {/* Completed but no outcome yet → show "Set Outcome" */}
                          {isCompleted && !iv.outcome && (
                            <Button variant="ghost" size="sm"
                              className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
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
      </section>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />

      {/* ── AI Prep Brief Dialog ──────────────────────────────────────── */}
      <Dialog open={Boolean(prepBrief)} onOpenChange={(open) => { if (!open) setPrepBrief(null); }}>
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col rounded-[24px] border-border bg-background p-0">
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
                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("candidateSummary")}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{prepBrief.candidateSummary}</p>
                </div>

                {/* Strategy */}
                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("interviewStrategy")}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{prepBrief.interviewStrategy}</p>
                </div>

                {/* Time Allocation */}
                {prepBrief.timeAllocation && (
                  <div className="workspace-glass-panel rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("timeAllocation")} ({prepBrief.duration} {t("min")})</p>
                    <div className="mt-3 flex gap-1.5">
                      {Object.entries(prepBrief.timeAllocation).map(([key, mins]) => (
                        <div
                          key={key}
                          className="flex flex-1 flex-col items-center rounded-xl bg-violet-50 p-2 dark:bg-violet-500/10"
                          style={{ flex: mins }}
                        >
                          <span className="text-lg font-semibold text-violet-700 dark:text-violet-300">{mins}m</span>
                          <span className="text-[10px] capitalize text-muted-foreground">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Key Strengths */}
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t("keyStrengths")}</p>
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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("areasToProbe")}</p>
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
                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("suggestedQuestions")}</p>
                  <div className="mt-3 space-y-3">
                    {prepBrief.suggestedQuestions.map((q, i) => (
                      <div key={i} className="rounded-xl border border-border bg-background/60 p-3">
                        <p className="text-sm font-medium text-foreground">{i + 1}. {q.question}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Purpose:</span> {q.purpose}</p>
                        <p className="text-xs text-muted-foreground"><span className="font-semibold">Follow-up:</span> {q.followUp}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Red Flags */}
                {prepBrief.redFlags.length > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t("redFlags")}</p>
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
      setSubmitError(e instanceof Error ? e.message : tc("somethingWentWrong"));
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
            <h3 className="text-lg font-semibold text-foreground">{t("scorecardStepTitle")}</h3>
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
                  <Button onClick={onClose} className="h-10 rounded-xl px-5 text-sm">{tc("done")}</Button>
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
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
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
                    { value: "passed", label: t("passedMoveForward"), icon: CheckCircle2, color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
                    { value: "failed", label: t("rejected"), icon: XCircle, color: "border-red-300 bg-red-50 text-red-700" },
                    { value: "hold", label: t("onHold"), icon: Clock3, color: "border-amber-300 bg-amber-50 text-amber-700" },
                    { value: "no_show", label: t("noShow"), icon: AlertTriangle, color: "border-gray-300 bg-gray-50 text-gray-700" },
                  ].map(({ value, label, icon: Icon, color }) => (
                    <button key={value}
                      onClick={() => setOutcome(value)}
                      className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition-all
                        ${outcome === value ? color : "border-border bg-background text-muted-foreground hover:border-primary/30"}`}>
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
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("benefitsOptional")}</label>
                <textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder={t("benefitsPlaceholder")} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("notesOptional")}</label>
                <textarea value={offerNotes} onChange={(e) => setOfferNotes(e.target.value)} rows={2} maxLength={1000}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
          <Button variant="ghost" onClick={onClose} className="h-10 rounded-xl px-4 text-sm">
            {tc("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700"
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
