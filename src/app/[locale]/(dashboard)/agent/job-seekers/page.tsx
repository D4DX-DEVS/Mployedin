"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, Handshake, Edit2, Eye, Inbox, MapPin, UserPlus, UserRoundSearch, Users, X, Crown } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ReferSeekerDialog } from "@/components/features/agent/ReferSeekerDialog";
import { SeekerDetailPanel } from "@/components/features/super-agent/SeekerDetailPanel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { formatListDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { hiringStatusLabelKeyMap, hiringStatusClassMap } from "@/lib/jobseekers/hiringStatus";
import type { ReferralSummary } from "@/lib/referrals/summary";
import { totalExperience } from "@/lib/jobseekers/experience";
import type { SeekerListStats } from "@/lib/jobseekers/listStats";

interface JobSeeker {
  _id: string;
  userId: { name: string; email: string };
  currentLocation?: string;
  nationality?: string;
  summary?: string;
  experience?: { jobTitle: string; isCurrent: boolean; startDate?: string; endDate?: string }[];
  totalExperienceYears?: number;
  profileCompleteness: number;
  skills: string[];
  availabilityStatus?: string;
  preferredJobType?: string;
  cv?: { originalUrl?: string };
  badges?: string[];
  referralSummary?: ReferralSummary;
  /** "area": lives in the agent's area — view only; "own": the agent's to edit. */
  staffAccess?: "own" | "area";
  /** Hiring status derived from applications: placed|offer|interviewing|shortlisted|applied|notProgressed|waiting */
  hiringStatus?: string;
  createdAt: string;
}

/** Which job seekers the list shows (`?view=`). */
const VIEWS = ["all", "area", "referred"] as const;

function getCurrentTitle(s: JobSeeker): string | undefined {
  return s.experience?.find((e) => e.isCurrent)?.jobTitle;
}

// These will be built inside the component to use translations

export default function AgentJobSeekersPage() {
  const locale = useLocale();
  const t = useTranslations("agentJobSeekers");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  // The stated total, else the dated jobs added up; null when neither says.
  const experienceLabel = (s: JobSeeker): string | null => {
    const total = totalExperience(s.totalExperienceYears, s.experience ?? []);
    if (!total) return null;
    return [
      total.years > 0 ? t("experienceYears", { count: total.years }) : null,
      total.months > 0 ? t("experienceMonths", { count: total.months }) : null,
    ].filter(Boolean).join(" ");
  };
  const { can } = usePermissions();
  const pagination = usePagination();
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  // Header numbers over the whole filtered list (the route's ?stats=1), not the page on screen.
  const [stats, setStats] = useState<SeekerListStats | null>(null);
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [modalOpen, setModalOpen] = useState(false);
  // Client point #5: share a job-seeker referral link from here.
  const [referOpen, setReferOpen] = useState(false);
  const [editSeeker, setEditSeeker] = useState<JobSeeker | null>(null);
  // Client report 2026-10-30: an agent could not open a seeker's profile or
  // CV from this list. The super agent's read-only panel is reused.
  const [profileSeekerId, setProfileSeekerId] = useState<string | null>(null);
  const [cvSeeker, setCvSeeker] = useState<{ id: string; name: string } | null>(null);
  // A task's linked candidate opens here as ?profile=<id>. The param is dropped
  // once read so closing the panel and reloading don't reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("profile");
    if (!id) return;
    setProfileSeekerId(id);
    url.searchParams.delete("profile");
    window.history.replaceState(null, "", url);
  }, []);

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

  const HIRING_STATUS_OPTIONS = [
    { value: "", label: t("hiringStatusAny") },
    { value: "placed", label: t("hiringStatus.placed") },
    { value: "offer", label: t("hiringStatus.offer") },
    { value: "interviewing", label: t("hiringStatus.interviewing") },
    { value: "shortlisted", label: t("hiringStatus.shortlisted") },
    { value: "applied", label: t("hiringStatus.applied") },
    { value: "notProgressed", label: t("hiringStatus.notProgressed") },
    { value: "waiting", label: t("hiringStatus.waiting") },
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [availability, setAvailability] = useUrlFilter("availability", "");
  const [minProfile, setMinProfile] = useState(0);
  const [maxProfile, setMaxProfile] = useState(100);
  const [locationFilter, setLocationFilter] = useUrlFilter("location", "", { debounceMs: 400 });
  const [skillsFilter, setSkillsFilter] = useUrlFilter("skills", "", { debounceMs: 400 });
  const [hasCV, setHasCV] = useState(false);
  const [jobType, setJobType] = useUrlFilter("jobType", "");
  const [hiringStatus, setHiringStatus] = useUrlFilter("hiringStatus", "");
  const [sortBy, setSortBy] = useState("newest");
  // Dashboard deep-links: ?onboarded=1 (isOnboarded) and ?premium=1 (badges).
  // Both round-trip in the URL so the dashboard metric and this list agree.
  const [onboardedOnly, setOnboardedOnly] = useUrlFilter("onboarded", "");
  const [premiumOnly, setPremiumOnly] = useUrlFilter("premium", "");
  // All my job seekers | In my area | Referred by me (client report
  // 2026-09-30, #5). "Referred by me" used to be a toggle in the filter panel.
  const [view] = useUrlFilter("view", "all", { allow: VIEWS });
  const [areaAssigned, setAreaAssigned] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewHref = (next: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.delete("page");
    if (next === "all") query.delete("view"); else query.set("view", next);
    const qs = query.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const viewTabs: WorkspaceTab[] = [
    { key: "all", label: t("viewAll"), shortLabel: t("viewAllShort"), href: viewHref("all"), icon: Users },
    { key: "area", label: t("viewArea"), href: viewHref("area"), icon: MapPin },
    { key: "referred", label: t("filterReferredMine"), href: viewHref("referred"), icon: Handshake },
  ];

  const activeFilterCount = [
    availability,
    locationFilter,
    skillsFilter,
    hasCV,
    jobType,
    hiringStatus,
    onboardedOnly === "1",
    premiumOnly === "1",
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
    setHiringStatus("");
    setOnboardedOnly("");
    setPremiumOnly("");
    setSortBy("newest");
  };

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    params.set("stats", "1");
    if (search.trim()) params.set("search", search.trim());
    if (availability) params.set("availability", availability);
    if (minProfile > 0) params.set("minProfile", String(minProfile));
    if (maxProfile < 100) params.set("maxProfile", String(maxProfile));
    if (skillsFilter) params.set("skills", skillsFilter);
    if (locationFilter) params.set("location", locationFilter);
    if (hasCV) params.set("hasCV", "1");
    if (hiringStatus) params.set("hiringStatus", hiringStatus);
    if (onboardedOnly === "1") params.set("onboarded", "1");
    if (premiumOnly === "1") params.set("premium", "1");
    if (view === "referred") params.set("referred", "mine");
    if (view === "area") params.set("view", "area");
    if (jobType) params.set("jobType", jobType);
    if (sortBy !== "newest") params.set("sort", sortBy);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSeekers(data.items ?? []);
      setStats(data.stats ?? null);
      setAreaAssigned(data.areaAssigned !== false);
      pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);

  }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, hiringStatus, onboardedOnly, premiumOnly, view, jobType, sortBy, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  useEffect(() => { pagination.resetPage(); }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, hiringStatus, onboardedOnly, premiumOnly, view, jobType, sortBy]);

  // Premium is the `premium` entry in badges[] — what the dashboard's
  // Premium card and ?premium=1 count. Only seekers the agent manages.
  const [premiumPendingId, setPremiumPendingId] = useState<string | null>(null);
  const togglePremium = async (s: JobSeeker) => {
    const next = !(s.badges ?? []).includes("premium");
    setPremiumPendingId(s._id);
    try {
      const res = await fetch(`/api/job-seekers/${s._id}/premium`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premium: next }),
      });
      if (!res.ok) {
        toast.error(t("premiumUpdateError"));
        return;
      }
      setSeekers((rows) => rows.map((r) => (r._id === s._id
        ? { ...r, badges: next ? [...(r.badges ?? []), "premium"] : (r.badges ?? []).filter((b) => b !== "premium") }
        : r)));
      toast.success(next ? t("premiumGranted", { name: s.userId?.name ?? "" }) : t("premiumRevoked", { name: s.userId?.name ?? "" }));
    } catch {
      toast.error(t("premiumUpdateError"));
    } finally {
      setPremiumPendingId(null);
    }
  };

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
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: EDIT_FIELDS });
    }
    setEditSeeker(null);
    fetchSeekers();
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: tc("name"), key: "userId", formatter: (_v, row) => (row.userId as { name?: string })?.name ?? "" },
    { header: tc("email"), key: "userId", formatter: (_v, row) => (row.userId as { email?: string })?.email ?? "" },
    { header: tc("country"), key: "currentLocation" },
    { header: t("tableHeaderTopSkills"), key: "skills", formatter: (v) => Array.isArray(v) ? (v as string[]).join(", ") : "" },
    { header: t("hiringStatusLabel"), key: "hiringStatus", formatter: (v) => v ? t(hiringStatusLabelKeyMap[v as keyof typeof hiringStatusLabelKeyMap] || "hiringStatus.waiting") : "" },
    { header: t("tableHeaderExperience"), key: "totalExperienceYears", formatter: (_v, row) => experienceLabel(row as unknown as JobSeeker) ?? "" },
    { header: t("tableHeaderAvailability"), key: "availabilityStatus" },
    { header: t("tableHeaderProfile"), key: "profileCompleteness" },
    { header: t("tableHeaderJoined"), key: "createdAt", formatter: (v) => v ? formatListDate(String(v), locale) : "" },
  ];

  // BUG-06: export the full filtered result set, not just the visible page.
  const fetchAllSeekers = useCallback(async () => {
    const base = new URLSearchParams();
    if (search.trim()) base.set("search", search.trim());
    if (availability) base.set("availability", availability);
    if (minProfile > 0) base.set("minProfile", String(minProfile));
    if (maxProfile < 100) base.set("maxProfile", String(maxProfile));
    if (skillsFilter.trim()) base.set("skills", skillsFilter.trim());
    if (locationFilter.trim()) base.set("location", locationFilter.trim());
    if (hasCV) base.set("hasCV", "1");
    if (hiringStatus) base.set("hiringStatus", hiringStatus);
    if (onboardedOnly === "1") base.set("onboarded", "1");
    if (premiumOnly === "1") base.set("premium", "1");
    if (view === "referred") base.set("referred", "mine");
    if (view === "area") base.set("view", "area");
    if (jobType) base.set("jobType", jobType);
    if (sortBy !== "newest") base.set("sort", sortBy);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/job-seekers?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.items ?? []) as Record<string, unknown>[]),
        total: Number(json.total ?? 0),
      }),
    );
  }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, hiringStatus, onboardedOnly, premiumOnly, view, jobType, sortBy]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: seekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-job-seekers",
    title: t("exportTitle"),
    fetchAll: fetchAllSeekers,
  });

  const completenessColor = (_pct: number) => "bg-primary";

  const availabilityLabel = (val?: string) => AVAILABILITY_OPTIONS.find((o) => o.value === val)?.label ?? val ?? "\u2014";

  const completeProfiles = stats?.complete ?? 0;
  const averageCompleteness = stats?.avgCompleteness ?? 0;
  const withTitles = stats?.withTitles ?? 0;

  const profileRow = seekers.find((row) => row._id === profileSeekerId);
  const profileContext = profileRow
    ? { referralSummary: profileRow.referralSummary, inArea: profileRow.staffAccess === "area" }
    : undefined;

  const phoneFilterCount = [availability, jobType, hiringStatus, locationFilter, skillsFilter].filter(Boolean).length;

  const seekerActions = (s: JobSeeker, phone = false) => {
    const actions: RowAction[] = [{
      key: "view",
      label: t("viewProfile"),
      icon: Eye,
      iconOnly: true,
      onSelect: () => setProfileSeekerId(s._id),
    }];
    const menuActions: RowAction[] = [];
    const isPremium = (s.badges ?? []).includes("premium");
    if (can("job_seekers", "update")) {
      if (s.staffAccess !== "area") {
        menuActions.push({
          key: "premium",
          label: isPremium ? t("removePremium") : t("makePremium"),
          icon: Crown,
          iconClassName: "text-amber-600",
          pending: premiumPendingId === s._id,
          disabled: premiumPendingId === s._id,
          onSelect: () => { void togglePremium(s); },
        });
        actions.push({
          key: "edit",
          label: tc("edit"),
          icon: Edit2,
          iconOnly: true,
          onSelect: () => { setEditSeeker(s); setModalOpen(true); },
        });
      }
    }
    // Phone card with nothing but View: a lone eye icon in a footer row of
    // its own read as a stray button, so there it is labelled and fills the row.
    const quick = phone && actions.length === 1 && menuActions.length === 0
      ? [{ ...actions[0], iconOnly: false }]
      : actions;
    return <RowActions name={s.userId?.name ?? "job seeker"} quick={quick} menu={menuActions} labelsFrom="wide" />;
  };

  const emptyState = (
    view === "area" && activeFilterCount === 0 && !search ? (
      <EmptyState
        icon={MapPin}
        title={areaAssigned ? t("areaEmptyTitle") : t("areaNoRegionTitle")}
        description={areaAssigned ? t("areaEmptyDescription") : t("areaNoRegionDescription")}
      />
    ) : (
      <EmptyState
        icon={Inbox}
        title={t("noJobSeekersFound")}
        action={activeFilterCount > 0 ? (
          <Button variant="outline" onClick={clearFilters} className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
            {t("clearAllFilters")}
          </Button>
        ) : undefined}
      />
    )
  );

  return (
    <div className="page-container">
      {/* Hero */}
      <WorkspaceHeader
        title={t("heroTitle")}
        context={`${pagination.total} ${t("talentPoolProfiles")}`}
        actions={
          <button
            type="button"
            onClick={() => setReferOpen(true)}
            aria-label={t("refer.button")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("refer.button")}</span>
          </button>
        }
        metrics={[
          { label: t("cardCompleteLabel"), value: completeProfiles, icon: UserRoundSearch, tone: "primary" },
          { label: t("cardAvgProfileLabel"), value: `${averageCompleteness}%`, icon: ArrowRight, tone: "info" },
          { label: t("cardWithTitlesLabel"), value: withTitles, icon: BriefcaseBusiness, tone: "success" },
        ]}
      />

      <ReferSeekerDialog open={referOpen} onOpenChange={setReferOpen} locale={locale} />

      <WorkspaceTabs tabs={viewTabs} ariaLabel={t("viewLabel")} activeKey={view} />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        moreToggleClassName="max-sm:hidden"
        moreClassName="max-sm:hidden"
        more={(
          <>
            <SearchableSelect
              id="agent-seekers-availability"
              className={INLINE_FILTER_CONTROL}
              options={AVAILABILITY_OPTIONS}
              value={availability}
              onValueChange={(v) => { setAvailability(v); pagination.resetPage(); }}
              placeholder={t("filterAvailabilityPlaceholder")}
            />
            <SearchableSelect
              id="agent-seekers-jobtype"
              className={INLINE_FILTER_CONTROL}
              options={JOB_TYPE_OPTIONS}
              value={jobType}
              onValueChange={(v) => { setJobType(v); pagination.resetPage(); }}
              placeholder={t("filterJobTypePlaceholder")}
            />
            <SearchableSelect
              id="agent-seekers-hiringStatus"
              className={INLINE_FILTER_CONTROL}
              options={HIRING_STATUS_OPTIONS}
              value={hiringStatus}
              onValueChange={(v) => { setHiringStatus(v); pagination.resetPage(); }}
              placeholder={t("filterHiringStatus")}
            />
            <Input
              aria-label={t("filterLocationPlaceholder")}
              placeholder={t("filterLocationPlaceholder")}
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); pagination.resetPage(); }}
              className={`${INLINE_FILTER_CONTROL} shadow-none`}
            />
            <Input
              aria-label={t("filterSkillsPlaceholder")}
              placeholder={t("filterSkillsPlaceholder")}
              value={skillsFilter}
              onChange={(e) => { setSkillsFilter(e.target.value); pagination.resetPage(); }}
              className={`${INLINE_FILTER_CONTROL} shadow-none`}
            />
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); pagination.resetPage(); }}>
              <SelectTrigger aria-label={t("filterSortLabel")} className={INLINE_FILTER_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        moreLabel={tc("filter")}
        moreActiveCount={activeFilterCount}
        moreOpen={showFilters}
        onMoreOpenChange={setShowFilters}
        onClear={activeFilterCount > 0 ? clearFilters : undefined}
        clearLabel={t("clearAllFilters")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
          className="max-sm:basis-0"
        />
        <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
        {/* Dashboard deep-link chips: the metric links here with ?onboarded=1 /
            ?premium=1, so the active filter must be visible and removable. */}
        {onboardedOnly === "1" && (
          <Button variant="outline" size="sm" onClick={() => { setOnboardedOnly(""); pagination.resetPage(); }} className="h-11 shrink-0 rounded-lg border-primary/25 bg-primary/5 px-3 text-primary hover:bg-primary/10 sm:h-9">
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("filterOnboarded")}</span>
          </Button>
        )}
        {premiumOnly === "1" && (
          <Button variant="outline" size="sm" onClick={() => { setPremiumOnly(""); pagination.resetPage(); }} className="h-11 shrink-0 rounded-lg border-amber-300/40 bg-amber-50 px-3 text-amber-700 hover:bg-amber-100 sm:h-9">
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("filterPremium")}</span>
          </Button>
        )}
        {/* In the search row, as on super-agent Job Seekers: as the bar's
            footer it sat alone on a second line under the search box. */}
        <CandidateDataNotice variant="candidateList" compact />
      </InlineFilterBar>

      <PhoneFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={phoneFilterCount}
        onClear={() => {
          setAvailability("");
          setJobType("");
          setHiringStatus("");
          setLocationFilter("");
          setSkillsFilter("");
          pagination.resetPage();
        }}
      >
        <FilterField label={t("filterSortLabel")} htmlFor="agent-seekers-sheet-sort">
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); pagination.resetPage(); }}>
            <SelectTrigger id="agent-seekers-sheet-sort" className={SHEET_CONTROL}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("filterAvailabilityLabel")} htmlFor="agent-seekers-sheet-availability">
          <SearchableSelect
            id="agent-seekers-sheet-availability"
            className={SHEET_CONTROL}
            options={AVAILABILITY_OPTIONS}
            value={availability}
            onValueChange={(v) => { setAvailability(v); pagination.resetPage(); }}
            placeholder={t("filterAvailabilityPlaceholder")}
          />
        </FilterField>
        <FilterField label={t("filterJobTypeLabel")} htmlFor="agent-seekers-sheet-jobtype">
          <SearchableSelect
            id="agent-seekers-sheet-jobtype"
            className={SHEET_CONTROL}
            options={JOB_TYPE_OPTIONS}
            value={jobType}
            onValueChange={(v) => { setJobType(v); pagination.resetPage(); }}
            placeholder={t("filterJobTypePlaceholder")}
          />
        </FilterField>
        <FilterField label={t("hiringStatusLabel")} htmlFor="agent-seekers-sheet-hiringStatus">
          <SearchableSelect
            id="agent-seekers-sheet-hiringStatus"
            className={SHEET_CONTROL}
            options={HIRING_STATUS_OPTIONS}
            value={hiringStatus}
            onValueChange={(v) => { setHiringStatus(v); pagination.resetPage(); }}
            placeholder={t("filterHiringStatus")}
          />
        </FilterField>
        <FilterField label={tc("location")} htmlFor="agent-seekers-sheet-location">
          <Input
            id="agent-seekers-sheet-location"
            placeholder={t("filterLocationPlaceholder")}
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); pagination.resetPage(); }}
            className={SHEET_CONTROL}
          />
        </FilterField>
        <FilterField label={t("filterSkillsLabel")} htmlFor="agent-seekers-sheet-skills">
          <Input
            id="agent-seekers-sheet-skills"
            placeholder={t("filterSkillsPlaceholder")}
            value={skillsFilter}
            onChange={(e) => { setSkillsFilter(e.target.value); pagination.resetPage(); }}
            className={SHEET_CONTROL}
          />
        </FilterField>
      </PhoneFilterSheet>

      <PhoneRecordList
        className="sm:hidden"
        label={t("heroTitle")}
        loading={loading}
        empty={emptyState}
        items={seekers.map((s) => {
          const isPremium = (s.badges ?? []).includes("premium");
          const line = [getCurrentTitle(s), experienceLabel(s)].filter(Boolean).join(" · ");
          return {
            key: s._id,
            leading: <UserAvatar name={s.userId?.name} email={s.userId?.email} className="h-10 w-10" colorful />,
            title: (
              <button
                type="button"
                onClick={() => setProfileSeekerId(s._id)}
                className="block max-w-full break-words text-start line-clamp-2 !min-h-0 hover:text-primary hover:underline"
              >
                {s.userId?.name ?? "—"}
              </button>
            ),
            subtitle: s.userId?.email ?? "—",
            trailing: s.hiringStatus ? (
              <StatusBadge
                status={s.hiringStatus}
                label={t(hiringStatusLabelKeyMap[s.hiringStatus as keyof typeof hiringStatusLabelKeyMap] || "hiringStatus.waiting")}
                className={`whitespace-nowrap ${hiringStatusClassMap[s.hiringStatus as keyof typeof hiringStatusClassMap] || "status-pending"}`}
              />
            ) : undefined,
            actions: seekerActions(s, true),
            meta: (
              <>
                {line && (
                  <p className="flex min-w-0 items-center gap-1">
                    <BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span dir="auto" className="truncate">{line}</span>
                  </p>
                )}
                {s.currentLocation && (
                  <p className="flex min-w-0 items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span dir="auto" className="truncate">{s.currentLocation}</span>
                  </p>
                )}
                {(s.skills ?? []).length > 0 && (
                  <p className="truncate">{(s.skills ?? []).slice(0, 3).join(" · ")}{(s.skills ?? []).length > 3 ? ` +${s.skills.length - 3}` : ""}</p>
                )}
              </>
            ),
            badges: (
              <>
                {s.availabilityStatus ? (
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${
                    s.availabilityStatus === "immediately" ? "bg-status-selected-bg text-status-selected"
                    : s.availabilityStatus === "not_available" ? "bg-status-rejected-bg text-status-rejected"
                    : "bg-status-shortlisted-bg text-status-shortlisted"
                  }`}>
                    {availabilityLabel(s.availabilityStatus)}
                  </span>
                ) : null}
                {isPremium && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium leading-none text-amber-800">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    {t("premiumChip")}
                  </span>
                )}
                <ReferralSourceChip namespace="agentJobSeekers" summary={s.referralSummary} />
                {s.staffAccess === "area" && (
                  <span
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium leading-none text-primary"
                    title={t("inYourAreaViewOnly")}
                  >
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {t("inYourAreaChip")}
                  </span>
                )}
              </>
            ),
            stats: [
              { label: t("tableHeaderProfile"), value: `${s.profileCompleteness ?? 0}%` },
              { label: t("tableHeaderJoined"), value: formatListDate(s.createdAt, locale) },
            ],
          };
        })}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:hidden">
        <Table className="compact-phone-cards" data-mobile-table="scroll">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{tc("name")}</TableHead>
              <TableHead>{t("tableHeaderTitle")}</TableHead>
              {/* Skills and profile % sit out the 640–1279px band so the row actions stay in view; the profile panel has both. */}
              <TableHead className="sm:max-xl:hidden">{t("tableHeaderTopSkills")}</TableHead>
              <TableHead>{t("hiringStatusLabel")}</TableHead>
              <TableHead className="sm:max-xl:hidden">{t("tableHeaderProfile")}</TableHead>
              <TableHead className="text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={6} />
            ) : seekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => {
              const isPremium = (s.badges ?? []).includes("premium");

              return (
                <TableRow key={s._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar name={s.userId?.name} email={s.userId?.email} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setProfileSeekerId(s._id)}
                          className="block max-w-full truncate text-start font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {s.userId?.name ?? "—"}
                        </button>
                        <span className="block truncate text-xs text-muted-foreground">{s.userId?.email ?? "\u2014"}</span>
                        {/* Phone card: title and location fold in here instead of a labelled row. */}
                        {(getCurrentTitle(s) || s.currentLocation || experienceLabel(s)) && (
                          <span dir="auto" className="block truncate text-xs text-muted-foreground sm:hidden">
                            {[getCurrentTitle(s), experienceLabel(s), s.currentLocation].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {/* No pill when the seeker never said: an amber "—" read as a status. */}
                          {s.availabilityStatus ? (
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${
                              s.availabilityStatus === "immediately" ? "bg-status-selected-bg text-status-selected"
                              : s.availabilityStatus === "not_available" ? "bg-status-rejected-bg text-status-rejected"
                              : "bg-status-shortlisted-bg text-status-shortlisted"
                            }`}>
                              {availabilityLabel(s.availabilityStatus)}
                            </span>
                          ) : null}
                          {isPremium && (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium leading-none text-amber-800">
                              <Crown className="h-3 w-3" aria-hidden="true" />
                              {t("premiumChip")}
                            </span>
                          )}
                          <ReferralSourceChip namespace="agentJobSeekers" summary={s.referralSummary} />
                          {/* Phones show rows as cards with the other columns folded
                              away; where the seeker stands has to be on the card face. */}
                          {s.hiringStatus && (
                            <StatusBadge
                              status={s.hiringStatus}
                              label={t(hiringStatusLabelKeyMap[s.hiringStatus as keyof typeof hiringStatusLabelKeyMap] || "hiringStatus.waiting")}
                              className={`whitespace-nowrap sm:hidden ${hiringStatusClassMap[s.hiringStatus as keyof typeof hiringStatusClassMap] || "status-pending"}`}
                            />
                          )}
                          {s.staffAccess === "area" && (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium leading-none text-primary"
                              title={t("inYourAreaViewOnly")}
                            >
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {t("inYourAreaChip")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell data-mobile-hidden className="text-muted-foreground">
                    <div className="grid w-full min-w-0 gap-1 text-start">
                      <span className="font-medium text-foreground/80">{getCurrentTitle(s) ?? "\u2014"}</span>
                      {experienceLabel(s) && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          <span className="sr-only">{t("tableHeaderExperience")}: </span>
                          {experienceLabel(s)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.currentLocation ?? "\u2014"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="sm:max-xl:hidden">
                    <div className="flex flex-wrap gap-1">
                      {(s.skills ?? []).slice(0, 3).map((skill) => (
                        <span key={skill} className="workspace-tone-sky rounded-full px-2 py-0.5 text-xs">{skill}</span>
                      ))}
                      {(s.skills ?? []).length > 3 && (
                        <span className="text-xs text-muted-foreground">+{s.skills.length - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  {/* On phones the badge is on the card face (name cell). */}
                  <TableCell data-mobile-hidden>
                    {s.hiringStatus ? (
                      <StatusBadge
                        status={s.hiringStatus}
                        label={t(hiringStatusLabelKeyMap[s.hiringStatus as keyof typeof hiringStatusLabelKeyMap] || "hiringStatus.waiting")}
                        className={`whitespace-nowrap ${hiringStatusClassMap[s.hiringStatus as keyof typeof hiringStatusClassMap] || "status-pending"}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="sm:max-xl:hidden">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${completenessColor(s.profileCompleteness ?? 0)}`}
                          style={{ width: `${s.profileCompleteness ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.profileCompleteness ?? 0}%</span>
                    </div>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatListDate(s.createdAt, locale)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {seekerActions(s)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {pagination.total > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}

      {/* A seeker's profile, docked beside the list (full width on phones). */}
      <Dialog open={profileSeekerId !== null && !cvSeeker} onOpenChange={(open) => { if (!open) setProfileSeekerId(null); }}>
        <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t("viewProfile")}</DialogTitle>
          <SeekerDetailPanel seekerId={profileSeekerId} context={profileContext} onViewCv={setCvSeeker} />
        </DialogContent>
      </Dialog>
      {/* Closing the CV brings the profile back where it was. */}
      {cvSeeker && (
        <ResumeViewerModal url={`/api/employers/candidates/${cvSeeker.id}/cv#cv.pdf`} candidateName={cvSeeker.name} onClose={() => setCvSeeker(null)} />
      )}

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
