"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { usePathname, useSearchParams } from "next/navigation";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Users, Briefcase, GraduationCap,
  Star, MapPin, Mail, UserPlus, Crown, UserCheck,
} from "lucide-react";
import { ReferSeekerDialog } from "@/components/features/agent/ReferSeekerDialog";
import { formatListDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import type { ReferralSummary } from "@/lib/referrals/summary";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobSeekerItem {
  _id: string;
  fullName: string;
  email: string;
  country?: string;
  /** `currentLocation` on the profile — city, region, however it was written. */
  location?: string;
  currentJobTitle?: string;
  experienceYears?: number;
  profileCompletion?: number;
  skills?: string[];
  createdAt: string;
  isActive?: boolean;
  referralSummary?: ReferralSummary;
  /** Lives in a city of the super agent's region. */
  inArea?: boolean;
  premium?: boolean;
  /** The team agent behind a seeker who did not come through a referral link. */
  agent?: { name: string; via: "added" | "assigned" };
}

/** Which job seekers the list shows (`?view=`), as on the agent's page. */
const VIEWS = ["all", "area"] as const;

interface Filters {
  search: string;
  country: string;
  experienceMin: string;
  availability: string;
  /** "all" | "premium" */
  premium: string;
  /** "all" | a team agent's Agent id */
  agent: string;
}

const INITIAL_FILTERS: Filters = { search: "", country: "all", experienceMin: "all", availability: "all", premium: "all", agent: "all" };

// These will be constructed inside component with i18n
// const EXPERIENCE_OPTIONS = [...]
// const AVAILABILITY_OPTIONS = [...]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentJobSeekersPage() {
  const locale = useLocale();
  const t = useTranslations("superAgentJobSeekers");
  const tc = useTranslations("common");

  const [seekers, setSeekers] = useState<JobSeekerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: t("allCountries") }]);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, avgCompletion: 0, withExperience: 0, premium: 0 });
  const [teamAgents, setTeamAgents] = useState<{ id: string; name: string }[]>([]);
  // Phones: search on the bar, the five dropdowns behind Filter; rows as
  // compact cards with role / profile / date folded into one line.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [referOpen, setReferOpen] = useState(false);
  const pagination = usePagination();
  // All job seekers | In my area — the agent's "In my area" view, over the
  // super agent's whole region.
  const [view] = useUrlFilter("view", "all", { allow: VIEWS });
  const [areaAssigned, setAreaAssigned] = useState(true);
  // A tab switch starts at page 1 (the tab link drops ?page, but the pager
  // keeps its own state). Not on mount, so a shared ?page= link still works.
  const lastView = useRef(view);
  const { resetPage } = pagination;
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    resetPage();
  }, [view, resetPage]);
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
    { key: "all", label: t("area.viewAll"), href: viewHref("all"), icon: Users },
    { key: "area", label: t("area.viewArea"), href: viewHref("area"), icon: MapPin },
  ];

  const EXPERIENCE_OPTIONS = [
    { value: "all", label: t("allExperience") },
    { value: "0", label: t("experienceFresh") },
    { value: "1", label: t("experience1Plus") },
    { value: "3", label: t("experience3Plus") },
    { value: "5", label: t("experience5Plus") },
    { value: "10", label: t("experience10Plus") },
  ];

  const AVAILABILITY_OPTIONS = [
    { value: "all", label: t("allAvailability") },
    { value: "immediate", label: t("availableImmediately") },
    { value: "notice_period", label: t("hasNoticePeriod") },
    { value: "unavailable", label: t("notAvailable") },
  ];

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    pagination.resetPage();
  };

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = pagination.paginationParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.experienceMin !== "all") params.set("experienceMin", filters.experienceMin);
      if (filters.availability !== "all") params.set("availability", filters.availability);
      if (view === "area") params.set("view", "area");
      if (filters.premium === "premium") params.set("premium", "1");
      if (filters.agent !== "all") params.set("agent", filters.agent);

      const res = await fetch(`/api/super-agent/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSeekers(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setTotalStats(data.stats);
        setAreaAssigned(data.areaAssigned !== false);
        if (data.agents) setTeamAgents(data.agents);
        if (data.countries) {
          setCountryOptions([
            { value: "all", label: t("allCountries") },
            ...data.countries.map((c: string) => ({ value: c, label: c })),
          ]);
        }
      } else {
        /* A non-ok response used to fall through silently: the table stayed
           empty and the header read 0 / 0 / 0% / 0, which is indistinguishable
           from a region with no candidates. */
        setLoadFailed(true);
        toast.error(t("failedToLoadJobSeekers"));
      }
    } catch {
      setLoadFailed(true);
      toast.error(t("failedToLoadJobSeekers"));
    } finally {
      setLoading(false);
    }
  }, [filters, view, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  // These four read from the page header's own metric strip, the way the other
  // 18 pages in this role do. They used to render as a second, standalone card
  // grid under the header, which put a block between the header and the list
  // that the layout rule does not allow, and duplicated the header's styling
  // in a different visual language.
  const metricsItems = [
    { label: t("totalCandidates"), value: totalStats.total, note: t("inYourRegion"), icon: Users },
    { label: t("activeProfiles"), value: totalStats.active, note: t("currentlySeeking"), icon: Star },
    { label: t("avgCompletion"), value: `${totalStats.avgCompletion}%`, note: t("profileCompleteness"), icon: GraduationCap },
    { label: t("experienced"), value: totalStats.withExperience, note: t("experiencedHelper"), icon: Briefcase },
  ];

  // The columns on screen, nothing more: this list is region-scoped candidate
  // data (see CandidateDataNotice), so the export does not widen it.
  const exportColumns: ExportColumn<JobSeekerItem>[] = [
    { header: tc("name"), key: "fullName" },
    { header: tc("email"), key: "email" },
    { header: tc("location"), key: "location", formatter: (_v, row) => [row.location, row.country].filter(Boolean).join(", ") },
    { header: t("currentRole"), key: "currentJobTitle" },
    { header: tc("experience"), key: "experienceYears", formatter: (_v, row) => row.experienceYears ? String(row.experienceYears) : "" },
    { header: t("profile"), key: "profileCompletion", formatter: (_v, row) => `${row.profileCompletion ?? 0}%` },
    { header: tc("date"), key: "createdAt", formatter: (_v, row) => formatListDate(row.createdAt) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: seekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-job-seekers",
    title: t("pageTitle"),
  });

  const dropdownFilters = (
    <>
          <SearchableSelect
            options={countryOptions}
            value={filters.country}
            onValueChange={(v) => updateFilter("country", v)}
            placeholder={t("allCountries")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={EXPERIENCE_OPTIONS}
            value={filters.experienceMin}
            onValueChange={(v) => updateFilter("experienceMin", v)}
            placeholder={t("allExperience")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={AVAILABILITY_OPTIONS}
            value={filters.availability}
            onValueChange={(v) => updateFilter("availability", v)}
            placeholder={t("allAvailability")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={[
              { value: "all", label: t("premium.filterAny") },
              { value: "premium", label: t("premium.filterOnly", { count: totalStats.premium }) },
            ]}
            value={filters.premium}
            onValueChange={(v) => updateFilter("premium", v)}
            placeholder={t("premium.filterAny")}
            ariaLabel={t("premium.filterLabel")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={[{ value: "all", label: t("byAgent.filterAll") }, ...teamAgents.map((a) => ({ value: a.id, label: a.name }))]}
            value={filters.agent}
            onValueChange={(v) => updateFilter("agent", v)}
            placeholder={t("byAgent.filterAll")}
            ariaLabel={t("byAgent.filterLabel")}
            className={INLINE_FILTER_CONTROL}
          />
    </>
  );
  const dropdownActiveCount = [
    filters.country !== "all", filters.experienceMin !== "all", filters.availability !== "all",
    filters.premium !== "all", filters.agent !== "all",
  ].filter(Boolean).length;

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={metricsItems}
        // One icon-sized button on phones: keep it on the title's row.
        inlineActions
      >
        <button
          type="button"
          onClick={() => setReferOpen(true)}
          aria-label={t("refer.button")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 max-sm:min-w-11 max-sm:px-0 sm:px-4"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("refer.button")}</span>
        </button>
      </SuperAgentPageIntro>

      <ReferSeekerDialog open={referOpen} onOpenChange={setReferOpen} locale={locale} workspace="super-agent" />

      <div className="workspace-panel-surface rounded-2xl border-b-0 max-sm:hidden">
        {/* The privacy notice sits by the heading on wider screens, so the
            filter bar stays one line; phones (no heading) keep it on the bar. */}
        <div className="flex items-center gap-2">
          <h2 className="heading-section font-semibold text-foreground">{t("browseRegionalCandidates")}</h2>
          <CandidateDataNotice variant="candidateList" compact />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("searchAndFilterDescription")}</p>
      </div>

      <WorkspaceTabs tabs={viewTabs} ariaLabel={t("area.viewLabel")} activeKey={view} />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={(filters.search || filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all" || filters.premium !== "all" || filters.agent !== "all") ? handleClearFilters : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        more={isPhone ? dropdownFilters : undefined}
        moreActiveCount={isPhone ? dropdownActiveCount : 0}
      >
        <InlineFilterSearch
          value={filters.search}
          onChange={(v) => updateFilter("search", v)}
          placeholder={t("searchPlaceholder")}
          className="max-sm:flex-[1_1_7rem]"
        />
        {!isPhone && dropdownFilters}
        {/* Privacy detail at the point candidate data is shown, as an icon +
            popover. It was a full-width text banner above the metrics. */}
        {isPhone && <CandidateDataNotice variant="candidateList" compact />}
      </InlineFilterBar>

      {/* Heading kept for screen readers only, the same convention agents,
          commissions and leads already use: this is the page's one list
          section, sitting directly under the h1, and the visible eyebrow +
          title + sentence only narrated the toolbar below it. */}
      <SuperAgentSection title={t("candidates")} className="[&>div:first-child]:sr-only">
        {loadFailed && !loading ? (
          <ErrorState onRetry={() => fetchSeekers()} />
        ) : (
        <div className="overflow-x-auto">
          <Table className="compact-phone-cards">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[180px]">{tc("name")}</TableHead>
                <TableHead>{t("currentRole")}</TableHead>
                <TableHead>{t("profile")}</TableHead>
                <TableHead>{tc("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={4} />
              ) : seekers.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12">
                    {view === "area" && !filters.search && filters.country === "all" && filters.experienceMin === "all" && filters.availability === "all" && filters.premium === "all" && filters.agent === "all" ? (
                      <EmptyState
                        title={areaAssigned ? t("area.emptyTitle") : t("area.noRegionTitle")}
                        description={areaAssigned ? t("area.emptyDescription") : t("area.noRegionDescription")}
                        icon={MapPin}
                      />
                    ) : (
                      <EmptyState title={t("noJobSeekersFound")} description={t("tryAdjustingFilters")} icon={Users} />
                    )}
                  </TableCell>
                </TableRow>
              ) : seekers.map((s) => (
                <TableRow key={s._id} className="group">
                  <TableCell data-mobile-primary>
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar name={s.fullName} email={s.email} className="mt-0.5 h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0 space-y-0.5">
                        <p className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium text-foreground">{s.fullName}</span>
                          {s.premium && (
                            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-800">
                              <Crown className="h-3 w-3" aria-hidden="true" />
                              {t("premium.chip")}
                            </span>
                          )}
                        </p>
                        {/* Email and location share a line. A location is free
                            text a candidate wrote ("Riyadh, Al Murooj, Saudi
                            Arabia (Transferable Iqama)" is one real value), so
                            each part truncates on its own text, not the row. */}
                        <p className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex min-w-0 shrink items-center gap-1">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{s.email}</span>
                          </span>
                          {(s.location || s.country) && (
                            <span className="flex min-w-0 shrink-[2] items-center gap-1 max-sm:hidden" title={[s.location, s.country].filter(Boolean).join(", ")}>
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{[s.location, s.country].filter(Boolean).join(", ")}</span>
                            </span>
                          )}
                        </p>
                        {/* Who brought them in and whether they live in the
                            region, side by side rather than a line each. */}
                        {(s.referralSummary || s.agent || s.inArea) && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {s.referralSummary ? (
                              <ReferralSourceChip namespace="superAgentJobSeekers" summary={s.referralSummary} />
                            ) : s.agent ? (
                              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{s.agent.via === "added" ? t("byAgent.added", { name: s.agent.name }) : t("byAgent.assigned", { name: s.agent.name })}</span>
                              </span>
                            ) : null}
                            {s.inArea && (
                              <span
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                title={t("area.chipHint")}
                              >
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {t("area.chip")}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Phone card: role, profile and date fold into this line. */}
                        {isPhone && (
                          <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-xs text-muted-foreground">
                            <span className="flex min-w-0 max-w-[12rem] items-center gap-1">
                              <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{s.currentJobTitle || "—"}</span>
                            </span>
                            <span>{s.profileCompletion ?? 0}%</span>
                            <span>{formatListDate(s.createdAt)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm" data-mobile-hidden>
                    {/* Half these profiles were filled from a CV that never wrote a
                        years figure. Printing "0 yrs" beside a role someone
                        holds today asserts no experience, so the figure is
                        left out when it is not recorded. */}
                    <span className="flex max-w-[260px] items-center gap-1.5" title={s.currentJobTitle || undefined}>
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{s.currentJobTitle || "—"}</span>
                      {s.experienceYears ? (
                        <span className="shrink-0 text-xs text-muted-foreground">· {s.experienceYears} {t("yearsAbbr")}</span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell data-mobile-hidden>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.profileCompletion ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.profileCompletion ?? 0}%</span>
                    </div>
                    {(s.skills?.length ?? 0) > 0 && (
                      <div className="mt-1 flex max-w-[240px] items-center gap-1 overflow-hidden">
                        {(s.skills ?? []).slice(0, 2).map((sk) => (
                          <span key={sk} className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{sk}</span>
                        ))}
                        {(s.skills?.length ?? 0) > 2 && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">+{(s.skills?.length ?? 0) - 2}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground" data-mobile-hidden>{formatListDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </SuperAgentSection>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
