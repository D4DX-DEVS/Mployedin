"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  Briefcase,
  Building2,
  Calendar,
  Eye,
  Globe,
  Loader2,
  MapPin,
  DollarSign,
  GraduationCap,
  Clock,
  Users,
  X,
  FileText,
  Activity,
  Sparkles,
  Send,
  Laptop,
  Tag,
  Pause,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";

/* ────────────────────────────── Types ────────────────────────────── */

type JobStatus = "all" | "active" | "draft" | "closed" | "expired" | "pending_approval" | "paused";
type EmploymentType = "all" | "full_time" | "part_time" | "contract" | "internship" | "freelance";
type WorkMode = "all" | "onsite" | "hybrid" | "remote";
type SortBy = "createdAt" | "title" | "salary" | "views" | "status";
type SortOrder = "desc" | "asc";

interface RegionalJob {
  _id: string;
  title: string;
  status: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  createdAt: string;
  employerId?: { name?: string; companyName?: string; country?: string; industry?: string };
  agentId?: { userId?: string };
  postedByAgent?: { name?: string };
  employmentType?: string;
  workMode?: string;
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean; period?: string };
  requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
  tags?: string[];
  views?: number;
}

interface JobDetail {
  _id: string;
  title: string;
  description: string;
  status?: string;
  category?: string;
  location: { isRemote?: boolean; city?: string; country?: string } | string;
  salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean; period?: string };
  requirements: {
    skills?: string[];
    preferredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
    languages?: string[];
    nationality?: string[];
  };
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  tags?: string[];
  employerId?: { companyName?: string; country?: string; industry?: string };
  createdAt: string;
  expiresAt?: string;
  views?: number;
}

interface JobCounts {
  total: number;
  active: number;
  draft: number;
  closed: number;
  expired: number;
  pending: number;
  paused: number;
  employers: number;
  agents: number;
}

/* ────────────────────────── AI Quick Chips ────────────────────────── */

const AI_SUGGESTIONS_KEYS = [
  "aiSuggestion1",
  "aiSuggestion2",
  "aiSuggestion3",
  "aiSuggestion4",
  "aiSuggestion5",
  "aiSuggestion6",
  "aiSuggestion7",
  "aiSuggestion8",
];

/* ──────────────────────────── Component ──────────────────────────── */

export default function SuperAgentJobsPage() {
  const t = useTranslations("superAgentJobs");
  const tc = useTranslations("common");
  const tt = useTranslations("table");

  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [jobs, setJobs] = useState<RegionalJob[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Standard Filters ── */
  const [jobStatus, setJobStatus] = useState<JobStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("all");
  const [workMode, setWorkMode] = useState<WorkMode>("all");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [skills, setSkills] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("");
  const [experienceMin, setExperienceMin] = useState("");
  const [experienceMax, setExperienceMax] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  /* ── AI Search ── */
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActive, setAiActive] = useState(false);

  /* ── Advanced filters panel ── */


  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Counts ── */
  const [counts, setCounts] = useState<JobCounts>({
    total: 0, active: 0, draft: 0, closed: 0, expired: 0,
    pending: 0, paused: 0, employers: 0, agents: 0,
  });

  /* ── Pagination ── */
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination(20);

  /* ── Detail dialog ── */
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ────────────────── Build query params ────────────────── */
  const buildParams = useCallback(
    (overrides?: { search?: string; ai?: string }) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(limit));

      if (jobStatus !== "all") p.set("status", jobStatus);
      const q = overrides?.search ?? searchQuery;
      if (q) p.set("search", q);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (employmentType !== "all") p.set("employmentType", employmentType);
      if (workMode !== "all") p.set("workMode", workMode);
      if (country) p.set("country", country);
      if (city) p.set("city", city);
      if (skills) p.set("skills", skills);
      if (salaryMin) p.set("salaryMin", salaryMin);
      if (salaryMax) p.set("salaryMax", salaryMax);
      if (currency) p.set("currency", currency);
      if (experienceMin) p.set("experienceMin", experienceMin);
      if (experienceMax) p.set("experienceMax", experienceMax);
      if (sortBy !== "createdAt") p.set("sortBy", sortBy);
      if (sortOrder !== "desc") p.set("sortOrder", sortOrder);

      const ai = overrides?.ai ?? (aiActive ? aiQuery : "");
      if (ai) p.set("aiQuery", ai);

      return p;
    },
    [
      page, limit, jobStatus, searchQuery, dateFrom, dateTo,
      employmentType, workMode, country, city, skills,
      salaryMin, salaryMax, currency, experienceMin, experienceMax,
      sortBy, sortOrder, aiQuery, aiActive,
    ]
  );

  /* ────────────────── Fetch jobs ────────────────── */
  const loadJobs = useCallback(
    async (overrides?: { search?: string; ai?: string }) => {
      if (overrides?.ai) setAiLoading(true);
      else setLoading(true);

      try {
        const p = buildParams(overrides);
        const res = await fetch(`/api/super-agent/jobs?${p}`);
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs ?? []);
          if (data.counts) setCounts(data.counts);
          if (data.pagination) updateTotal(data.pagination.total ?? 0);
          if (data.aiParsed) setAiActive(true);
        }
      } finally {
        setLoading(false);
        setAiLoading(false);
      }
    },
    [buildParams, updateTotal]
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  /* ── Debounced search ── */
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    resetPage();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadJobs({ search: value }), 400);
  };

  /* ── AI Search submit ── */
  const handleAiSearch = (query?: string) => {
    const q = query ?? aiQuery;
    if (!q.trim()) return;
    setAiQuery(q);
    setAiActive(true);
    resetPage();
    loadJobs({ ai: q });
  };

  /* ── Clear all filters ── */
  const clearFilters = () => {
    setSearchQuery("");
    setJobStatus("all");
    setDateFrom("");
    setDateTo("");
    setEmploymentType("all");
    setWorkMode("all");
    setCountry("");
    setCity("");
    setSkills("");
    setSalaryMin("");
    setSalaryMax("");
    setCurrency("");
    setExperienceMin("");
    setExperienceMax("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setAiQuery("");
    setAiActive(false);
    resetPage();
  };

  const hasFilters = !!(
    searchQuery ||
    dateFrom ||
    dateTo ||
    jobStatus !== "all" ||
    employmentType !== "all" ||
    workMode !== "all" ||
    country ||
    city ||
    skills ||
    salaryMin ||
    salaryMax ||
    currency ||
    experienceMin ||
    experienceMax ||
    aiActive);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (jobStatus !== "all") count++;
    if (employmentType !== "all") count++;
    if (workMode !== "all") count++;
    if (country) count++;
    if (city) count++;
    if (skills) count++;
    if (salaryMin || salaryMax) count++;
    if (currency) count++;
    if (experienceMin || experienceMax) count++;
    if (dateFrom || dateTo) count++;
    if (searchQuery) count++;
    if (aiActive) count++;
    return count;
  }, [jobStatus, employmentType, workMode, country, city, skills, salaryMin, salaryMax, currency, experienceMin, experienceMax, dateFrom, dateTo, searchQuery, aiActive]);

  /* ── Detail dialog ── */
  const openDetail = async (jobId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setSelectedJob(null);
    setDetailError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.job) {
        setSelectedJob(data.job);
      } else {
        // ponytail: surface the server reason — swallowing it made an expired
        // tenant-view 401 look identical to a deleted job.
        setDetailError(data?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Helpers ── */
  const formatLocation = (
    loc: string | { isRemote?: boolean; city?: string; country?: string } | undefined
  ) => {
    if (!loc) return "—";
    if (typeof loc === "string") return loc || "—";
    if (loc.isRemote) return t("remote");
    return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
  };

  const formatSalary = (salary?: RegionalJob["salary"]) => {
    if (!salary) return "—";
    if (salary.isNegotiable) return t("negotiable");
    if (salary.min && salary.max) {
      return `${salary.min.toLocaleString()}–${salary.max.toLocaleString()} ${salary.currency ?? ""}`;
    }
    return "—";
  };

  const formatEmploymentType = (type?: string) => {
    if (!type) return "—";
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  /* ── KPI Cards ── */
  const kpis = [
    {
      label: t("totalJobsLabel"),
      value: counts.total,
      helper: t("totalJobsHelper"),
      icon: <Briefcase className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: tc("active"),
      value: counts.active,
      helper: t("activeJobsHelper"),
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("draftLabel"),
      value: counts.draft,
      helper: t("draftJobsHelper"),
      icon: <FileText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: t("employersLabel"),
      value: counts.employers,
      helper: t("employersHelper"),
      icon: <Building2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
  ];

  const tableHeaders = [
    t("jobTitleHeader"),
    t("employerHeader"),
    t("typeHeader"),
    t("salaryHeader"),
    "",
  ];

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Title", key: "title" },
    { header: "Employer", key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string; name?: string })?.companyName ?? (row.employerId as { name?: string })?.name ?? "" },
    { header: "Location", key: "location", formatter: (_v, row) => { const loc = (row as unknown as RegionalJob).location; if (!loc) return ""; if (typeof loc === "string") return loc; if (loc.isRemote) return "Remote"; return [loc.city, loc.country].filter(Boolean).join(", "); } },
    { header: "Type", key: "employmentType" },
    { header: "Work Mode", key: "workMode" },
    { header: "Status", key: "status" },
    { header: "Category", key: "category" },
    { header: "Date", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-jobs",
    title: "Regional Jobs",
  });

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summaryTitle={t("aiPoweredTitle")}
        summaryDescription={t("aiPoweredDescription")}
      />

      <SuperAgentMetricsGrid items={kpis} />

      {/* ── AI Search Section ── */}
      <SuperAgentSection
        eyebrow={t("aiSearchEyebrow")}
        title={t("aiSearchTitle")}
        description={t("aiSearchDescription")}
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                placeholder={t("aiSearchPlaceholder")}
                className="h-11 rounded-xl bg-background/85 pl-9 text-sm shadow-none"
              />
            </div>
            <Button
              onClick={() => handleAiSearch()}
              disabled={aiLoading || !aiQuery.trim()}
              className="h-11 gap-2 rounded-xl px-5 disabled:opacity-60"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {tc("search")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {AI_SUGGESTIONS_KEYS.map((key, i) => {
              const q = t(key);
              return (
                <button
                  key={i}
                  onClick={() => {
                    setAiQuery(q);
                    handleAiSearch(q);
                  }}
                  className="rounded-full border border-border/70 bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary/80 hover:text-foreground"
                >
                  {q}
                </button>
              );
            })}
          </div>

          {aiActive && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                {t("aiFilterActive")}: <span className="font-medium text-foreground">&quot;{aiQuery}&quot;</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => {
                  setAiQuery("");
                  setAiActive(false);
                  resetPage();
                }}
              >
                <X className="h-3 w-3 mr-1" /> {t("clearAiFilter")}
              </Button>
            </div>
          )}
        </div>
      </SuperAgentSection>

      {/* ── Jobs Listing with Filters ── */}
      <SuperAgentSection
        eyebrow={t("jobsEyebrow")}
        title={t("jobsListingTitle")}
        description={t("jobsListingDescription")}
      >
        {/* ── Merged Filters via TableToolbar ── */}
        <TableToolbar
          search={searchQuery}
          onSearchChange={handleSearchChange}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={hasFilters}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Status quick-filter pills */}
              {([
                { key: "all" as const, labelKey: "statusFilterAll", count: counts.total, icon: Briefcase },
                { key: "active" as const, labelKey: "statusFilterActive", count: counts.active, icon: CheckCircle2 },
                { key: "draft" as const, labelKey: "statusFilterDraft", count: counts.draft, icon: FileText },
                { key: "pending_approval" as const, labelKey: "statusFilterPending", count: counts.pending, icon: AlertCircle },
                { key: "paused" as const, labelKey: "statusFilterPaused", count: counts.paused, icon: Pause },
                { key: "closed" as const, labelKey: "statusFilterClosed", count: counts.closed, icon: X },
                { key: "expired" as const, labelKey: "statusFilterExpired", count: counts.expired, icon: Clock },
              ] as const).map(({ key, labelKey, count, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setJobStatus(key); resetPage(); }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    jobStatus === key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t(labelKey)}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    jobStatus === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{count}</span>
                </button>
              ))}
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-1" /> {t("clearAllFilters")}
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{activeFilterCount}</Badge>
                  )}
                </Button>
              )}
            </div>
          }
          filterContent={
            <div className="space-y-4">
              {/* Row 1: Status / Employment Type / Work Mode / Sort */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{tc("status")}</label>
                  <Select value={jobStatus} onValueChange={(v) => { setJobStatus(v as JobStatus); resetPage(); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={tc("status")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allStatuses")}</SelectItem>
                      <SelectItem value="active">{tc("active")}</SelectItem>
                      <SelectItem value="draft">{t("draftLabel")}</SelectItem>
                      <SelectItem value="pending_approval">{t("pendingLabel")}</SelectItem>
                      <SelectItem value="paused">{t("pausedLabel")}</SelectItem>
                      <SelectItem value="closed">{t("closedLabel")}</SelectItem>
                      <SelectItem value="expired">{t("expiredLabel")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("employmentTypeLabel")}</label>
                  <Select value={employmentType} onValueChange={(v) => { setEmploymentType(v as EmploymentType); resetPage(); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("jobTypePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allTypes")}</SelectItem>
                      <SelectItem value="full_time">{t("fullTime")}</SelectItem>
                      <SelectItem value="part_time">{t("partTime")}</SelectItem>
                      <SelectItem value="contract">{t("contract")}</SelectItem>
                      <SelectItem value="internship">{t("internship")}</SelectItem>
                      <SelectItem value="freelance">{t("freelance")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("workModeLabel")}</label>
                  <Select value={workMode} onValueChange={(v) => { setWorkMode(v as WorkMode); resetPage(); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("workModePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allModes")}</SelectItem>
                      <SelectItem value="onsite">{t("onsite")}</SelectItem>
                      <SelectItem value="hybrid">{t("hybrid")}</SelectItem>
                      <SelectItem value="remote">{t("remote")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("sortByLabel")}</label>
                    <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortBy); resetPage(); }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="createdAt">{t("sortDateCreated")}</SelectItem>
                        <SelectItem value="title">{t("sortTitle")}</SelectItem>
                        <SelectItem value="salary">{t("sortSalary")}</SelectItem>
                        <SelectItem value="views">{t("sortViews")}</SelectItem>
                        <SelectItem value="status">{tc("status")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("orderLabel")}</label>
                    <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v as SortOrder); resetPage(); }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">{t("newestFirst")}</SelectItem>
                        <SelectItem value="asc">{t("oldestFirst")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Row 2: Advanced fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{tc("country")}</label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder={t("countryPlaceholder")} value={country} onChange={(e) => setCountry(e.target.value)} className="h-9 pl-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("cityLabel")}</label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder={t("cityPlaceholder")} value={city} onChange={(e) => setCity(e.target.value)} className="h-9 pl-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("skillsLabel")}</label>
                  <div className="relative">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder={t("skillsPlaceholder")} value={skills} onChange={(e) => setSkills(e.target.value)} className="h-9 pl-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("currencyLabel")}</label>
                  <Select value={currency || "any"} onValueChange={(v) => setCurrency(v === "any" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("anyCurrency")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t("anyCurrency")}</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="SAR">SAR</SelectItem>
                      <SelectItem value="QAR">QAR</SelectItem>
                      <SelectItem value="KWD">KWD</SelectItem>
                      <SelectItem value="BHD">BHD</SelectItem>
                      <SelectItem value="OMR">OMR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Salary / Experience / Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("salaryMinLabel")}</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" placeholder={t("minSalaryPlaceholder")} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} className="h-9 pl-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("salaryMaxLabel")}</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" placeholder={t("maxSalaryPlaceholder")} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} className="h-9 pl-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("experienceMinLabel")}</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" placeholder="0" value={experienceMin} onChange={(e) => setExperienceMin(e.target.value)} className="h-9 pl-8 text-sm" min="0" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("experienceMaxLabel")}</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" placeholder="20" value={experienceMax} onChange={(e) => setExperienceMax(e.target.value)} className="h-9 pl-8 text-sm" min="0" />
                  </div>
                </div>
              </div>

              {/* Date range + Apply */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <label className="text-xs text-muted-foreground whitespace-nowrap">{t("dateFromLabel")}</label>
                  <DateTimePicker mode="date" value={dateFrom} onChange={setDateFrom} />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">{t("dateToLabel")}</label>
                  <DateTimePicker mode="date" value={dateTo} onChange={setDateTo} />
                </div>
                <Button variant="default" size="sm" className="h-9 gap-1.5 text-xs ml-auto" onClick={() => { resetPage(); loadJobs(); }}>
                  {t("applyFiltersButton")}
                </Button>
              </div>

              {/* Active filter badges */}
              {hasFilters && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                  {jobStatus !== "all" && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Status: {jobStatus.replace("_", " ")}
                      <button onClick={() => setJobStatus("all")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {employmentType !== "all" && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Type: {formatEmploymentType(employmentType)}
                      <button onClick={() => setEmploymentType("all")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {workMode !== "all" && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Mode: {workMode}
                      <button onClick={() => setWorkMode("all")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {country && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Country: {country}
                      <button onClick={() => setCountry("")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {city && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      City: {city}
                      <button onClick={() => setCity("")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {skills && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Skills: {skills}
                      <button onClick={() => setSkills("")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {(salaryMin || salaryMax) && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Salary: {salaryMin || "0"}–{salaryMax || "∞"} {currency}
                      <button onClick={() => { setSalaryMin(""); setSalaryMax(""); }} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {(experienceMin || experienceMax) && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Exp: {experienceMin || "0"}–{experienceMax || "∞"} yrs
                      <button onClick={() => { setExperienceMin(""); setExperienceMax(""); }} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {(dateFrom || dateTo) && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Date: {dateFrom || "…"} → {dateTo || "…"}
                      <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {searchQuery && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      Search: &quot;{searchQuery}&quot;
                      <button onClick={() => setSearchQuery("")} className="ml-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </div>
          }
          className="mb-4"
        />
        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  {tableHeaders.map((h, i) => (
                    <TableHead
                      key={i}
                      className={i === tableHeaders.length - 1 ? "text-right" : ""}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {tableHeaders.map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                <Briefcase className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{t("noJobsFound")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {aiActive
                    ? t("noJobsMatchedAiSearch")
                    : t("noJobsMatchFilters")}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>{t("jobTitleHeader")}</TableHead>
                  <TableHead>{t("employerHeader")}</TableHead>
                  <TableHead>{t("typeHeader")}</TableHead>
                  <TableHead>{t("salaryHeader")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="bg-transparent">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{job.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={job.status ?? "draft"} />
                          <span className="text-[10px] text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                        {job.tags && job.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {job.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                            {job.tags.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{job.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="block font-medium text-foreground/80">{job.employerId?.companyName ?? job.employerId?.name ?? "—"}</span>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {formatLocation(job.location)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <span className="block">{formatEmploymentType(job.employmentType)}</span>
                      {job.workMode ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {job.workMode === "remote" ? (
                            <Laptop className="h-3 w-3" />
                          ) : job.workMode === "hybrid" ? (
                            <Globe className="h-3 w-3" />
                          ) : (
                            <Building2 className="h-3 w-3" />
                          )}
                          <span className="capitalize">{job.workMode}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatSalary(job.salary)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={t("viewJobDetailsButton")}
                          onClick={() => openDetail(job._id)}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {!loading && jobs.length > 0 && (
          <div className="border-t border-border/60 px-4 py-3 sm:px-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}
      </SuperAgentSection>

      {/* ── Job Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto gap-5 p-6">
          {detailLoading ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("loadingJobDetails")}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : selectedJob ? (
            <>
              <DialogHeader className="space-y-2 pr-8">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="text-xl font-semibold leading-tight">
                    {selectedJob.title}
                  </DialogTitle>
                  <StatusBadge status={selectedJob.status ?? "draft"} />
                </div>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {selectedJob.employerId?.companyName && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> {selectedJob.employerId.companyName}
                      </span>
                    )}
                    {selectedJob.category && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {selectedJob.category}
                      </span>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              {/* Key facts */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("locationHeader")}</p>
                    <p className="font-medium text-foreground">{formatLocation(selectedJob.location)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("salaryHeader")}</p>
                    <p className="font-medium text-foreground">
                      {selectedJob.salary?.isNegotiable
                        ? t("negotiable")
                        : selectedJob.salary?.min && selectedJob.salary?.max
                          ? `${selectedJob.salary.min.toLocaleString()}–${selectedJob.salary.max.toLocaleString()} ${selectedJob.salary.currency ?? ""}`
                          : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("typeHeader")}</p>
                    <p className="font-medium text-foreground capitalize">
                      {selectedJob.employmentType?.replace("_", " ") ?? "—"}
                    </p>
                  </div>
                </div>
                {selectedJob.workMode && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("workModeHeader")}</p>
                      <p className="font-medium text-foreground capitalize">{selectedJob.workMode}</p>
                    </div>
                  </div>
                )}
                {selectedJob.vacancies && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t("vacanciesLabel")}</p>
                      <p className="font-medium text-foreground">{selectedJob.vacancies}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("postedLabel")}</p>
                    <p className="font-medium text-foreground">
                      {new Date(selectedJob.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("descriptionLabel")}</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
                    {selectedJob.description}
                  </p>
                </div>
              )}

              {/* Skills */}
              {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("requiredSkillsLabel")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.requirements.skills!.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preferred Skills */}
              {(selectedJob.requirements?.preferredSkills?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("preferredSkillsLabel")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.requirements.preferredSkills!.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience & Education */}
              {(selectedJob.requirements?.experienceMin != null || selectedJob.requirements?.education) && (
                <div className="flex flex-wrap gap-4 text-sm">
                  {selectedJob.requirements.experienceMin != null && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      {selectedJob.requirements.experienceMin}–{selectedJob.requirements.experienceMax ?? "?"} {t("yearsAbbr")}
                    </span>
                  )}
                  {selectedJob.requirements.education && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {selectedJob.requirements.education}
                    </span>
                  )}
                </div>
              )}

              {/* Languages */}
              {(selectedJob.requirements?.languages?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("languagesLabel")}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.requirements.languages!.map((l) => (
                      <Badge key={l} variant="outline" className="text-xs">
                        {l}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Responsibilities */}
              {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("responsibilitiesLabel")}</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.responsibilities!.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {(selectedJob.benefits?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t("benefitsLabel")}</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                    {selectedJob.benefits!.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("jobDetailsUnavailable")}</DialogTitle>
              </DialogHeader>
              <div className="py-16 text-center text-sm text-muted-foreground">
                {t("failedToLoadJobDetails")}
                {detailError && (
                  <span className="mt-2 block text-xs text-destructive">{detailError}</span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
