"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { ArrowRight, BriefcaseBusiness, Handshake, Edit2, Inbox, MapPin, UserRoundSearch, Users } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import type { ReferralSummary } from "@/lib/referrals/summary";

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
  referralSummary?: ReferralSummary;
  /** "area": lives in the agent's area — view only; "own": the agent's to edit. */
  staffAccess?: "own" | "area";
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
  const { can } = usePermissions();
  const pagination = usePagination();
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
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
  const [availability, setAvailability] = useUrlFilter("availability", "");
  const [minProfile, setMinProfile] = useState(0);
  const [maxProfile, setMaxProfile] = useState(100);
  const [locationFilter, setLocationFilter] = useUrlFilter("location", "", { debounceMs: 400 });
  const [skillsFilter, setSkillsFilter] = useUrlFilter("skills", "", { debounceMs: 400 });
  const [hasCV, setHasCV] = useState(false);
  const [jobType, setJobType] = useUrlFilter("jobType", "");
  const [sortBy, setSortBy] = useState("newest");
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
    { key: "all", label: t("viewAll"), href: viewHref("all"), icon: Users },
    { key: "area", label: t("viewArea"), href: viewHref("area"), icon: MapPin },
    { key: "referred", label: t("filterReferredMine"), href: viewHref("referred"), icon: Handshake },
  ];

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
    if (view === "referred") params.set("referred", "mine");
    if (view === "area") params.set("view", "area");
    if (jobType) params.set("jobType", jobType);
    if (sortBy !== "newest") params.set("sort", sortBy);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSeekers(data.items ?? []);
      setAreaAssigned(data.areaAssigned !== false);
      pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);

  }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, view, jobType, sortBy, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  useEffect(() => { pagination.resetPage(); }, [search, availability, minProfile, maxProfile, skillsFilter, locationFilter, hasCV, view, jobType, sortBy]);

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
    { header: t("tableHeaderAvailability"), key: "availabilityStatus" },
    { header: t("tableHeaderProfile"), key: "profileCompleteness" },
    { header: t("tableHeaderJoined"), key: "createdAt", formatter: (v) => v ? formatListDate(String(v), locale) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: seekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-job-seekers",
    title: t("exportTitle"),
  });

  const completenessColor = (_pct: number) => "bg-primary";

  const availabilityLabel = (val?: string) => AVAILABILITY_OPTIONS.find((o) => o.value === val)?.label ?? val ?? "\u2014";

  const completeProfiles = seekers.filter((seeker) => (seeker.profileCompleteness ?? 0) >= 80).length;
  const averageCompleteness = seekers.length > 0
    ? Math.round(seekers.reduce((sum, seeker) => sum + (seeker.profileCompleteness ?? 0), 0) / seekers.length)
    : 0;
  const withTitles = seekers.filter((seeker) => Boolean(getCurrentTitle(seeker))).length;

  return (
    <div className="page-container">
      {/* Hero */}
      <WorkspaceHeader
        title={t("heroTitle")}
        context={`${pagination.total} ${t("talentPoolProfiles")}`}
        metrics={[
          { label: t("cardCompleteLabel"), value: completeProfiles, icon: UserRoundSearch, tone: "primary" },
          { label: t("cardAvgProfileLabel"), value: `${averageCompleteness}%`, icon: ArrowRight, tone: "info" },
          { label: t("cardWithTitlesLabel"), value: withTitles, icon: BriefcaseBusiness, tone: "success" },
        ]}
      />

      <WorkspaceTabs tabs={viewTabs} ariaLabel={t("viewLabel")} activeKey={view} />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
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
        />
        {/* In the search row, as on super-agent Job Seekers: as the bar's
            footer it sat alone on a second line under the search box. */}
        <CandidateDataNotice variant="candidateList" compact />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{tc("name")}</TableHead>
              <TableHead>{t("tableHeaderTitle")}</TableHead>
              <TableHead>{t("tableHeaderTopSkills")}</TableHead>
              <TableHead>{t("tableHeaderProfile")}</TableHead>
              {can("job_seekers", "update") && <TableHead className="text-right">{tc("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={can("job_seekers", "update") ? 5 : 4} />
            ) : seekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={can("job_seekers", "update") ? 5 : 4} className="py-12">
                  {view === "area" && activeFilterCount === 0 && !search ? (
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
                  )}
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => {
              const actions: RowAction[] = [];
              if (can("job_seekers", "update")) {
                if (s.staffAccess !== "area") {
                  actions.push({
                    key: "edit",
                    label: tc("edit"),
                    icon: Edit2,
                    iconOnly: true,
                    onSelect: () => { setEditSeeker(s); setModalOpen(true); },
                  });
                }
              }

              return (
                <TableRow key={s._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar name={s.userId?.name} email={s.userId?.email} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{s.userId?.name ?? "\u2014"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.userId?.email ?? "\u2014"}</span>
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
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="grid w-full min-w-0 gap-1 text-start">
                      <span className="font-medium text-foreground/80">{getCurrentTitle(s) ?? "\u2014"}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.currentLocation ?? "\u2014"}
                      </span>
                    </div>
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
                    <span className="mt-1 block text-xs text-muted-foreground">{formatListDate(s.createdAt, locale)}</span>
                  </TableCell>
                  {can("job_seekers", "update") && (
                    <TableCell className="text-right">
                      {s.staffAccess === "area" ? (
                        <span className="text-xs text-muted-foreground" title={t("inYourAreaViewOnly")}>
                          {t("viewOnly")}
                        </span>
                      ) : (
                        <RowActions name={s.userId?.name ?? "job seeker"} quick={actions} />
                      )}
                    </TableCell>
                  )}
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
