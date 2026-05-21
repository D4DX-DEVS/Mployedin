"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import {
  Pencil, Trash2, UserX, ChevronDown, ChevronUp, Briefcase,
  GraduationCap, Globe, Award, Search, Inbox, Download,
  FileSpreadsheet, FileText, Sparkles, X, SlidersHorizontal,
  FileDown, Loader2, Eye,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface JobSeeker {
  _id: string;
  fullName: string;
  email?: string;
  nationality?: string;
  currentLocation?: string;
  status?: string;
  userId?: { name?: string; email?: string };
  headline?: string;
  summary?: string;
  skills?: string[];
  education?: { degree?: string; institution?: string; field?: string; startYear?: string; passingYear?: string }[];
  experience?: { jobTitle?: string; company?: string; location?: string; isCurrent?: boolean; startDate?: string; endDate?: string; description?: string }[];
  languages?: { language?: string; proficiency?: string }[];
  certifications?: string[];
  profileCompleteness?: number;
  phone?: string;
  totalExperienceYears?: number;
  preferredJobType?: string;
  availabilityStatus?: string;
  preferredLocations?: string[];
  cv?: { originalUrl?: string };
  createdAt: string;
}

interface AiFilters {
  search?: string;
  skills?: string[];
  location?: string;
  availability?: string;
  jobType?: string;
  minProfile?: number;
  maxProfile?: number;
  hasCV?: boolean;
  sort?: string;
  experienceYears?: number;
  education?: string;
  nationality?: string;
  summary?: string;
}

const AI_SUGGESTIONS = [
  "Find electrical engineers with 5+ years experience",
  "HR managers available immediately",
  "Candidates with MBA in marketing",
  "Remote developers with React and Node.js skills",
  "Fresh graduates in computer science with CV uploaded",
  "Senior accountants in Dubai",
];

const EDIT_FIELDS: CrudField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email" },
  { name: "nationality", label: "Nationality", type: "text" },
  { name: "currentLocation", label: "Location", type: "text" },
  { name: "summary", label: "Summary", type: "textarea" },
];

export default function AdminJobSeekersPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // ── Data state ──────────────────────────────────────────
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);

  // ── Filter state ────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("");
  const [sortFilter, setSortFilter] = useState("newest");
  const [hasCVFilter, setHasCVFilter] = useState(false);
  const [educationFilter, setEducationFilter] = useState("");
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [experienceYearsFilter, setExperienceYearsFilter] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // ── AI search state ─────────────────────────────────────
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiActive, setAiActive] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // ── CV download state ───────────────────────────────────
  const [cvDownloading, setCvDownloading] = useState(false);

  // ── Export columns (comprehensive) ──────────────────────
  const exportColumns: ExportColumn<JobSeeker>[] = useMemo(() => [
    { header: "Name", key: "fullName", formatter: (v, r) => String(v || (r as unknown as JobSeeker).userId?.name || "—") },
    { header: "Email", key: "email", formatter: (v, r) => String(v ?? (r as unknown as JobSeeker).userId?.email ?? "—") },
    { header: "Phone", key: "phone", formatter: (v) => String(v ?? "—") },
    { header: "Headline", key: "headline", formatter: (v) => String(v ?? "—") },
    { header: "Nationality", key: "nationality", formatter: (v) => String(v ?? "—") },
    { header: "Location", key: "currentLocation", formatter: (v) => String(v ?? "—") },
    { header: "Skills", key: "skills", formatter: (v) => Array.isArray(v) ? v.join(", ") : "—" },
    { header: "Experience (Years)", key: "totalExperienceYears", formatter: (v) => v != null ? String(v) : "—" },
    { header: "Current Role", key: "experience", formatter: (v) => {
      const exp = v as JobSeeker["experience"];
      const current = exp?.find((e) => e.isCurrent);
      return current ? `${current.jobTitle} at ${current.company}` : exp?.[0]?.jobTitle || "—";
    }},
    { header: "Education", key: "education", formatter: (v) => {
      const edu = v as JobSeeker["education"];
      return edu?.[0] ? `${edu[0].degree}${edu[0].field ? ` - ${edu[0].field}` : ""}${edu[0].institution ? ` (${edu[0].institution})` : ""}` : "—";
    }},
    { header: "Languages", key: "languages", formatter: (v) => {
      const langs = v as JobSeeker["languages"];
      return langs?.length ? langs.map((l) => `${l.language} (${l.proficiency})`).join(", ") : "—";
    }},
    { header: "Certifications", key: "certifications", formatter: (v) => Array.isArray(v) && v.length ? v.join(", ") : "—" },
    { header: "Availability", key: "availabilityStatus", formatter: (v) => String(v ?? "—").replace(/_/g, " ") },
    { header: "Job Type Preference", key: "preferredJobType", formatter: (v) => String(v ?? "—") },
    { header: "Preferred Locations", key: "preferredLocations", formatter: (v) => Array.isArray(v) ? v.join(", ") : "—" },
    { header: "Profile %", key: "profileCompleteness", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: "Has CV", key: "cv", formatter: (v) => (v as JobSeeker["cv"])?.originalUrl ? "Yes" : "No" },
    { header: "Status", key: "status", formatter: (v) => String(v ?? "active") },
    { header: "Joined", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ], []);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobSeekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "job-seekers-search-results",
    title: "Job Seekers — Search Results",
  });

  // ── Fetch job seekers ───────────────────────────────────
  const fetchJobSeekers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (skillsFilter) params.set("skills", skillsFilter);
    if (locationFilter) params.set("location", locationFilter);
    if (availabilityFilter) params.set("availability", availabilityFilter);
    if (jobTypeFilter) params.set("jobType", jobTypeFilter);
    if (sortFilter && sortFilter !== "newest") params.set("sort", sortFilter);
    if (hasCVFilter) params.set("hasCV", "1");
    if (educationFilter) params.set("education", educationFilter);
    if (nationalityFilter) params.set("nationality", nationalityFilter);
    if (experienceYearsFilter > 0) params.set("experienceYears", String(experienceYearsFilter));

    try {
      const res = await fetch(`/api/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobSeekers(data.items ?? data.jobSeekers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? 1) * limit));
      }
    } finally {
      setLoading(false);
    }
  }, [search, skillsFilter, locationFilter, availabilityFilter, jobTypeFilter, sortFilter, hasCVFilter, educationFilter, nationalityFilter, experienceYearsFilter, page, limit]);

  useEffect(() => {
    const t = setTimeout(fetchJobSeekers, 300);
    return () => clearTimeout(t);
  }, [fetchJobSeekers]);

  // ── AI Search handler ───────────────────────────────────
  const handleAiSearch = async (query?: string) => {
    const q = (query ?? aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    setAiSummary(null);

    try {
      // Run AI filter extraction AND vector search in parallel
      const [aiRes, vectorRes] = await Promise.all([
        fetch("/api/ai/admin-jobseeker-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        }),
        fetch("/api/job-seekers/vector-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, page: 1, limit: 50 }),
        }).catch(() => null), // Vector search is optional enhancement
      ]);

      if (!aiRes.ok) throw new Error("AI search failed");
      const aiData = await aiRes.json();
      const filters: AiFilters = aiData.filters ?? {};

      // Apply extracted filters for structured search
      if (filters.search) setSearch(filters.search);
      if (filters.skills?.length) setSkillsFilter(filters.skills.join(","));
      if (filters.location) setLocationFilter(filters.location);
      if (filters.availability) setAvailabilityFilter(filters.availability);
      if (filters.jobType) setJobTypeFilter(filters.jobType);
      if (filters.sort) setSortFilter(filters.sort);
      if (filters.hasCV) setHasCVFilter(true);
      if (filters.education) setEducationFilter(filters.education);
      if (filters.nationality) setNationalityFilter(filters.nationality);
      if (filters.experienceYears && filters.experienceYears > 0) setExperienceYearsFilter(filters.experienceYears);

      // If vector search returned results, merge them with upcoming structured results
      if (vectorRes?.ok) {
        const vectorData = await vectorRes.json();
        if (vectorData.items?.length) {
          // Store vector results directly if they have good relevance
          const vectorItems = vectorData.items.filter((item: JobSeeker & { _relevanceScore?: number }) => (item._relevanceScore ?? 0) >= 50);
          if (vectorItems.length > 0) {
            setJobSeekers(vectorItems);
            updateTotal(vectorItems.length);
            setAiSummary(`${aiData.summary ?? `AI search: "${q}"`} (${vectorItems.length} semantic matches found)`);
            setAiActive(true);
            setShowAdvancedFilters(true);
            resetPage();
            setAiLoading(false);
            toast.success("Vector search results loaded");
            return;
          }
        }
      }

      setAiSummary(aiData.summary ?? `AI search: "${q}"`);
      setAiActive(true);
      setShowAdvancedFilters(true);
      resetPage();
      toast.success(aiData.degraded ? "AI unavailable, using keyword search" : "AI filters applied");
    } catch {
      setSearch(q);
      resetPage();
      setAiSummary("AI search unavailable — using keyword search instead.");
      toast.error("AI search failed, using keyword fallback");
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiFilters = () => {
    setAiActive(false);
    setAiSummary(null);
    setAiQuery("");
    setSearch("");
    setSkillsFilter("");
    setLocationFilter("");
    setAvailabilityFilter("");
    setJobTypeFilter("");
    setSortFilter("newest");
    setHasCVFilter(false);
    setEducationFilter("");
    setNationalityFilter("");
    setExperienceYearsFilter(0);
    setShowAdvancedFilters(false);
    resetPage();
  };

  // ── Bulk CV Download ────────────────────────────────────
  const handleBulkCvDownload = async () => {
    setCvDownloading(true);
    try {
      const res = await fetch("/api/job-seekers/bulk-cv-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search: search || undefined,
          skills: skillsFilter ? skillsFilter.split(",").map((s) => s.trim()) : undefined,
          location: locationFilter || undefined,
          availability: availabilityFilter || undefined,
          hasCV: "1",
          jobType: jobTypeFilter || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch CVs");
      const data = await res.json();
      const cvs = data.cvs as { id: string; name: string; url: string }[];

      if (cvs.length === 0) {
        toast.error("No CVs found for this search");
        return;
      }

      // Download each CV
      let downloaded = 0;
      for (const cv of cvs.slice(0, 50)) {
        try {
          const link = document.createElement("a");
          link.href = cv.url;
          link.download = `${cv.name.replace(/[^a-zA-Z0-9 ]/g, "")}_CV.pdf`;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          downloaded++;
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch {
          // Skip individual failures
        }
      }
      toast.success(`Downloaded ${downloaded} CV${downloaded > 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to download CVs");
    } finally {
      setCvDownloading(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────
  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/job-seekers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    fetchJobSeekers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: "Deactivate this job seeker? They won't be able to log in.", confirmLabel: "Deactivate" });
    if (!ok) return;
    await fetch(`/api/job-seekers/${id}`, { method: "DELETE" });
    fetchJobSeekers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Permanently Delete Job Seeker", message: "This will permanently delete the job seeker and all their data. This cannot be undone.", confirmLabel: "Delete Forever" });
    if (!ok) return;
    await fetch(`/api/job-seekers/${id}?permanent=true`, { method: "DELETE" });
    fetchJobSeekers();
  };

  // ── Active filter count ─────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (skillsFilter) count++;
    if (locationFilter) count++;
    if (availabilityFilter) count++;
    if (jobTypeFilter) count++;
    if (hasCVFilter) count++;
    if (sortFilter !== "newest") count++;
    return count;
  }, [search, skillsFilter, locationFilter, availabilityFilter, jobTypeFilter, hasCVFilter, sortFilter]);

  return (
    <div className="page-container space-y-4">
      {ConfirmDialogNode}

      {/* ── AI Search Bar ─────────────────────────────────── */}
      <section className="workspace-panel-surface rounded-[20px] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">AI-Powered Candidate Search</h2>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60" />
            <Input
              ref={aiInputRef}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
              placeholder='Try: "electrical engineers with 5+ years" or "HR managers available immediately"...'
              className="h-10 pl-10 text-sm rounded-lg"
              disabled={aiLoading}
            />
          </div>
          <Button
            onClick={() => handleAiSearch()}
            disabled={aiLoading || !aiQuery.trim()}
            className="h-10 rounded-lg px-4"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">Search</span>
          </Button>
          {aiActive && (
            <Button variant="ghost" size="sm" onClick={clearAiFilters} className="h-10 rounded-lg">
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* AI Suggestions */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AI_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => { setAiQuery(suggestion); handleAiSearch(suggestion); }}
              className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[0.65rem] text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <p className="text-xs text-primary">{aiSummary}</p>
          </div>
        )}
      </section>

      {/* ── Main Panel ────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* Header with filters & actions */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Job Seekers</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {total > 0 ? `${total} candidate${total > 1 ? "s" : ""} found` : "Browse and manage all candidate profiles."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Generate Embeddings (admin only) */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-primary"
                onClick={async () => {
                  toast.info("Generating search embeddings...");
                  try {
                    const res = await fetch("/api/job-seekers/generate-embeddings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ forceAll: false }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      toast.success(`Embeddings ready: ${data.generated} generated`);
                    } else {
                      toast.error("Failed to generate embeddings");
                    }
                  } catch {
                    toast.error("Embedding generation failed");
                  }
                }}
              >
                <Sparkles className="h-3 w-3" /> Index AI
              </Button>
              {/* Keyword search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                  placeholder="Search name, skill, role…"
                  className="h-8 w-56 rounded-lg pl-8 text-sm"
                />
              </div>

              {/* Toggle Advanced Filters */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="h-8 rounded-lg border-border/80"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {/* CV Download */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkCvDownload}
                disabled={cvDownloading}
                className="h-8 rounded-lg border-border/80"
              >
                {cvDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                Download CVs
              </Button>

              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Export Search Results</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportCsv}>
                    <FileText className="h-4 w-4" /> CSV (Full Details)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="h-4 w-4" /> Excel (Full Details)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf}>
                    <FileText className="h-4 w-4" /> PDF Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Advanced Filters Row */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-border/50">
              {/* Skills */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">Skills</label>
                <Input
                  value={skillsFilter}
                  onChange={(e) => { setSkillsFilter(e.target.value); resetPage(); }}
                  placeholder="React, Python…"
                  className="h-7 text-xs rounded-md"
                />
              </div>
              {/* Location */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">Location</label>
                <Input
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); resetPage(); }}
                  placeholder="City or country"
                  className="h-7 text-xs rounded-md"
                />
              </div>
              {/* Availability */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">Availability</label>
                <Select value={availabilityFilter || "all"} onValueChange={(v) => { setAvailabilityFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="immediately">Immediately</SelectItem>
                    <SelectItem value="within_month">Within 1 Month</SelectItem>
                    <SelectItem value="within_3_months">Within 3 Months</SelectItem>
                    <SelectItem value="not_available">Not Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Job Type */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">Job Type</label>
                <Select value={jobTypeFilter || "all"} onValueChange={(v) => { setJobTypeFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">Onsite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Sort */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">Sort By</label>
                <Select value={sortFilter} onValueChange={(v) => { setSortFilter(v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder="Newest" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="profile_high">Profile % (High)</SelectItem>
                    <SelectItem value="profile_low">Profile % (Low)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Has CV */}
              <div className="flex items-end">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCVFilter}
                    onChange={(e) => { setHasCVFilter(e.target.checked); resetPage(); }}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">Has CV only</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── Table ───────────────────────────────────────── */}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Profession</TableHead>
              <TableHead>Education</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Exp</TableHead>
              <TableHead>Profile %</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>CV</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 13 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobSeekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={13} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No job seekers found</span>
                    <span className="text-xs">Try adjusting your search or filters</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : jobSeekers.map((js) => (
              <Fragment key={js._id}><TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === js._id ? null : js._id)}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {expandedId === js._id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    {js.fullName || js.userId?.name || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.email ?? js.userId?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-[140px]">
                  <span className="line-clamp-2">{js.experience?.[0]?.jobTitle || js.headline?.slice(0, 60) || "—"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-[130px]">
                  <span className="line-clamp-2">{js.education?.[0]?.degree ? `${js.education[0].degree}${js.education[0].field ? ` - ${js.education[0].field}` : ""}` : "—"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.nationality ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.skills?.length ? `${js.skills.slice(0, 2).join(", ")}${js.skills.length > 2 ? ` +${js.skills.length - 2}` : ""}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.totalExperienceYears != null ? `${js.totalExperienceYears}y` : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.profileCompleteness != null ? `${js.profileCompleteness}%` : "—"}</TableCell>
                <TableCell className="text-xs">
                  {js.availabilityStatus ? (
                    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium ${
                      js.availabilityStatus === "immediately" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      js.availabilityStatus === "within_month" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      js.availabilityStatus === "not_available" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
                      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {js.availabilityStatus.replace(/_/g, " ")}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs text-center">
                  {js.cv?.originalUrl ? (
                    <a
                      href={js.cv.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-primary/10 text-primary transition-colors"
                      title="View CV"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><StatusBadge status={js.status ?? "active"} /></TableCell>
                <TableCell className="text-muted-foreground text-xs">{new Date(js.createdAt).toLocaleDateString()}</TableCell>
                {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {can("job_seekers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(js)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("job_seekers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(js._id)} title="Deactivate">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      {can("job_seekers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(js._id)} title="Delete permanently">
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>

              {/* Expanded Row */}
              {expandedId === js._id && (
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableCell colSpan={13} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {/* Summary */}
                      {js.summary && (
                        <div className="md:col-span-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Summary</p>
                          <p className="text-muted-foreground text-xs">{js.summary}</p>
                        </div>
                      )}
                      {/* Contact */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Contact</p>
                        <p className="text-muted-foreground text-xs">{js.email ?? js.userId?.email ?? "—"}</p>
                        {js.phone && <p className="text-muted-foreground text-xs">{js.phone}</p>}
                        {js.currentLocation && <p className="text-muted-foreground text-xs">{js.currentLocation}</p>}
                      </div>
                      {/* Experience */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Experience</p>
                        {js.experience?.length ? js.experience.slice(0, 3).map((exp, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{exp.jobTitle || "—"}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}{exp.isCurrent ? " · Current" : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">No experience</p>}
                      </div>
                      {/* Education */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Education</p>
                        {js.education?.length ? js.education.slice(0, 3).map((edu, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{edu.degree || "—"}{edu.field ? ` — ${edu.field}` : ""}</p>
                            <p className="text-xs text-muted-foreground">{edu.institution}{edu.passingYear ? ` · ${edu.passingYear}` : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">No education</p>}
                      </div>
                      {/* Skills */}
                      {js.skills?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Award className="h-3 w-3" /> Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {js.skills.slice(0, 12).map((s) => (
                              <span key={s} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{s}</span>
                            ))}
                            {js.skills.length > 12 && <span className="text-xs text-muted-foreground">+{js.skills.length - 12} more</span>}
                          </div>
                        </div>
                      ) : null}
                      {/* Languages */}
                      {js.languages?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> Languages</p>
                          <div className="flex flex-wrap gap-1">
                            {js.languages.map((l, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{l.language} ({l.proficiency})</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* Certifications */}
                      {js.certifications?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Certifications</p>
                          <div className="flex flex-wrap gap-1">
                            {js.certifications.slice(0, 5).map((c, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* CV Download (individual) */}
                      {js.cv?.originalUrl && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">CV / Resume</p>
                          <a
                            href={js.cv.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            Download CV
                          </a>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* ── Pagination ────────────────────────────────────── */}
      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Edit Modal ────────────────────────────────────── */}
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Job Seeker" fields={EDIT_FIELDS}
        initialValues={editItem ? { name: editItem.fullName || editItem.userId?.name || "", email: editItem.email ?? editItem.userId?.email ?? "", nationality: editItem.nationality ?? "", currentLocation: editItem.currentLocation ?? "", summary: editItem.summary ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
