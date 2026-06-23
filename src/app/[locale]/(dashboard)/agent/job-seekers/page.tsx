"use client";

import { useState, useEffect, useCallback } from "react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, ChevronDown, ChevronUp, Edit2, FileText, Filter, Inbox, MapPin, Search, Sparkles, UserRoundSearch, X } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface JobSeeker {
  _id: string;
  userId: { name: string; email: string };
  currentLocation?: string;
  nationality?: string;
  summary?: string;
  experience?: { jobTitle: string; isCurrent: boolean }[];
  profileCompleteness: number;
  skills: string[];
  availabilityStatus?: string;
  preferredJobType?: string;
  cv?: { originalUrl?: string };
  createdAt: string;
}

function getCurrentTitle(s: JobSeeker): string | undefined {
  return s.experience?.find((e) => e.isCurrent)?.jobTitle;
}

const AVAILABILITY_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "within_month", label: "Within 1 month" },
  { value: "within_3_months", label: "Within 3 months" },
  { value: "not_available", label: "Not available" },
];

const JOB_TYPE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
  { value: "any", label: "Any" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "profile_high", label: "Profile % (high to low)" },
  { value: "profile_low", label: "Profile % (low to high)" },
];

const EDIT_FIELDS: CrudField[] = [
  { name: "currentLocation", label: "Location", type: "text" },
  { name: "nationality", label: "Nationality", type: "text" },
  { name: "summary", label: "Summary", type: "textarea" },
  { name: "skills", label: "Skills (comma-separated)", type: "text" },
];

export default function AgentJobSeekersPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editSeeker, setEditSeeker] = useState<JobSeeker | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [availability, setAvailability] = useState("");
  const [minProfile, setMinProfile] = useState(0);
  const [maxProfile, setMaxProfile] = useState(100);
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [hasCV, setHasCV] = useState(false);
  const [jobType, setJobType] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const activeFilterCount = [
    availability,
    locationFilter,
    skillsFilter,
    hasCV,
    jobType,
    minProfile > 0 || maxProfile < 100,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setAvailability("");
    setMinProfile(0);
    setMaxProfile(100);
    setLocationFilter("");
    setSkillsFilter("");
    setHasCV(false);
    setJobType("");
    setSortBy("newest");
  };

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (search) params.set("search", search);
    if (availability) params.set("availability", availability);
    if (minProfile > 0) params.set("minProfile", String(minProfile));
    if (maxProfile < 100) params.set("maxProfile", String(maxProfile));
    if (skillsFilter) params.set("skills", skillsFilter);
    if (locationFilter) params.set("location", locationFilter);
    if (hasCV) params.set("hasCV", "1");
    if (jobType) params.set("jobType", jobType);
    if (sortBy !== "newest") params.set("sort", sortBy);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSeekers(data.items ?? []);
      pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, jobType, sortBy, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  useEffect(() => { pagination.resetPage(); }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, jobType, sortBy]);

  const handleSave = async (values: Record<string, string>) => {
    if (!editSeeker) return;
    const payload: Record<string, unknown> = {
      currentLocation: values.currentLocation ?? "",
      nationality: values.nationality ?? "",
      summary: values.summary ?? "",
      skills: (values.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    };
    const res = await fetch(`/api/job-seekers/${editSeeker._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const detail = Array.isArray(err?.details) && err.details.length
        ? `${err.details[0].path}: ${err.details[0].message}`
        : null;
      throw new Error(detail ?? err?.error ?? "Failed to update job seeker");
    }
    setEditSeeker(null);
    fetchSeekers();
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Name", key: "userId", formatter: (_v, row) => (row.userId as { name?: string })?.name ?? "" },
    { header: "Email", key: "userId", formatter: (_v, row) => (row.userId as { email?: string })?.email ?? "" },
    { header: "Location", key: "currentLocation" },
    { header: "Skills", key: "skills", formatter: (v) => Array.isArray(v) ? (v as string[]).join(", ") : "" },
    { header: "Availability", key: "availabilityStatus" },
    { header: "Profile %", key: "profileCompleteness" },
    { header: "Joined", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: seekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-job-seekers",
    title: "Agent Job Seekers",
  });

  const completenessColor = (pct: number) =>
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400";

  const availabilityLabel = (val?: string) => AVAILABILITY_OPTIONS.find((o) => o.value === val)?.label ?? val ?? "\u2014";

  const completeProfiles = seekers.filter((seeker) => (seeker.profileCompleteness ?? 0) >= 80).length;
  const averageCompleteness = seekers.length > 0
    ? Math.round(seekers.reduce((sum, seeker) => sum + (seeker.profileCompleteness ?? 0), 0) / seekers.length)
    : 0;
  const withTitles = seekers.filter((seeker) => Boolean(getCurrentTitle(seeker))).length;

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Job Seekers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review candidate profiles, gauge profile readiness, and update key details before matching them into active roles.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Talent pool</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} profiles</p>
            <p className="text-xs text-muted-foreground">Candidate accounts currently available in your pipeline scope.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Complete</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{completeProfiles}</p><p className="mt-1 text-xs text-muted-foreground">Profiles at 80% completeness or above.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><UserRoundSearch className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg. profile</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{averageCompleteness}%</p><p className="mt-1 text-xs text-muted-foreground">Average readiness across current results.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><ArrowRight className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">With titles</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{withTitles}</p><p className="mt-1 text-xs text-muted-foreground">Profiles that already include current job titles.</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><BriefcaseBusiness className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active filters</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeFilterCount}</p><p className="mt-1 text-xs text-muted-foreground">Filters currently narrowing your results.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><Filter className="h-5 w-5" /></div></div>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse profiles</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search by candidate details or skill context</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find the right subset of job seekers before making profile updates or shortlisting them for roles.</p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, email or skill"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            className="flex-1"
          />

          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            className="gap-2 rounded-xl"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">{activeFilterCount}</Badge>
            )}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Availability */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Availability</label>
              <Select value={availability} onValueChange={setAvailability}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue placeholder="Any availability" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availability && (
                <button className="text-[10px] text-muted-foreground underline" onClick={() => setAvailability("")}>Clear</button>
              )}
            </div>

            {/* Job type preference */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Job type</label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {jobType && (
                <button className="text-[10px] text-muted-foreground underline" onClick={() => setJobType("")}>Clear</button>
              )}
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="City or country"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="h-9 rounded-xl pl-8 text-sm"
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Skills</label>
              <Input
                placeholder="React, Node.js, Python..."
                value={skillsFilter}
                onChange={(e) => setSkillsFilter(e.target.value)}
                className="h-9 rounded-xl text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Comma-separated</p>
            </div>

            {/* Profile completeness range */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Profile %</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0} max={100}
                  value={minProfile}
                  onChange={(e) => setMinProfile(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="h-9 w-20 rounded-xl text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  min={0} max={100}
                  value={maxProfile}
                  onChange={(e) => setMaxProfile(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="h-9 w-20 rounded-xl text-sm text-center"
                />
              </div>
            </div>

            {/* Has CV */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Has CV</label>
              <Button
                variant={hasCV ? "default" : "outline"}
                size="sm"
                className="h-9 gap-2 rounded-xl px-4 text-sm"
                onClick={() => setHasCV((v) => !v)}
              >
                <FileText className="h-3.5 w-3.5" />
                {hasCV ? "CV uploaded only" : "Any"}
              </Button>
            </div>

            {/* Sort */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sort by</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </section>

      {/* Results table */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review profile strength before the next match</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{pagination.total} profiles across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div>
        </div>

        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Top Skills</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Joined</TableHead>
              {can("job_seekers", "update") && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : seekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">No job seekers found</span>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={clearFilters}>Clear filters</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => (
              <TableRow key={s._id} className="hover:bg-secondary/50">
                <TableCell className="font-medium text-foreground">{s.userId?.name ?? "\u2014"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.userId?.email ?? "\u2014"}</TableCell>
                <TableCell className="text-muted-foreground">{getCurrentTitle(s) ?? "\u2014"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {s.currentLocation ?? "\u2014"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(s.skills ?? []).slice(0, 3).map((skill) => (
                      <span key={skill} className="workspace-tone-sky rounded-full px-2 py-0.5 text-xs">{skill}</span>
                    ))}
                    {(s.skills ?? []).length > 3 && (
                      <span className="text-xs text-muted-foreground">+{s.skills.length - 3}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${
                    s.availabilityStatus === "immediately" ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : s.availabilityStatus === "not_available" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  }`}>
                    {availabilityLabel(s.availabilityStatus)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${completenessColor(s.profileCompleteness ?? 0)}`}
                        style={{ width: `${s.profileCompleteness ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{s.profileCompleteness ?? 0}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                {can("job_seekers", "update") && (
                  <TableCell>
                    <Button variant="ghost" size="xs" onClick={() => { setEditSeeker(s); setModalOpen(true); }} title="Edit" aria-label={`Edit ${s.userId?.name ?? "job seeker"}`}>
                      <Edit2 className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditSeeker(null); }}
        title="Edit Job Seeker"
        fields={EDIT_FIELDS}
        initialValues={editSeeker ? {
          currentLocation: editSeeker.currentLocation ?? "",
          nationality: editSeeker.nationality ?? "",
          summary: editSeeker.summary ?? "",
          skills: (editSeeker.skills ?? []).join(", "),
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
