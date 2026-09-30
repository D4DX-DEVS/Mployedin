"use client";
import { useQueryFlag } from "@/hooks/useQueryFlag";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormError, formErrorFromResponse } from "@/lib/errors/form-error";
import { validatePasswordForForm, PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, DollarSign,
  Link2, LogIn, Mail, ShieldCheck, UserPlus, Users,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";
import { ReferralLinkDialog } from "@/components/features/super-agent/ReferralLinkDialog";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  assignedAgent?: { name: string };
  /** Its agent is on my team, so I can enter the account (tenant switch). */
  canEnterAccount?: boolean;
  jobCount?: number;
  totalPaid?: number;
  isAgentVerified?: boolean;
}

/* ── Filter types ── */
interface Filters extends Record<string, string> {
  search: string;
  industry: string;
  location: string;
  status: string;
  verified: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  search: "", industry: "", location: "", status: "", verified: "",
  sortBy: "name", sortOrder: "asc",
};

interface Facets {
  industries: string[];
  locations: string[];
}


function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.industry) count++;
  if (f.location) count++;
  if (f.status) count++;
  if (f.verified) count++;
  if (f.sortBy !== "name" || f.sortOrder !== "asc") count++;
  return count;
}

export default function SuperAgentEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();
  const locale = useLocale();

  const { filters, setFilter, resetFilters } = useUrlFilters(
    INITIAL_FILTERS,
    { debounceKeys: ["search"], debounceMs: 400 }
  );
  const t = useTranslations("superAgentEmployers");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  const tt = useTranslations("table");

  const statusOptions = useMemo(() => [
    { value: "", label: tc("all") },
    { value: "active", label: tc("active") },
    { value: "inactive", label: tc("inactive") },
  ], [tc]);

  const verifiedOptions = useMemo(() => [
    { value: "", label: tc("all") },
    { value: "verified", label: t("verified") },
    { value: "unverified", label: t("notVerified") },
  ], [t, tc]);

  const sortOptions = useMemo(() => [
    { value: "name", label: tc("name") },
    { value: "email", label: tc("email") },
    { value: "createdAt", label: t("dateJoined") },
  ], [t, tc]);

  const [facets, setFacets] = useState<Facets>({ industries: [], locations: [] });
  const [serverStats, setServerStats] = useState<{ total: number; active: number; assigned: number } | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  // Addressable as ?new=1: the global Create menu links straight to the
  // onboarding modal, which previously opened only from this page's own button.
  const [onboardOpen, setOnboardOpen] = useQueryFlag("new");
  const [referralDialogOpen, setReferralDialogOpen] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [switchingEmployerId, setSwitchingEmployerId] = useState<string | null>(null);

  const handleSwitchToEmployerView = async (employerId: string) => {
    setSwitchingEmployerId(employerId);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (res.ok) {
        router.push(`/${locale}/employer`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("switchError"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  // Cities in this super agent's territory. An employer onboarded into one of
  // them is in their book — without it the new company had no link to them
  // and vanished from this list the moment it was created.
  const [territoryCities, setTerritoryCities] = useState<Array<{ _id: string; name: string; stateName: string }>>([]);
  useEffect(() => {
    fetch("/api/super-agent/territory/cities")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTerritoryCities(data?.cities ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  const onboardFields: CrudField[] = useMemo(() => [
    { name: "name", label: t("contactNameLabel"), type: "text", required: true },
    { name: "email", label: tc("email"), type: "text", required: true },
    { name: "password", label: t("tempPasswordLabel"), type: "password", required: true, placeholder: tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }), hint: tf("passwordHint", { min: PASSWORD_MIN_LENGTH }) },
    { name: "companyName", label: t("companyNameLabel"), type: "text", required: true },
    { name: "industry", label: t("industryLabel"), type: "text" },
    { name: "phone", label: tc("phone"), type: "phone" },
    ...(territoryCities.length > 0
      ? [{
          name: "cityId",
          label: t("cityLabel"),
          type: "select" as const,
          required: true,
          placeholder: t("cityPlaceholder"),
          hint: t("cityHint"),
          options: territoryCities.map((c) => ({ value: c._id, label: c.stateName ? `${c.name}, ${c.stateName}` : c.name })),
        }]
      : []),
  ], [t, tc, tf, territoryCities]);

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), distinct: "true" });
      if (filters.search) params.set("search", filters.search);
      if (filters.industry) params.set("industry", filters.industry);
      if (filters.location) params.set("location", filters.location);
      if (filters.status) params.set("status", filters.status);
      if (filters.verified) params.set("verified", filters.verified);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? data.employers?.length ?? 0);
        if (data.stats) setServerStats(data.stats);
        if (data.facets) setFacets(data.facets);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, updateTotal]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  /* ── Column sort ── */
  const toggleSort = useCallback((field: string) => {
    const newOrder = filters.sortBy === field && filters.sortOrder === "asc" ? "desc" : "asc";
    setFilter("sortBy", field);
    setFilter("sortOrder", newOrder);
    resetPage();
  }, [filters.sortBy, filters.sortOrder, setFilter, resetPage]);

  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = useMemo(() => [
    { header: t("companyHeader"), key: "companyName", formatter: (_v, row) => String((row as unknown as Employer).companyName ?? (row as unknown as Employer).name ?? "") },
    { header: tc("email"), key: "email" },
    { header: t("industryHeader"), key: "industry" },
    { header: t("locationHeader"), key: "location" },
    { header: t("agentHeader"), key: "assignedAgent", formatter: (_v, row) => (row.assignedAgent as { name?: string })?.name ?? t("unassigned") },
    { header: t("activeHeader"), key: "isActive", formatter: (v) => v ? tc("yes") : tc("no") },
    { header: t("jobsHeader"), key: "jobCount" },
  ], [t, tc]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: t("exportFilename"),
    title: t("pageTitle"),
  });

  const stats = useMemo(() => ({
    total: serverStats?.total ?? employers.length,
    active: serverStats?.active ?? employers.filter((e) => e.isActive).length,
    assigned: serverStats?.assigned ?? employers.filter((e) => Boolean(e.assignedAgent?.name)).length,
    revenue: employers.reduce((sum, employer) => sum + (employer.totalPaid ?? 0), 0),
  }), [employers, serverStats]);

  const handleOnboard = async (values: Record<string, string>) => {
    const passwordError = validatePasswordForForm(values.password ?? "", { locale, t: tf });
    if (passwordError) throw new FormError(passwordError);
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: onboardFields, conflict: tf("emailInUse") });
    }
    setOnboardOpen(false);
    loadEmployers();
  };

  /* ── Column sort order for the header controls ── */
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summary={{
          label: t("summaryTitle"),
          value: `${stats.total} ${t("employerAccounts")}`,
          note: t("summaryDescription"),
        }}
        metrics={[
          { label: t("activeAccountsLabel"), value: stats.active, icon: ShieldCheck },
          { label: t("assignedLabel"), value: stats.assigned, icon: Users },
          { label: t("revenueLabel"), value: stats.revenue > 0 ? formatCurrency(stats.revenue, currencyCode) : "—", icon: DollarSign },
        ]}
        compactMetrics
      >
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setOnboardOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            {t("onboardButton")}
          </button>
          <button
            onClick={() => setReferralDialogOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
          >
            <Link2 className="h-3.5 w-3.5" />
            {t("referralButton")}
          </button>
        </div>
      </SuperAgentPageIntro>

      {/* Heading kept for screen readers only, the same convention agents,
          commissions and leads already use: this is the page's one list
          section, sitting directly under the h1, and the visible eyebrow +
          title + sentence only narrated the toolbar below it. */}
      <SuperAgentSection title={t("sectionTitle")} className="[&>div:first-child]:sr-only">
        {/* ---- Error State ---- */}
        {error && <ErrorState onRetry={() => loadEmployers()} />}

        {/* ── Search + everyday filters in plain sight, the rest behind More ── */}
        <InlineFilterBar
          className="mb-4"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onClear={(activeFilterCount > 0 || filters.search) ? () => { resetFilters(); resetPage(); } : undefined}
          more={(
            <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
              <div className="grid min-w-0 flex-[1_1_100%] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Verification */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("verificationLabel")}</label>
                  <SearchableSelect
                    options={verifiedOptions}
                    value={filters.verified}
                    onValueChange={(v) => { setFilter("verified", v); resetPage(); }}
                    placeholder={tc("all")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sortByLabel")}</label>
                  <SearchableSelect
                    options={sortOptions}
                    value={filters.sortBy}
                    onValueChange={(v) => { setFilter("sortBy", v); resetPage(); }}
                    placeholder={tc("name")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort Order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sortOrderLabel")}</label>
                  <SearchableSelect
                    options={[
                      { value: "asc", label: t("ascending") },
                      { value: "desc", label: t("descending") },
                    ]}
                    value={filters.sortOrder}
                    onValueChange={(v) => { setFilter("sortOrder", v); resetPage(); }}
                    placeholder={t("ascending")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFilters")}:</span>
                {[
                  { label: t("activeOnly"), action: () => { setFilter("status", "active"); resetPage(); } },
                  { label: t("inactiveOnly"), action: () => { setFilter("status", "inactive"); resetPage(); } },
                  { label: t("verifiedOnly"), action: () => { setFilter("verified", "verified"); resetPage(); } },
                  { label: t("notVerifiedOnly"), action: () => { setFilter("verified", "unverified"); resetPage(); } },
                  { label: t("newestFirst"), action: () => { setFilter("sortBy", "createdAt"); setFilter("sortOrder", "desc"); resetPage(); } },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={chip.action}
                    className="rounded-lg border border-border/60 bg-secondary/50 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all chip-pad"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          moreActiveCount={[filters.verified].filter(Boolean).length}
        >
          <InlineFilterSearch
            value={filters.search}
            onChange={(v) => { setFilter("search", v); resetPage(); }}
            placeholder={t("searchPlaceholder")}
          />
          <SearchableSelect
            options={[{ value: "", label: t("allIndustries") }, ...facets.industries.map((i) => ({ value: i, label: i }))]}
            value={filters.industry}
            onValueChange={(v) => { setFilter("industry", v); resetPage(); }}
            placeholder={t("allIndustries")}
            searchPlaceholder={t("searchIndustry")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={[{ value: "", label: t("allLocations") }, ...facets.locations.map((l) => ({ value: l, label: l }))]}
            value={filters.location}
            onValueChange={(v) => { setFilter("location", v); resetPage(); }}
            placeholder={t("allLocations")}
            searchPlaceholder={t("searchLocation")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={statusOptions}
            value={filters.status}
            onValueChange={(v) => { setFilter("status", v); resetPage(); }}
            placeholder={tc("all")}
            className={INLINE_FILTER_CONTROL}
          />
        </InlineFilterBar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[180px]">
                  <SortableTableHeader label={t("companyHeader")} active={filters.sortBy === "name"} order={sortOrder} onClick={() => toggleSort("name")} />
                </TableHead>
                <TableHead className="min-w-[180px]">
                  <SortableTableHeader label={t("contactHeader")} active={filters.sortBy === "email"} order={sortOrder} onClick={() => toggleSort("email")} />
                </TableHead>
                <TableHead>{t("industryHeader")}</TableHead>
                <TableHead>{t("agentHeader")}</TableHead>
                <TableHead className="w-[80px] text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={5} />
              ) : employers.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <EmptyState title={t("noEmployersFound")} description={t("noEmployersHint")} icon={Building2} />
                  </TableCell>
                </TableRow>
              ) : employers.map((em) => (
                <TableRow key={em._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={em.companyName ?? em.name} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">{em.companyName ?? em.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {em.isAgentVerified && (
                            <span className="text-[11px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">{t("verified")}</span>
                          )}
                          <StatusBadge status={em.isActive ? "active" : "inactive"} />
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="break-all">{em.email}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block">{em.industry ?? "—"}</span>
                    <span className="mt-1 block text-xs">{em.location ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{em.assignedAgent?.name ?? t("unassigned")}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      name={em.companyName ?? em.name}
                      quick={em.canEnterAccount ? [
                        {
                          key: "switch",
                          label: t("switchButtonAriaLabel", { company: em.companyName ?? em.name }),
                          icon: LogIn,
                          iconOnly: true,
                          pending: switchingEmployerId === em._id,
                          disabled: switchingEmployerId === em._id || !em.isActive,
                          onSelect: () => { void handleSwitchToEmployerView(em._id); },
                        },
                      ] : []}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SuperAgentSection>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        title={t("onboardModalTitle")}
        fields={onboardFields}
        onSubmit={handleOnboard}
      />

      <ReferralLinkDialog
        open={referralDialogOpen}
        onClose={() => setReferralDialogOpen(false)}
      />
    </div>
  );
}
