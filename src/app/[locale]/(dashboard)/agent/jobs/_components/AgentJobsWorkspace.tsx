"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Briefcase, Building2, CalendarDays, CheckCircle, Sparkles, Edit2, Eye, Globe, Inbox, MapPin, PauseCircle, PlayCircle, Plus, Tag, Users, Share2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { AiSearchField, AiSearchResultLine } from "@/components/shared/AiSearchField";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useDebounce } from "@/hooks/useDebounce";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { useTableExport } from "@/hooks/useTableExport";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useAiFilterSearch } from "@/hooks/useAiFilterSearch";
import type { ExportColumn } from "@/lib/export";
import { disambiguateEmployerLabels } from "@/lib/employers/optionLabels";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";
import { ShareJobDialog } from "@/components/features/agent/ShareJobDialog";
import { IndustryChips, type IndustryFacet } from "./IndustryChips";

interface JobItem {
  _id: string;
  title: string;
  status: string;
  location?: { city?: string; country?: string; isRemote?: boolean };
  category?: string;
  applicantIds?: string[];
  applicationCount?: number;
  employerId?: { _id?: string; companyName?: string };
  createdAt: string;
}

interface EmployerOption {
  value: string;
  label: string;
}

/** What /api/ai/job-search-filters hands back under `filters`. */
interface AiJobFilters {
  search?: string;
  status?: string;
  workMode?: string;
  location?: string;
  skills?: string[];
  sortBy?: string;
}

interface AiSnapshot {
  search: string;
  status: string;
  employer: string;
  workMode: string;
  location: string;
  skills: string;
  sortBy: string;
  moreOpen: boolean;
}

const STATUSES = ["active", "draft", "paused", "closed", "expired"] as const;
const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
const SORTS = ["newest", "oldest", "applications_desc", "applications_asc"] as const;
const SORT_LABEL_KEYS: Record<(typeof SORTS)[number], string> = {
  newest: "sortLabels.newest",
  oldest: "sortLabels.oldest",
  applications_desc: "sortLabels.applicationsDesc",
  applications_asc: "sortLabels.applicationsAsc",
};
const COLUMN_COUNT = 6;

/** A cell value with its icon, kept to one line; the full text is the tooltip. */
function IconText({ icon: Icon, children, title, className }: { icon: LucideIcon; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className ?? ""}`} title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden="true" />
      <span dir="auto" className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/**
 * The agent's jobs list in two modes:
 * - "my" (/agent/jobs): jobs of the employers the agent manages, plus their own.
 * - "browse" (/agent/browse-jobs): every live job on the portal, to find and
 *   share with seekers, with "new this week" and per-industry counts.
 */
export function AgentJobsWorkspace({ mode }: { mode: "my" | "browse" }) {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("agentJobs");
  const common = useTranslations("agentCommon");
  const tAi = useTranslations("aiFilterSearch");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [employerCount, setEmployerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [shareJob, setShareJob] = useState<JobItem | null>(null);
  // The "All active jobs" filter choices: only values live jobs actually have.
  const [facets, setFacets] = useState<{ countries: string[]; cities: string[]; professions: string[]; industries: IndustryFacet[]; newThisWeek: number; totalActive: number }>({ countries: [], cities: [], professions: [], industries: [], newThisWeek: 0, totalActive: 0 });

  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  // "all" = the portal-wide browse view (kept as the internal name the filters use).
  const view: "my" | "all" = mode === "browse" ? "all" : "my";
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [status, setStatus] = useUrlFilter("status", "all", { allow: ["all", ...STATUSES] });
  const [employer, setEmployer] = useUrlFilter("employerId", "all");
  const [workMode, setWorkMode] = useUrlFilter("workMode", "all", { allow: ["all", ...WORK_MODES] });
  const [location, setLocation] = useUrlFilter("location", "", { debounceMs: 400 });
  const [country, setCountry] = useUrlFilter("country", "");
  const [city, setCity] = useUrlFilter("city", "");
  const [industry, setIndustry] = useUrlFilter("industry", "");
  const [profession, setProfession] = useUrlFilter("profession", "");
  // Browse: only jobs posted in the last 7 days.
  const [posted, setPosted] = useUrlFilter("posted", "", { allow: ["", "week"] });
  const [skills, setSkills] = useUrlFilter("skills", "", { debounceMs: 400 });
  // "" keeps the API default: newest first, or best match while searching.
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "", { allow: ["", ...SORTS] });
  // Starts open when the URL already carries a secondary filter, so it is never set-but-hidden.
  const [moreOpen, setMoreOpen] = useState(() => workMode !== "all" || Boolean(location || skills || (view === "all" && (country || city || industry || profession))));

  // Phones keep only search + sort on the first line; every select moves
  // behind More filters, so the list starts above the fold.
  const isPhone = useMediaQuery(PHONE_QUERY);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedLocation = useDebounce(location, 300);
  const debouncedSkills = useDebounce(skills, 300);

  useEffect(() => {
    fetch("/api/employers?limit=200")
      .then((r) => (r.ok ? r.json() : { employers: [] }))
      .then((data) => {
        const list = (data.employers ?? []) as { _id: string; companyName?: string; email?: string; employer?: { companyName?: string } }[];
        setEmployers(disambiguateEmployerLabels(list.map((e) => ({
          value: String(e._id),
          label: e.companyName ?? e.employer?.companyName ?? common("unknown"),
          hint: e.email,
        }))));
      })
      .catch(() => { /* the employer filter is optional */ });
  }, [common]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      // "All active jobs": every live job on the portal, plus the filter choices.
      if (view === "all") { params.set("scope", "portal"); params.set("facets", "1"); }
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (view === "my" && status !== "all") params.set("status", status);
      if (view === "my" && employer !== "all") params.set("employerId", employer);
      if (workMode !== "all") params.set("workMode", workMode);
      if (debouncedLocation) params.set("location", debouncedLocation);
      if (view === "all") {
        if (country) params.set("country", country);
        if (city) params.set("city", city);
        if (industry) params.set("industry", industry);
        if (profession) params.set("profession", profession);
        if (posted) params.set("posted", posted);
      }
      if (debouncedSkills) params.set("skills", debouncedSkills);
      if (sortBy) params.set("sortBy", sortBy);
      const res = await fetch(`/api/jobs?${params}`);
      if (!res.ok) throw new Error("jobs");
      const data = await res.json();
      setJobs(data.jobs ?? []);
      if (data.facets) setFacets(data.facets);
      setStatusCounts(data.statusCounts ?? {});
      setEmployerCount(data.portfolioStats?.employerCount ?? 0);
      updateTotal(data.pagination?.total ?? 0);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, status, employer, workMode, debouncedLocation, debouncedSkills, sortBy, view, country, city, industry, profession, posted, updateTotal]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  // next-intl throws on a missing key, so an unknown status prints as stored.
  const statusLabel = (value: string) =>
    (STATUSES as readonly string[]).includes(value) ? t(`statuses.${value}` as "statuses.active") : value;
  const workModeLabel = (value: string) => t(`workModes.${value}` as "workModes.remote");
  const locationText = (loc?: JobItem["location"]) => {
    if (!loc) return common("dash");
    if (loc.isRemote) return t("remote");
    return [loc.city, loc.country].filter(Boolean).join(", ") || common("dash");
  };
  const applicantsOf = (job: JobItem) => job.applicationCount ?? job.applicantIds?.length ?? 0;

  const hasActiveFilters = Boolean(search) || status !== "all" || employer !== "all"
    || workMode !== "all" || Boolean(location) || Boolean(skills) || (view === "all" && (country || city || industry || profession || posted));

  /* Ask AI fills the same filters the controls hold, and only the ones this
     page has a control for — the parser's salary-visibility filter is dropped. */
  const ai = useAiFilterSearch<AiJobFilters, AiSnapshot>({
    endpoint: "/api/ai/job-search-filters",
    snapshot: () => ({ search, status, employer, workMode, location, skills, sortBy, moreOpen }),
    restore: (s) => {
      setSearch(s.search); setStatus(s.status); setEmployer(s.employer); setWorkMode(s.workMode);
      setLocation(s.location); setSkills(s.skills); setSortBy(s.sortBy); setMoreOpen(s.moreOpen);
      resetPage();
    },
    apply: (f) => {
      const applied: string[] = [];
      const nextStatus = f.status && (STATUSES as readonly string[]).includes(f.status) ? f.status : "all";
      if (nextStatus !== "all") applied.push(statusLabel(nextStatus));
      const nextWorkMode = f.workMode && (WORK_MODES as readonly string[]).includes(f.workMode) ? f.workMode : "all";
      if (nextWorkMode !== "all") applied.push(workModeLabel(nextWorkMode));
      const nextLocation = f.location ?? "";
      if (nextLocation) applied.push(nextLocation);
      const nextSkills = f.skills ?? [];
      applied.push(...nextSkills);
      const nextSort = f.sortBy && f.sortBy in SORT_LABEL_KEYS ? f.sortBy as (typeof SORTS)[number] : "";
      if (nextSort) applied.push(t(SORT_LABEL_KEYS[nextSort] as "sortLabels.newest"));
      const keyword = f.search ?? "";
      if (keyword) applied.push(tAi("keyword", { keyword }));

      setSearch(keyword);
      setStatus(nextStatus);
      setWorkMode(nextWorkMode);
      setLocation(nextLocation);
      setSkills(nextSkills.join(", "));
      setSortBy(nextSort);
      if (nextWorkMode !== "all" || nextLocation || nextSkills.length > 0) setMoreOpen(true);
      resetPage();
      return applied;
    },
    searchAsKeyword: (query) => { setSearch(query); resetPage(); },
  });

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setEmployer("all");
    setWorkMode("all");
    setLocation("");
    setCountry("");
    setCity("");
    setIndustry("");
    setProfession("");
    setPosted("");
    setSkills("");
    ai.dismiss();
    resetPage();
  }


  // The API takes one combined value; the control shows a field plus ↑/↓.
  const sortField = sortBy.startsWith("applications") ? "applications" : "posted";
  const sortOrder: "asc" | "desc" = sortBy === "oldest" || sortBy === "applications_asc" ? "asc" : "desc";
  const applySort = (field: string, order: "asc" | "desc") => {
    if (field === "applications") setSortBy(order === "asc" ? "applications_asc" : "applications_desc");
    else setSortBy(order === "asc" ? "oldest" : "newest");
    resetPage();
  };
  const toggleColumnSort = (field: "posted" | "applications") =>
    applySort(field, sortField === field && sortOrder === "desc" ? "asc" : "desc");

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("table.title"), key: "title" },
    { header: t("table.employer"), key: "employerId", formatter: (_v, row) => (row.employerId as JobItem["employerId"])?.companyName ?? "" },
    { header: t("table.location"), key: "location", formatter: (_v, row) => locationText((row as unknown as JobItem).location) },
    { header: t("table.status"), key: "status", formatter: (v) => statusLabel(String(v)) },
    { header: t("table.applicants"), key: "applicationCount", formatter: (_v, row) => String(applicantsOf(row as unknown as JobItem)) },
    { header: t("table.posted"), key: "createdAt", formatter: (v) => (v ? formatListDate(String(v), locale) : "") },
  ];
  // BUG-06: export the full filtered result set, not just the visible page.
  const fetchAllJobs = useCallback(async () => {
    const base = new URLSearchParams();
    if (debouncedSearch.trim()) base.set("search", debouncedSearch.trim());
    if (status !== "all") base.set("status", status);
    if (employer !== "all") base.set("employerId", employer);
    if (workMode !== "all") base.set("workMode", workMode);
    if (debouncedLocation.trim()) base.set("location", debouncedLocation.trim());
    if (debouncedSkills.trim()) base.set("skills", debouncedSkills.trim());
    if (sortBy) base.set("sortBy", sortBy);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/jobs?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.jobs ?? []) as Record<string, unknown>[]),
        total: Number((json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [debouncedSearch, status, employer, workMode, debouncedLocation, debouncedSkills, sortBy]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: "agent-jobs",
    title: t("exportTitle"),
    fetchAll: fetchAllJobs,
  });

  const filterByStatus = (value: string) => { setStatus(status === value ? "all" : value); resetPage(); };

  const primaryFilters = (
    <>
      {view === "all" && (
        <>
          <SearchableSelect
            id="agent-jobs-country-filter"
            className={INLINE_FILTER_CONTROL}
            options={[{ value: "", label: t("portal.allCountries"), triggerLabel: t("portal.country") }, ...facets.countries.map((v) => ({ value: v, label: v }))]}
            value={country}
            onValueChange={(value) => { setCountry(value); setCity(""); resetPage(); }}
            ariaLabel={t("portal.country")}
            placeholder={t("portal.allCountries")}
          />
          <SearchableSelect
            id="agent-jobs-city-filter"
            className={INLINE_FILTER_CONTROL}
            options={[{ value: "", label: t("portal.allCities"), triggerLabel: t("portal.city") }, ...facets.cities.map((v) => ({ value: v, label: v }))]}
            value={city}
            onValueChange={(value) => { setCity(value); resetPage(); }}
            ariaLabel={t("portal.city")}
            placeholder={t("portal.allCities")}
          />
          <SearchableSelect
            id="agent-jobs-industry-filter"
            className={INLINE_FILTER_CONTROL}
            options={[{ value: "", label: t("portal.allIndustries"), triggerLabel: t("portal.industry") }, ...facets.industries]}
            value={industry}
            onValueChange={(value) => { setIndustry(value); resetPage(); }}
            ariaLabel={t("portal.industry")}
            placeholder={t("portal.allIndustries")}
          />
          <SearchableSelect
            id="agent-jobs-profession-filter"
            className={INLINE_FILTER_CONTROL}
            options={[{ value: "", label: t("portal.allProfessions"), triggerLabel: t("portal.profession") }, ...facets.professions.map((v) => ({ value: v, label: v }))]}
            value={profession}
            onValueChange={(value) => { setProfession(value); resetPage(); }}
            ariaLabel={t("portal.profession")}
            placeholder={t("portal.allProfessions")}
          />
        </>
      )}
      {view === "my" && <SearchableSelect
        id="agent-jobs-status-filter"
        className={INLINE_FILTER_CONTROL}
        options={[
          { value: "all", label: t("filters.allStatuses") },
          ...STATUSES.map((value) => ({ value, label: statusLabel(value) })),
        ]}
        value={status}
        onValueChange={(value) => { setStatus(value); resetPage(); }}
        placeholder={t("filters.allStatuses")}
      />}
      {view === "my" && employers.length > 1 && (
        <SearchableSelect
          id="agent-jobs-employer-filter"
          className={INLINE_FILTER_CONTROL}
          options={[{ value: "all", label: common("allEmployers") }, ...employers]}
          value={employer}
          onValueChange={(value) => { setEmployer(value); resetPage(); }}
          placeholder={common("allEmployers")}
        />
      )}
    </>
  );
  const primaryActiveCount = view === "all"
    ? [country, city, industry, profession].filter(Boolean).length
    : [status !== "all", employer !== "all"].filter(Boolean).length;

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={view === "all" ? t("browse.title") : t("title")}
        context={view === "all"
          ? t("portal.context", { count: total })
          : t("context", {
            jobs: Object.values(statusCounts).reduce((sum, n) => sum + n, 0),
            employers: employerCount,
          })}
        actions={view === "my" ? (
          <Button asChild aria-label={t("postJob")} className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
            <Link href={`/${locale}/agent/jobs/new`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("postJob")}</span>
            </Link>
          </Button>
        ) : null}
        metrics={view === "my" ? ([
          { key: "active", label: t("cards.active.label"), icon: PlayCircle, tone: "success" },
          { key: "draft", label: t("cards.drafts.label"), icon: Edit2, tone: "primary" },
          { key: "paused", label: statusLabel("paused"), icon: PauseCircle, tone: "warning" },
          { key: "closed", label: statusLabel("closed"), icon: CheckCircle, tone: "info" },
        ] as const).map((m) => ({
          label: m.label,
          value: formatCount(statusCounts[m.key] ?? 0) ?? "0",
          icon: m.icon,
          tone: m.tone,
          // Tap a tile to filter the list by that status; tap again to clear.
          active: status === m.key,
          onClick: () => filterByStatus(m.key),
        })) : [
          // Browse: the whole portal, and what is new since last week. Tap
          // "New this week" to narrow the list to it; "All active" clears it.
          {
            label: t("browse.allActive"),
            value: formatCount(facets.totalActive) ?? "0",
            icon: Briefcase,
            tone: "primary",
            active: !posted,
            onClick: () => { setPosted(""); resetPage(); },
          },
          {
            label: t("browse.newThisWeek"),
            value: formatCount(facets.newThisWeek) ?? "0",
            icon: Sparkles,
            tone: "success",
            active: posted === "week",
            onClick: () => { setPosted(posted === "week" ? "" : "week"); resetPage(); },
          },
        ]}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        more={(
          <>
            {isPhone && primaryFilters}
            <SearchableSelect
              id="agent-jobs-workmode-filter"
              className={INLINE_FILTER_CONTROL}
              options={[
                { value: "all", label: t("filters.allWorkModes") },
                ...WORK_MODES.map((mode) => ({ value: mode, label: workModeLabel(mode) })),
              ]}
              value={workMode}
              onValueChange={(value) => { setWorkMode(value); resetPage(); }}
              placeholder={t("filters.allWorkModes")}
            />
            <InlineFilterSearch
              value={location}
              onChange={(value) => { setLocation(value); resetPage(); }}
              placeholder={t("filters.locationPlaceholder")}
              icon={<MapPin className="h-3.5 w-3.5" />}
              className="flex-[1_1_11rem]"
            />
            <Input
              aria-label={t("filters.skillsPlaceholder")}
              placeholder={t("filters.skillsPlaceholder")}
              value={skills}
              onChange={(e) => { setSkills(e.target.value); resetPage(); }}
              className={`${INLINE_FILTER_CONTROL} shadow-none`}
            />
          </>
        )}
        // On phones every filter is behind it, so it is just "Filter".
        moreLabel={isPhone ? undefined : t("filters.more")}
        moreActiveCount={[workMode !== "all", location, skills].filter(Boolean).length + (isPhone ? primaryActiveCount : 0)}
        moreOpen={moreOpen}
        onMoreOpenChange={setMoreOpen}
        onClear={hasActiveFilters ? resetFilters : undefined}
        clearLabel={t("filters.clear")}
        onExportCsv={view === "my" ? handleExportCsv : undefined}
        onExportExcel={view === "my" ? handleExportExcel : undefined}
        onExportPdf={view === "my" ? handleExportPdf : undefined}
        footer={view === "my" ? <AiSearchResultLine result={ai.result} onUndo={ai.undo} onDismiss={ai.dismiss} /> : undefined}
      >
        <AiSearchField
          value={search}
          onValueChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("filters.searchOrAsk")}
          onAskAi={(query) => { void ai.askAi(query); }}
          pending={ai.pending}
          className="flex-[2_1_20rem]"
          inputClassName="h-11 rounded-lg bg-card sm:h-9"
        />
        {!isPhone && primaryFilters}
        <TableSortControl
          value={sortField}
          onValueChange={(field) => applySort(field, sortOrder)}
          options={[
            { value: "posted", label: t("table.posted") },
            { value: "applications", label: t("table.applicants") },
          ]}
          order={sortOrder}
          onOrderChange={(order) => applySort(sortField, order)}
          compact
        />
      </InlineFilterBar>

      {view === "all" && facets.industries.length > 0 && (
        <IndustryChips
          industries={facets.industries}
          value={industry}
          onChange={(value) => { setIndustry(value); resetPage(); }}
        />
      )}

      {loadFailed && !loading ? (
        <ErrorState onRetry={() => void loadJobs()} />
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <Table className="compact-phone-cards">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("table.title")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.employer")}</TableHead>
                  <TableHead>
                    <SortableTableHeader label={t("table.applicants")} active={sortField === "applications"} order={sortOrder} onClick={() => toggleColumnSort("applications")} />
                  </TableHead>
                  <TableHead>
                    <SortableTableHeader label={t("table.posted")} active={sortField === "posted"} order={sortOrder} onClick={() => toggleColumnSort("posted")} />
                  </TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={5} cols={COLUMN_COUNT} />
                ) : jobs.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMN_COUNT} className="p-0">
                      <EmptyState
                        icon={Inbox}
                        title={hasActiveFilters ? t("empty.title") : t("empty.noneTitle")}
                        description={hasActiveFilters ? t("empty.description") : t("empty.noneDescription")}
                        className="rounded-none border-0 bg-transparent"
                        action={hasActiveFilters ? (
                          <Button variant="outline" onClick={resetFilters} className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
                            {t("filters.clear")}
                          </Button>
                        ) : (
                          <Button asChild className="min-h-11 gap-2 rounded-xl px-4 text-sm font-semibold sm:min-h-9">
                            <Link href={`/${locale}/agent/jobs/new`}>
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              {t("postJob")}
                            </Link>
                          </Button>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                ) : jobs.map((job) => {
                  // Portal rows may belong to another agent's employer: open the
                  // public posting, the page the agent is about to share.
                  const jobHref = view === "all" ? `/${locale}/jobs/${job._id}` : `/${locale}/agent/jobs/${job._id}`;
                  const companyName = job.employerId?.companyName;
                  const place = locationText(job.location);
                  return (
                    <TableRow key={job._id} className="group transition-colors">
                      <TableCell className="py-3.5">
                        {/* Location rides under the title: as its own column it
                            pushed Actions out of the panel at 1280–1440. */}
                        <div className="min-w-0 space-y-1 sm:max-w-[16rem]">
                          <Link href={jobHref} title={job.title} dir="auto" className="block min-h-6 truncate font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
                            {job.title}
                          </Link>
                          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                            <IconText icon={job.location?.isRemote ? Globe : MapPin} title={place} className="shrink">{place}</IconText>
                            {job.category && <IconText icon={Tag} title={job.category} className="shrink-[2]">{job.category}</IconText>}
                          </div>
                          {/* Phone card: the employer / applicants / posted / status
                              columns fold into this line instead of a row each. */}
                          {isPhone && <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
                            {companyName && <IconText icon={Building2} title={companyName} className="max-w-[11rem]">{companyName}</IconText>}
                            <IconText icon={Users}>{formatCount(applicantsOf(job))}</IconText>
                            <IconText icon={CalendarDays}>{formatListDate(job.createdAt, locale)}</IconText>
                            {/* Every portal job is active; only My jobs needs the badge. */}
                            {view === "my" && <StatusBadge status={job.status} label={statusLabel(job.status)} />}
                          </div>}
                        </div>
                      </TableCell>
                      <TableCell data-mobile-hidden>
                        <StatusBadge status={job.status} label={statusLabel(job.status)} />
                      </TableCell>
                      <TableCell data-mobile-hidden>
                        <div className="flex min-w-0 max-w-[12rem] items-center gap-2.5" title={companyName}>
                          <UserAvatar name={companyName ?? job.title} className="h-8 w-8 shrink-0" colorful />
                          <span dir="auto" className="min-w-0 truncate text-foreground/80">{companyName ?? common("dash")}</span>
                        </div>
                      </TableCell>
                      <TableCell data-mobile-hidden className="text-sm tabular-nums text-muted-foreground">
                        <IconText icon={Users}>{formatCount(applicantsOf(job))}</IconText>
                      </TableCell>
                      <TableCell data-mobile-hidden className="whitespace-nowrap text-sm text-muted-foreground">
                        <IconText icon={CalendarDays}>{formatListDate(job.createdAt, locale)}</IconText>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          name={job.title}
                          // Labels only from 1440: at 1280 they pushed Actions out of the panel.
                          labelsFrom="wide"
                          quick={[
                            ...(view === "my" ? [{ key: "candidates", label: t("actions.viewCandidates"), icon: Users, href: `/${locale}/agent/candidates?jobId=${job._id}` }] : []),
                            { key: "view", label: t("actions.viewJob"), icon: Eye, iconOnly: true, href: jobHref },
                            ...(job.status === "active" ? [{ key: "share", label: t("share.title"), icon: Share2, iconOnly: true, onSelect: () => setShareJob(job) }] : []),
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {total > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}

      <ShareJobDialog job={shareJob} onClose={() => setShareJob(null)} locale={locale} />
    </div>
  );
}
