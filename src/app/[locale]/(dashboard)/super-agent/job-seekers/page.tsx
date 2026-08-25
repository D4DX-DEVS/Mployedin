"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  RotateCcw, Users, Briefcase, GraduationCap,
  Star, Eye, Mail, Phone, Globe, MapPin,
} from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobSeekerItem {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  city?: string;
  currentJobTitle?: string;
  experienceYears?: number;
  profileCompletion?: number;
  skills?: string[];
  createdAt: string;
  isActive?: boolean;
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
  const tt = useTranslations("table");

  const [seekers, setSeekers] = useState<JobSeekerItem[]>([]);
  const [loading, setLoading] = useState(true);
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
      }
    } catch {
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

  const metricsItems = [
    { label: t("totalCandidates"), value: totalStats.total, helper: t("inYourRegion"), icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: t("activeProfiles"), value: totalStats.active, helper: t("currentlySeeking"), icon: <Star className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: t("avgCompletion"), value: `${totalStats.avgCompletion}%`, helper: t("profileCompleteness"), icon: <GraduationCap className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
    { label: t("experienced"), value: totalStats.withExperience, helper: t("experiencedHelper"), icon: <Briefcase className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
  ];

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
      />
      {/* Privacy information where candidate personal data is first shown,
          rather than only behind a footer link. */}
      <CandidateDataNotice variant="candidateList" />

      <SuperAgentMetricsGrid items={metricsItems} />

      <TableToolbar
        title={t("browseRegionalCandidates")}
        description={t("searchAndFilterDescription")}
        search={filters.search}
        onSearchChange={(v) => updateFilter("search", v)}
        searchPlaceholder={t("searchPlaceholder")}
        hasActiveFilters={filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all"}
        actions={
          (filters.search || filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all") ? (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("reset")}
            </button>
          ) : undefined
        }
        filterContent={
          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              options={countryOptions}
              value={filters.country}
              onValueChange={(v) => updateFilter("country", v)}
              placeholder={t("allCountries")}
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={EXPERIENCE_OPTIONS}
              value={filters.experienceMin}
              onValueChange={(v) => updateFilter("experienceMin", v)}
              placeholder={t("allExperience")}
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={AVAILABILITY_OPTIONS}
              value={filters.availability}
              onValueChange={(v) => updateFilter("availability", v)}
              placeholder={t("allAvailability")}
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
          </div>
        }
      />

      <SuperAgentSection
        eyebrow={t("directory")}
        title={t("candidates")}
      >
        <div className="overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]">{tc("name")}</TableHead>
                <TableHead>{t("currentRole")}</TableHead>
                <TableHead>{t("profile")}</TableHead>
                <TableHead>{tc("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : seekers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Users className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{t("noJobSeekersFound")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("tryAdjustingFilters")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : seekers.map((s) => (
                <TableRow key={s._id} className="bg-transparent">
                  <TableCell>
                    <p className="font-medium text-foreground">{s.fullName}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {[s.city, s.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block">{s.currentJobTitle || "—"}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{s.experienceYears != null ? `${s.experienceYears} ${t("yearsAbbr")}` : "—"}</span>
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
                        <span key={sk} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{sk}</span>
                      ))}
                      {(s.skills?.length ?? 0) > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{(s.skills?.length ?? 0) - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(s.createdAt))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
          />
        </div>
      </SuperAgentSection>
    </div>
  );
}
