"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { usePagination } from "@/hooks/usePagination";
import { formatLocalizedLocation } from "@/lib/i18n/locations";
import {
  Search, MapPin, Users, Briefcase,
  RotateCcw, Inbox, CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompanyItem {
  _id: string;
  companyName: string;
  logo?: string;
  industry?: string;
  companySize?: string;
  /* Employer has no `city` field, so the directory shows country only. */
  country?: string;
  website?: string;
  activeJobCount: number;
  domainVerified?: boolean;
}

const ALL_INDUSTRIES = "all";
const SEARCH_DEBOUNCE_MS = 300;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompaniesListPage() {
  const t = useTranslations("jobSeekerCompanies");
  const locale = useLocale();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState(ALL_INDUSTRIES);
  const [industries, setIndustries] = useState<string[]>([]);
  const pagination = usePagination();
  const { resetPage } = pagination;

  // Typing must not fire a request (and a router.replace) per keystroke.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => {
      setSearch(searchInput);
      resetPage();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search, resetPage]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (industryFilter && industryFilter !== ALL_INDUSTRIES) params.set("industry", industryFilter);
      const res = await fetch(`/api/companies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        // Server-side facet across every hiring employer. Deriving this from the
        // current page only ever listed the industries of the 12 visible cards.
        setIndustries(Array.isArray(data.industries) ? data.industries : []);
      } else {
        setLoadError(true);
        toast.error(t("loadFailed"));
      }
    } catch {
      setLoadError(true);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, industryFilter, pagination.page, pagination.limit, t]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const filtersActive = search.length > 0 || industryFilter !== ALL_INDUSTRIES;

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setIndustryFilter(ALL_INDUSTRIES);
    resetPage();
  };

  return (
    <div className="page-container">
      {/* PageHeader, not PageHero: the hero belongs to the staff roles' workspace
          shell. Every other seeker route (applications, interviews, offers, CV,
          preferences) opens with this header, and an icon-and-gradient banner on
          two of them made those two read as a different product. */}
      <PageHeader title={t("title")} description={t("description")} />

      <section className="workspace-panel-surface rounded-3xl panel-body">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="ps-9"
              aria-label={t("searchPlaceholder")}
            />
          </div>
          {/* Select and Reset share a row on phones so the filter bar stays two
              lines instead of three. */}
          <div className="flex items-center gap-2">
            {industries.length > 0 && (
              <Select value={industryFilter} onValueChange={(val) => { setIndustryFilter(val); resetPage(); }}>
                <SelectTrigger className="flex-1 lg:w-56 lg:flex-none" aria-label={t("filterByIndustry")}>
                  <SelectValue placeholder={t("allIndustries")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_INDUSTRIES}>{t("allIndustries")}</SelectItem>
                  {industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!filtersActive} className="flex-shrink-0">
              <RotateCcw className="me-1 h-4 w-4" /> {t("reset")}
            </Button>
          </div>
        </div>
        {!loading && !loadError && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("results", { count: pagination.total })}
          </p>
        )}
      </section>

      <section className="workspace-panel-surface rounded-3xl panel-body">
        {loading ? (
          <ListSkeleton count={6} layout="grid" itemClassName="h-32" />
        ) : loadError ? (
          <EmptyState
            icon={Inbox}
            title={t("loadFailed")}
            action={
              <Button variant="outline" size="sm" onClick={fetchCompanies}>
                <RotateCcw className="me-1 h-4 w-4" /> {t("retry")}
              </Button>
            }
          />
        ) : companies.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t("empty")}
            action={filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RotateCcw className="me-1 h-4 w-4" /> {t("reset")}
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companies.map((c) => (
              <Link
                key={c._id}
                href={`/${locale}/job-seeker/companies/${c._id}`}
                /* flex column with an mt-auto footer so every card in a row is
                   the same height and their meta rows line up. */
                className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted text-lg font-bold text-muted-foreground">
                    {c.logo ? (
                      <img src={c.logo} alt={c.companyName} className="h-full w-full object-cover" />
                    ) : (
                      c.companyName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {c.companyName}
                      </p>
                      {c.domainVerified && (
                        <CheckCircle2
                          role="img"
                          aria-label={t("verified")}
                          className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500"
                        />
                      )}
                    </div>
                    {c.industry && (
                      <span className="mt-1 inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <span className="truncate">{c.industry}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* No description on the card. Only a minority of employers write
                    one, and reserving a stretched slot for it left the rest with a
                    ~60px void just to keep the row heights equal. The blurb lives
                    on the company profile; the grid stays scannable. */}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    {c.country && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {formatLocalizedLocation({ country: c.country }, locale, { remoteLabel: t("remote"), fallback: "" })}
                        </span>
                      </span>
                    )}
                    {c.companySize && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3 flex-shrink-0" /> {c.companySize}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">
                    <Briefcase className="h-3 w-3 flex-shrink-0" /> {t("openJobs", { count: c.activeJobCount })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {pagination.total > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}
    </div>
  );
}
