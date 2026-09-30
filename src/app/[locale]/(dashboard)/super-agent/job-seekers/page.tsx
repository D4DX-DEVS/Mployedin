"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  Star, MapPin, Mail,
} from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
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
}

interface Filters {
  search: string;
  country: string;
  experienceMin: string;
  availability: string;
}

const INITIAL_FILTERS: Filters = { search: "", country: "all", experienceMin: "all", availability: "all" };

// These will be constructed inside component with i18n
// const EXPERIENCE_OPTIONS = [...]
// const AVAILABILITY_OPTIONS = [...]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentJobSeekersPage() {
  const t = useTranslations("superAgentJobSeekers");
  const tc = useTranslations("common");

  const [seekers, setSeekers] = useState<JobSeekerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: t("allCountries") }]);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, avgCompletion: 0, withExperience: 0 });
  const pagination = usePagination();

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
      if (filters.search) params.set("search", filters.search);
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.experienceMin !== "all") params.set("experienceMin", filters.experienceMin);
      if (filters.availability !== "all") params.set("availability", filters.availability);

      const res = await fetch(`/api/super-agent/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSeekers(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setTotalStats(data.stats);
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
  }, [filters, pagination.page, pagination.limit]);

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

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={metricsItems}
      />

      <div className="workspace-panel-surface rounded-2xl border-b-0">
        <h2 className="heading-section font-semibold text-foreground">{t("browseRegionalCandidates")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("searchAndFilterDescription")}</p>
      </div>

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={(filters.search || filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all") ? handleClearFilters : undefined}
      >
        <InlineFilterSearch
          value={filters.search}
          onChange={(v) => updateFilter("search", v)}
          placeholder={t("searchPlaceholder")}
        />
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
        {/* Privacy detail at the point candidate data is shown, as an icon +
            popover. It was a full-width text banner above the metrics. */}
        <CandidateDataNotice variant="candidateList" compact />
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
          <Table>
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
                    <EmptyState title={t("noJobSeekersFound")} description={t("tryAdjustingFilters")} icon={Users} />
                  </TableCell>
                </TableRow>
              ) : seekers.map((s) => (
                <TableRow key={s._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={s.fullName} email={s.email} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">{s.fullName}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{s.email}</span>
                        </p>
                        {/* A location is free text a candidate wrote — "Riyadh, Al
                            Murooj, Saudi Arabia (Transferable Iqama)" is one real
                            value — so the line is clamped. `truncate` has to sit on
                            the text, not on the inline-flex row, or it paints no
                            ellipsis. */}
                        <span className="flex max-w-[260px] items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate" title={[s.location, s.country].filter(Boolean).join(", ")}>
                            {[s.location, s.country].filter(Boolean).join(", ") || "—"}
                          </span>
                        </span>
                        {s.referralSummary ? (
                          <span className="mt-1 block">
                            <ReferralSourceChip namespace="superAgentJobSeekers" summary={s.referralSummary} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex max-w-[240px] items-center gap-1.5 truncate" title={s.currentJobTitle || undefined}>
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{s.currentJobTitle || "—"}</span>
                    </span>
                    {/* Half these profiles were filled from a CV that never wrote a
                        years figure. Printing "0 yrs" beside a role someone
                        holds today asserts no experience; a dash says the
                        figure is not recorded, which is what is true. */}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {s.experienceYears ? `${s.experienceYears} ${t("yearsAbbr")}` : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.profileCompletion ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.profileCompletion ?? 0}%</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(s.skills ?? []).slice(0, 3).map((sk) => (
                        <span key={sk} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{sk}</span>
                      ))}
                      {(s.skills?.length ?? 0) > 3 && (
                        <span className="text-[11px] text-muted-foreground">+{(s.skills?.length ?? 0) - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(s.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}

        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      </SuperAgentSection>
    </div>
  );
}
