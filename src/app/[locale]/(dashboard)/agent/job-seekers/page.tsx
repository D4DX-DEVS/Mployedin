"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { ArrowRight, BriefcaseBusiness, ChevronDown, ChevronUp, Edit2, FileText, Filter, Inbox, MapPin, Search, UserRoundSearch, X } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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

// These will be built inside the component to use translations

export default function AgentJobSeekersPage() {
  const t = useTranslations("agentJobSeekers");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const { can } = usePermissions();
  const pagination = usePagination();
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editSeeker, setEditSeeker] = useState<JobSeeker | null>(null);

  // Build options with translations
  const AVAILABILITY_OPTIONS = [
    { value: "immediately", label: t("availabilityImmediately") },
    { value: "within_month", label: t("availabilityWithinMonth") },
    { value: "within_3_months", label: t("availabilityWithin3Months") },
    { value: "not_available", label: t("availabilityNotAvailable") },
  ];

  const JOB_TYPE_OPTIONS = [
    { value: "remote", label: t("jobTypeRemote") },
    { value: "hybrid", label: t("jobTypeHybrid") },
    { value: "onsite", label: t("jobTypeOnsite") },
    { value: "any", label: t("jobTypeAny") },
  ];

  const SORT_OPTIONS = [
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "profile_high", label: t("sortProfileHigh") },
    { value: "profile_low", label: t("sortProfileLow") },
  ];

  const EDIT_FIELDS: CrudField[] = [
    { name: "currentLocation", label: t("fieldLocation"), type: "text" },
    { name: "nationality", label: t("fieldNationality"), type: "text" },
    { name: "summary", label: t("fieldSummary"), type: "textarea" },
    { name: "skills", label: t("fieldSkillsCommaSeparated"), type: "text" },
  ];

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
    { header: tc("name"), key: "userId", formatter: (_v, row) => (row.userId as { name?: string })?.name ?? "" },
    { header: tc("email"), key: "userId", formatter: (_v, row) => (row.userId as { email?: string })?.email ?? "" },
    { header: tc("country"), key: "currentLocation" },
    { header: t("tableHeaderTopSkills"), key: "skills", formatter: (v) => Array.isArray(v) ? (v as string[]).join(", ") : "" },
    { header: t("tableHeaderAvailability"), key: "availabilityStatus" },
    { header: t("tableHeaderProfile"), key: "profileCompleteness" },
    { header: t("tableHeaderJoined"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: seekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-job-seekers",
    title: t("exportTitle"),
  });

  const completenessColor = (pct: number) => "bg-primary";

  const availabilityLabel = (val?: string) => AVAILABILITY_OPTIONS.find((o) => o.value === val)?.label ?? val ?? "\u2014";

  const completeProfiles = seekers.filter((seeker) => (seeker.profileCompleteness ?? 0) >= 80).length;
  const averageCompleteness = seekers.length > 0
    ? Math.round(seekers.reduce((sum, seeker) => sum + (seeker.profileCompleteness ?? 0), 0) / seekers.length)
    : 0;
  const withTitles = seekers.filter((seeker) => Boolean(getCurrentTitle(seeker))).length;

  return (
    <div className="page-container space-y-3 sm:space-y-6">
      {/* Hero */}
      <DashboardPageHeader
        icon={UserRoundSearch}
        eyebrow={t("heroAgentWorkspace")}
        title={t("heroTitle")}
        description={t("heroDescription")}
        summary={{ label: t("talentPoolLabel"), value: `${pagination.total} ${t("talentPoolProfiles")}`, note: t("talentPoolDescription") }}
        metrics={[
          { label: t("cardCompleteLabel"), value: completeProfiles, note: t("cardCompleteDescription"), icon: UserRoundSearch },
          { label: t("cardAvgProfileLabel"), value: `${averageCompleteness}%`, note: t("cardAvgProfileDescription"), icon: ArrowRight },
          { label: t("cardWithTitlesLabel"), value: withTitles, note: t("cardWithTitlesDescription"), icon: BriefcaseBusiness },
          { label: t("cardActiveFiltersLabel"), value: activeFilterCount, note: t("cardActiveFiltersDescription"), icon: Filter },
        ]}
      />

      {/* Search and Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("browseProfilesLabel")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("searchTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("searchDescription")}</p>
        </div>

        {/* Wraps instead of stacking, so Filter shares the line with the
            search box rather than becoming a full-width band on phones. */}
        <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("searchPlaceholder")}
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
            {tc("filter")}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">{activeFilterCount}</Badge>
            )}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> {t("clearAllFilters")}
            </Button>
          )}
        </div>

        {/* Collapsible filter panel */}
        {/* data-table-toolbar opts this panel into the shared mobile filter
            rules (globals.css): two-up instead of seven full-width rows. */}
        {showFilters && (
          <div data-table-toolbar="simple" className="mt-4 grid gap-3 rounded-2xl border border-border/50 bg-background/50 p-3 sm:p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Availability */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterAvailabilityLabel")}</label>
              <Select value={availability} onValueChange={setAvailability}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue placeholder={t("filterAvailabilityPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availability && (
                <button className="text-[10px] text-muted-foreground underline" onClick={() => setAvailability("")}>{tc("close")}</button>
              )}
            </div>

            {/* Job type preference */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterJobTypeLabel")}</label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue placeholder={t("filterJobTypePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {jobType && (
                <button className="text-[10px] text-muted-foreground underline" onClick={() => setJobType("")}>{tc("close")}</button>
              )}
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tc("country")}</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("filterLocationPlaceholder")}
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="h-9 rounded-xl pl-8 text-sm"
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterSkillsLabel")}</label>
              <Input
                placeholder={t("filterSkillsPlaceholder")}
                value={skillsFilter}
                onChange={(e) => setSkillsFilter(e.target.value)}
                className="h-9 rounded-xl text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{t("filterSkillsHint")}</p>
            </div>

            {/* Profile completeness range */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterProfileLabel")}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0} max={100}
                  value={minProfile}
                  onChange={(e) => setMinProfile(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="h-9 w-20 rounded-xl text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">{t("filterProfileTo")}</span>
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterHasCVLabel")}</label>
              <Button
                variant={hasCV ? "default" : "outline"}
                size="sm"
                className="h-9 gap-2 rounded-xl px-4 text-sm"
                onClick={() => setHasCV((v) => !v)}
              >
                <FileText className="h-3.5 w-3.5" />
                {hasCV ? t("filterCVUploadedOnly") : tc("all")}
              </Button>
            </div>

            {/* Sort */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("filterSortLabel")}</label>
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
      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("resultsLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("resultsTitle")}</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{t("resultsPagination", { total: pagination.total, pages: pagination.totalPages })}</div>
        </div>

        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>{tc("name")}</TableHead>
              <TableHead>{t("tableHeaderTitle")}</TableHead>
              <TableHead>{t("tableHeaderTopSkills")}</TableHead>
              <TableHead>{t("tableHeaderProfile")}</TableHead>
              {can("job_seekers", "update") && <TableHead>{tc("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : seekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{t("noJobSeekersFound")}</span>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={clearFilters}>{t("clearAllFilters")}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => (
              <TableRow key={s._id} className="hover:bg-secondary/50">
                <TableCell>
                  <span className="block font-medium text-foreground">{s.userId?.name ?? "\u2014"}</span>
                  <span className="block text-xs text-muted-foreground">{s.userId?.email ?? "\u2014"}</span>
                  <span className={`mt-1 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${
                    s.availabilityStatus === "immediately" ? "bg-status-selected-bg text-status-selected dark:bg-green-950 dark:text-green-400"
                    : s.availabilityStatus === "not_available" ? "bg-status-rejected-bg text-status-rejected dark:bg-red-950 dark:text-red-400"
                    : "bg-status-shortlisted-bg text-status-shortlisted dark:bg-amber-950 dark:text-amber-400"
                  }`}>
                    {availabilityLabel(s.availabilityStatus)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="block font-medium text-foreground/80">{getCurrentTitle(s) ?? "\u2014"}</span>
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
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${completenessColor(s.profileCompleteness ?? 0)}`}
                        style={{ width: `${s.profileCompleteness ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{s.profileCompleteness ?? 0}%</span>
                  </div>
                  <span className="mt-1 block text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                </TableCell>
                {can("job_seekers", "update") && (
                  <TableCell>
                    <Button variant="ghost" size="xs" onClick={() => { setEditSeeker(s); setModalOpen(true); }} title={tc("edit")} aria-label={t("editJobSeeker", { name: s.userId?.name ?? "job seeker" })}>
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
        title={t("modalEditTitle")}
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
