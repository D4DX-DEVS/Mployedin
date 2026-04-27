"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Briefcase,
  Building2,
  Calendar,
  Eye,
  Globe,
  Loader2,
  MapPin,
  Search,
  DollarSign,
  GraduationCap,
  Clock,
  Users,
  X,
  FileText,
  Activity,
  Filter,
  Sparkles,
  Send,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronDown,
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

const AI_SUGGESTIONS = [
  "Show me all remote jobs",
  "Find senior developer positions",
  "Jobs in UAE paying above 10000 AED",
  "Entry level internships",
  "Contract roles in India",
  "Active jobs with React skills",
  "High-salary jobs in Kochi",
  "Full-time positions posted this week",
];

/* ──────────────────────────── Component ──────────────────────────── */

export default function SuperAgentJobsPage() {
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const hasFilters =
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
    aiActive;

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
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data.job ?? null);
      }
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
    if (loc.isRemote) return "Remote";
    return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
  };

  const formatSalary = (salary?: RegionalJob["salary"]) => {
    if (!salary) return "—";
    if (salary.isNegotiable) return "Negotiable";
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
      label: "Total Jobs",
      value: counts.total,
      helper: "All jobs in your region.",
      icon: <Briefcase className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Active",
      value: counts.active,
      helper: "Live jobs visible to seekers.",
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Draft",
      value: counts.draft,
      helper: "Jobs not yet published.",
      icon: <FileText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: "Employers",
      value: counts.employers,
      helper: "Distinct employers in your region.",
      icon: <Building2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
  ];

  const tableHeaders = [
    "Job Title",
    "Employer",
    "Location",
    "Type",
    "Work Mode",
    "Salary",
    "Status",
    "Date",
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
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Regional Jobs"
        description="View and monitor all job postings from agents and employers in your region. Use advanced filters, sorting, or AI-powered search to find exactly what you need."
        summaryTitle="AI-Powered"
        summaryDescription="Use natural language to search jobs — e.g. 'remote React jobs paying above 5000 USD'."
      />

      <SuperAgentMetricsGrid items={kpis} />

      {/* ── AI Search Section ── */}
      <SuperAgentSection
        eyebrow="AI Search"
        title="Search jobs with natural language"
        description="Describe what you're looking for and AI will translate it into filters automatically."
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                placeholder="e.g. Show me remote React developer jobs in India paying above 50000 INR"
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
              Search
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {AI_SUGGESTIONS.map((q, i) => (
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
            ))}
          </div>

          {aiActive && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                AI filter active: <span className="font-medium text-foreground">&quot;{aiQuery}&quot;</span>
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
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            </div>
          )}
        </div>
      </SuperAgentSection>

      {/* ── Jobs Listing with Filters ── */}
      <SuperAgentSection
        eyebrow="Jobs"
        title="Regional job listings"
        description="Browse all jobs in your region. Use filters to narrow down results."
        actions={
          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1" /> Clear all
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            )}
          </div>
        }
      >
        {/* ── Primary Filters Row ── */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Text search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search job title or keyword…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Status */}
            <Select
              value={jobStatus}
              onValueChange={(v) => {
                setJobStatus(v as JobStatus);
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>

            {/* Employment Type */}
            <Select
              value={employmentType}
              onValueChange={(v) => {
                setEmploymentType(v as EmploymentType);
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder="Job Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
                <SelectItem value="freelance">Freelance</SelectItem>
              </SelectContent>
            </Select>

            {/* Work Mode */}
            <Select
              value={workMode}
              onValueChange={(v) => {
                setWorkMode(v as WorkMode);
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Work Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>

            {/* Advanced filter toggle */}
            <Button
              variant={showAdvanced ? "secondary" : "outline"}
              size="sm"
              className="h-9 gap-1.5 text-sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More Filters
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3 rotate-180 transition-transform" />
              ) : (
                <ChevronDown className="h-3 w-3 transition-transform" />
              )}
            </Button>

            {/* Sort */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Sort
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Sort By</label>
                    <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortBy); resetPage(); }}>
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="createdAt">Date Created</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="salary">Salary</SelectItem>
                        <SelectItem value="views">Views</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Order</label>
                    <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v as SortOrder); resetPage(); }}>
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Newest First</SelectItem>
                        <SelectItem value="asc">Oldest First</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* ── Advanced Filters Panel ── */}
          {showAdvanced && (
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Advanced Filters</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Location - Country */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Country</label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="e.g. India, UAE"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>

                {/* Location - City */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="e.g. Kochi, Dubai"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Skills (comma-separated)</label>
                  <div className="relative">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="e.g. React, Node.js"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>

                {/* Currency */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
                  <Select value={currency || "any"} onValueChange={(v) => setCurrency(v === "any" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any Currency</SelectItem>
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

                {/* Salary Min */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Salary Min</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="Min salary"
                      value={salaryMin}
                      onChange={(e) => setSalaryMin(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>

                {/* Salary Max */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Salary Max</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="Max salary"
                      value={salaryMax}
                      onChange={(e) => setSalaryMax(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>

                {/* Experience Min */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Experience Min (yrs)</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="0"
                      value={experienceMin}
                      onChange={(e) => setExperienceMin(e.target.value)}
                      className="h-8 pl-8 text-sm"
                      min="0"
                    />
                  </div>
                </div>

                {/* Experience Max */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Experience Max (yrs)</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="20"
                      value={experienceMax}
                      onChange={(e) => setExperienceMax(e.target.value)}
                      className="h-8 pl-8 text-sm"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              {/* Date range */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-[140px] text-sm"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-[140px] text-sm"
                  />
                </div>

                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs ml-auto"
                  onClick={() => {
                    resetPage();
                    loadJobs();
                  }}
                >
                  <Filter className="h-3 w-3" />
                  Apply Filters
                </Button>
              </div>
            </div>
          )}

          {/* ── Active filter badges ── */}
          {hasFilters && (
            <div className="flex flex-wrap gap-1.5">
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

        {/* ── Status quick-filter pills ── */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {([
            { key: "all" as const, label: "All", count: counts.total, icon: Briefcase },
            { key: "active" as const, label: "Active", count: counts.active, icon: CheckCircle2 },
            { key: "draft" as const, label: "Draft", count: counts.draft, icon: FileText },
            { key: "pending_approval" as const, label: "Pending", count: counts.pending, icon: AlertCircle },
            { key: "paused" as const, label: "Paused", count: counts.paused, icon: Pause },
            { key: "closed" as const, label: "Closed", count: counts.closed, icon: X },
            { key: "expired" as const, label: "Expired", count: counts.expired, icon: Clock },
          ] as const).map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setJobStatus(key);
                resetPage();
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                jobStatus === key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-background/80 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                jobStatus === key
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
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
                <p className="text-base font-semibold text-foreground">No jobs found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {aiActive
                    ? "No jobs matched your AI search. Try rephrasing or clear the AI filter."
                    : "No jobs match your current filters. Try adjusting the filters or check back later."}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>Job Title</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id} className="bg-transparent">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{job.title}</p>
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
                      {job.employerId?.companyName ?? job.employerId?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {formatLocation(job.location)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatEmploymentType(job.employmentType)}
                    </TableCell>
                    <TableCell>
                      {job.workMode ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
                      <StatusBadge status={job.status ?? "draft"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="View job details"
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
                <DialogTitle>Loading job details</DialogTitle>
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
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium text-foreground">{formatLocation(selectedJob.location)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Salary</p>
                    <p className="font-medium text-foreground">
                      {selectedJob.salary?.isNegotiable
                        ? "Negotiable"
                        : selectedJob.salary?.min && selectedJob.salary?.max
                          ? `${selectedJob.salary.min.toLocaleString()}–${selectedJob.salary.max.toLocaleString()} ${selectedJob.salary.currency ?? ""}`
                          : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium text-foreground capitalize">
                      {selectedJob.employmentType?.replace("_", " ") ?? "—"}
                    </p>
                  </div>
                </div>
                {selectedJob.workMode && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Work Mode</p>
                      <p className="font-medium text-foreground capitalize">{selectedJob.workMode}</p>
                    </div>
                  </div>
                )}
                {selectedJob.vacancies && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Vacancies</p>
                      <p className="font-medium text-foreground">{selectedJob.vacancies}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Posted</p>
                    <p className="font-medium text-foreground">
                      {new Date(selectedJob.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Description</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
                    {selectedJob.description}
                  </p>
                </div>
              )}

              {/* Skills */}
              {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Required Skills</h4>
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
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Preferred Skills</h4>
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
                      {selectedJob.requirements.experienceMin}–{selectedJob.requirements.experienceMax ?? "?"} yrs
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
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Languages</h4>
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
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Responsibilities</h4>
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
                  <h4 className="mb-1.5 text-sm font-semibold text-foreground">Benefits</h4>
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
                <DialogTitle>Job details unavailable</DialogTitle>
              </DialogHeader>
              <div className="py-16 text-center text-sm text-muted-foreground">
                Failed to load job details.
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
