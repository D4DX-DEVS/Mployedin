"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PageHero } from "@/components/shared/PageHero";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { usePagination } from "@/hooks/usePagination";
import { formatLocalizedLocation } from "@/lib/i18n/locations";
import {
  Search, Building2, MapPin, Globe, Users, Briefcase,
  RotateCcw, Inbox, CheckCircle2, Star,
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
  city?: string;
  country?: string;
  website?: string;
  description?: string;
  activeJobCount: number;
  domainVerified?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompaniesListPage() {
  const t = useTranslations("jobSeekerCompanies");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const pagination = usePagination();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (industryFilter && industryFilter !== "all") params.set("industry", industryFilter);
      const res = await fetch(`/api/companies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (!industryFilter && data.items) {
          const uniqueIndustries = Array.from(new Set(
            (data.items as CompanyItem[]).filter((c) => c.industry).map((c) => c.industry as string)
          )).sort();
          setIndustries(uniqueIndustries);
        }
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

  return (
    <div className="space-y-6">
      <PageHero icon={Building2} title={t("title")} description={t("description")} />

      <section className="workspace-panel-surface rounded-3xl space-y-3 panel-body">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.resetPage(); }}
              className="ps-9"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setIndustryFilter(""); pagination.resetPage(); }}>
            <RotateCcw className="me-1 h-4 w-4" /> {t("reset")}
          </Button>
        </div>
        {industries.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">{t("filterByIndustry") ?? "Industry"}</label>
            <Select value={industryFilter} onValueChange={(val) => { setIndustryFilter(val); pagination.resetPage(); }}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t("allIndustries") ?? "All Industries"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allIndustries") ?? "All Industries"}</SelectItem>
                {industries.map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section className="workspace-panel-surface rounded-3xl panel-body">
        {loading ? (
          <ListSkeleton count={6} layout="grid" itemClassName="h-40" />
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
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companies.map((c) => (
              <Link
                key={c._id}
                href={`/${locale}/job-seeker/companies/${c._id}`}
                className="workspace-glass-panel rounded-2xl p-5 transition-all hover:ring-2 hover:ring-primary/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
                    {c.logo ? (
                      <img src={c.logo} alt={c.companyName} className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      c.companyName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{c.companyName}</p>
                      {c.domainVerified && (
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                      )}
                    </div>
                    {c.industry && (
                      <p className="text-xs text-muted-foreground">{c.industry}</p>
                    )}
                  </div>
                </div>

                {c.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(c.city || c.country) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatLocalizedLocation({ city: c.city, country: c.country }, locale, { remoteLabel: t("remote"), fallback: "" })}
                    </span>
                  )}
                  {c.companySize && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {c.companySize}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    <Briefcase className="h-3 w-3" /> {t("openJobs", { count: c.activeJobCount.toLocaleString(numberLocale) })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

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
