"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarClock, DollarSign,
  ShieldCheck, Trophy, Users2,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type VisaStatus = "not_required" | "pending" | "approved" | "rejected" | "stamped";

interface Placement {
  _id: string;
  candidateName?: string;
  candidateEmail?: string;
  jobTitle?: string;
  companyName?: string;
  agentName?: string;
  visaStatus?: string;
  commissionPaid?: boolean;
  commissionAmount?: number;
  salary?: { amount: number; currency: string } | number;
  currency?: string;
  startDate?: string;
  placedAt?: string;
  notes?: string;
  createdAt: string;
  /* legacy field names from old shape */
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  status?: string;
}

interface AgentOption { _id: string; name: string; email: string; }

interface Filters {
  visaStatus: string;
  search: string;
  commissionPaid: string;
  currency: string;
  salaryMin: string;
  salaryMax: string;
  dateFrom: string;
  dateTo: string;
  agentId: string;
  employerId: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  visaStatus: "", search: "", commissionPaid: "", currency: "",
  salaryMin: "", salaryMax: "", dateFrom: "", dateTo: "",
  agentId: "", employerId: "", sortBy: "createdAt", sortOrder: "desc",
};

const VISA_STATUSES: VisaStatus[] = ["not_required", "pending", "approved", "rejected", "stamped"];

// Static currency options - currency codes are data, first label translated at render time
const CURRENCY_OPTIONS = [
  { value: "", label: "" }, // Label will be translated in component
  { value: "AED", label: "AED" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "SAR", label: "SAR" },
  { value: "QAR", label: "QAR" },
  { value: "KWD", label: "KWD" },
  { value: "BHD", label: "BHD" },
  { value: "OMR", label: "OMR" },
  { value: "EGP", label: "EGP" },
  { value: "INR", label: "INR" },
];

// Prepare currency options with translated "All currencies" label
const getCurrencyOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "", label: t("currencyFilterAllLabel") },
  ...CURRENCY_OPTIONS.slice(1),
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.commissionPaid) count++;
  if (f.currency) count++;
  if (f.salaryMin || f.salaryMax) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.agentId) count++;
  if (f.employerId) count++;
  if (f.sortBy !== "createdAt" || f.sortOrder !== "desc") count++;
  return count;
}

function getCandidateName(p: Placement): string {
  return p.candidateName ?? p.jobSeekerId?.fullName ?? "—";
}
function getJobTitle(p: Placement): string {
  return p.jobTitle ?? p.jobId?.title ?? "—";
}
function getCompanyName(p: Placement): string {
  return p.companyName ?? p.employerId?.companyName ?? "—";
}
function getVisaStatus(p: Placement): string {
  return p.visaStatus ?? p.status ?? "pending";
}
function formatPlacementSalary(p: Placement): string {
  // API returns salary as { amount, currency }; tolerate a raw number for safety.
  const raw = p.salary;
  const amount = typeof raw === "number" ? raw : raw?.amount;
  if (amount == null) return "—";
  const currency =
    (typeof raw === "object" ? raw?.currency : undefined) ?? p.currency ?? "AED";
  return `${currency} ${formatCount(amount)}`;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function SuperAgentPlacementsPage() {
  const t = useTranslations("superAgentPlacements");
  const tc = useTranslations("common");
  const tt = useTranslations("table");

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearchState] = useUrlFilter("search", "", { debounceMs: 400 });
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [employers, setEmployers] = useState<{ _id: string; companyName: string }[]>([]);
  const [salaryByCurrency, setSalaryByCurrency] = useState<Record<string, number>>({});
  // Tiles and the visa strip describe the whole filtered set, so they come from
  // the API's aggregates. Counting `placements` only ever saw the current page.
  const [visaCounts, setVisaCounts] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState({ commissionPaid: 0, employers: 0, upcomingStarts: 0 });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const visaLabels: Record<VisaStatus, string> = {
    not_required: t("visaStatusNotRequired"),
    pending: t("visaStatusPending"),
    approved: t("visaStatusApproved"),
    rejected: t("visaStatusRejected"),
    stamped: t("visaStatusStamped"),
  };

  /* -- Fetch agents for filter dropdown -- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/super-agent/agents?limit=200");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents?.map((a: { _id: string; name: string; email: string }) => ({
            _id: a._id, name: a.name, email: a.email,
          })) ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  /* -- Fetch employers for filter dropdown -- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/employers?limit=200&fields=companyName");
        if (res.ok) {
          const data = await res.json();
          const list = data.employers ?? data.items ?? [];
          setEmployers(list.map((e: { _id: string; companyName?: string }) => ({
            _id: e._id, companyName: e.companyName ?? "Unknown",
          })));
        }
      } catch { /* ignore */ }
    })();
  }, []);

  /* -- Fetch placements -- */
  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.visaStatus) params.set("visaStatus", filters.visaStatus);
    if (search.trim()) params.set("search", search.trim());
    if (filters.commissionPaid) params.set("commissionPaid", filters.commissionPaid);
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
    if (filters.salaryMax) params.set("salaryMax", filters.salaryMax);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.agentId) params.set("agentId", filters.agentId);
    if (filters.employerId) params.set("employerId", filters.employerId);
    // Sort was collected by the column heads and the sort selects but never
    // sent — every ordering silently fell back to newest-first.
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

    try {
      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.items ?? data.placements ?? []);
        updateTotal(data.total ?? data.totalCount ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
        if (data.salaryByCurrency) setSalaryByCurrency(data.salaryByCurrency);
        setVisaCounts(data.visaCounts ?? {});
        setTotals(data.totals ?? { commissionPaid: 0, employers: 0, upcomingStarts: 0 });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, search, page, limit, updateTotal]);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

  /* -- Filter helpers -- */
  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPage();
  }, [resetPage]);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    resetPage();
  }, [resetPage]);

  /* -- Column sort -- */
  const toggleSort = useCallback((field: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === "desc" ? "asc" : "desc",
    }));
    resetPage();
  }, [resetPage]);

  const totalSalary = useMemo(
    () => Object.entries(salaryByCurrency).map(([cur, val]) => `${cur} ${formatCount(val)}`).join(" · ") || "—",
    [salaryByCurrency],
  );

  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportCandidate"), key: "candidateName", formatter: (_v, row) => getCandidateName(row as unknown as Placement) },
    { header: t("exportJob"), key: "jobTitle", formatter: (_v, row) => getJobTitle(row as unknown as Placement) },
    { header: t("exportEmployer"), key: "companyName", formatter: (_v, row) => getCompanyName(row as unknown as Placement) },
    { header: t("exportAgent"), key: "agentName" },
    { header: t("exportVisaStatus"), key: "visaStatus", formatter: (_v, row) => getVisaStatus(row as unknown as Placement) },
    { header: t("exportSalary"), key: "salary", formatter: (_v, row) => formatPlacementSalary(row as unknown as Placement) },
    { header: t("exportCurrency"), key: "currency" },
    { header: t("exportCommissionPaid"), key: "commissionPaid", formatter: (v) => v ? tc("yes") : tc("no") },
    { header: t("exportStartDate"), key: "startDate", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
    { header: t("exportPlacedAt"), key: "placedAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-placements",
    title: t("exportTitle"),
  });

  // In the hero strip rather than a card grid of their own. The page used to
  // stack four full cards, a section heading, then five more visa cards before
  // the first placement row — three bands of chrome above the actual list.
  const kpis = [
    { label: t("kpiPlacements"), value: total, note: t("kpiPlacementsHelper"), icon: Trophy },
    { label: t("kpiUpcomingStarts"), value: totals.upcomingStarts, note: t("kpiUpcomingStartsHelper"), icon: CalendarClock },
    { label: t("kpiCommissionPaid"), value: totals.commissionPaid, note: t("kpiCommissionPaidHelper"), icon: DollarSign },
    { label: t("kpiEmployers"), value: totals.employers, note: t("kpiEmployersHelper"), icon: Users2 },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={kpis}
        compactMetrics
      />

      {/* No section heading: "PLACEMENTS / Review successful hiring outcomes /
          Use visa status toggles…" restated the h1 and then narrated the
          controls sitting right below it. */}
      <SuperAgentSection>
        {/* ---- Error State ---- */}
        {error && <ErrorState onRetry={() => fetchPlacements()} />}

        {/* ---- Visa Status Filter Pills ---- */}
        {/* Filter toggles, not statistics: one scrolling row of pills like every
            other listing in the role, replacing five metric cards that
            outweighed the table they filter. Kept on their own line rather than
            inside the toolbar's `left` slot — sharing that row with the search,
            filter and export controls squeezed the column and clipped the last
            pill mid-word at 1440px. */}
        <div className="scrollbar-none -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {VISA_STATUSES.map((s) => {
            const active = filters.visaStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter("visaStatus", active ? "" : s)}
                aria-pressed={active}
                className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm transition-colors ${active ? "border-primary/35 bg-primary/10 font-semibold text-primary" : "border-border/70 bg-card text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}`}
              >
                {visaLabels[s]}
                <span className={`text-xs font-semibold tabular-nums ${active ? "text-primary" : "text-foreground/70"}`}>{visaCounts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {/* ---- Filters: search + commission in plain sight, the rest behind More ---- */}
        <InlineFilterBar
          className="mb-4"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onClear={(activeFilterCount > 0 || filters.visaStatus || search || filters.commissionPaid) ? resetFilters : undefined}
          more={(
            <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
              {/* Salary Summary */}
              {Object.keys(salaryByCurrency).length > 0 && (
                <div className="flex min-w-0 flex-[1_1_100%] items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/40 px-4 py-2.5 text-sm text-emerald-800">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("totalSalaryValue")} <strong>{totalSalary}</strong></span>
                </div>
              )}

              <div className="grid min-w-0 flex-[1_1_100%] grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterCurrency")}</label>
                  <SearchableSelect options={getCurrencyOptions(t)} value={filters.currency} onValueChange={(v) => updateFilter("currency", v)} placeholder={t("filterCurrencyPlaceholder")} searchPlaceholder={t("filterCurrencySearch")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSalaryMin")}</label>
                  <Input type="number" min={0} placeholder={t("filterSalaryMinPlaceholder")} value={filters.salaryMin} onChange={(e) => updateFilter("salaryMin", e.target.value)} className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSalaryMax")}</label>
                  <Input type="number" min={0} placeholder={t("filterSalaryMaxPlaceholder")} value={filters.salaryMax} onChange={(e) => updateFilter("salaryMax", e.target.value)} className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterAgent")}</label>
                  <SearchableSelect options={[{ value: "", label: t("filterAgentPlaceholder") }, ...agents.map((a) => ({ value: a._id, label: a.name || a.email }))]} value={filters.agentId} onValueChange={(v) => updateFilter("agentId", v)} placeholder={t("filterAgentPlaceholder")} searchPlaceholder={t("filterAgentSearch")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterEmployer")}</label>
                  <SearchableSelect options={[{ value: "", label: t("filterEmployerPlaceholder") }, ...employers.map((e) => ({ value: e._id, label: e.companyName }))]} value={filters.employerId} onValueChange={(v) => updateFilter("employerId", v)} placeholder={t("filterEmployerPlaceholder")} searchPlaceholder={t("filterEmployerSearch")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterPlacedFrom")}</label>
                  <DateTimePicker value={filters.dateFrom} onChange={(v) => updateFilter("dateFrom", v)} placeholder={t("filterPlacedFromPlaceholder")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterPlacedTo")}</label>
                  <DateTimePicker value={filters.dateTo} onChange={(v) => updateFilter("dateTo", v)} placeholder={t("filterPlacedToPlaceholder")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSortBy")}</label>
                  <SearchableSelect options={[
                    { value: "createdAt", label: t("sortDateCreated") },
                    { value: "placedAt", label: t("sortPlacedDate") },
                    { value: "startDate", label: t("sortStartDate") },
                    { value: "salary", label: t("sortSalary") },
                  ]} value={filters.sortBy} onValueChange={(v) => updateFilter("sortBy", v)} placeholder={t("sortDateCreated")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSortOrder")}</label>
                  <SearchableSelect options={[{ value: "desc", label: t("sortNewestFirst") }, { value: "asc", label: t("sortOldestFirst") }]} value={filters.sortOrder} onValueChange={(v) => updateFilter("sortOrder", v)} placeholder={t("sortNewestFirst")} />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFilterLabel")}:</span>
                {[
                  { label: t("quickFilterVisaPending"), action: () => updateFilter("visaStatus", "pending") },
                  { label: t("quickFilterCommissionUnpaid"), action: () => updateFilter("commissionPaid", "false") },
                  { label: t("quickFilterThisMonth"), action: () => { const d = new Date(); updateFilter("dateFrom", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); } },
                  { label: t("quickFilterHighSalary"), action: () => updateFilter("salaryMin", "10000") },
                  { label: t("quickFilterVisaApproved"), action: () => updateFilter("visaStatus", "approved") },
                  { label: t("quickFilterStamped"), action: () => updateFilter("visaStatus", "stamped") },
                ].map((chip) => (
                  <button key={chip.label} type="button" onClick={chip.action} className="rounded-lg border border-border/60 bg-secondary/50 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all chip-pad">
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          moreActiveCount={[filters.currency, filters.salaryMin, filters.salaryMax, filters.agentId, filters.employerId, filters.dateFrom, filters.dateTo].filter(Boolean).length}
        >
          <InlineFilterSearch
            value={search}
            onChange={(v) => { setSearchState(v); resetPage(); }}
            placeholder={t("searchPlaceholder")}
          />
          {/* Commission Toggle */}
          {[
            { value: "", label: tc("all") },
            { value: "true", label: t("commissionPaid") },
            { value: "false", label: t("unpaid") },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateFilter("commissionPaid", filters.commissionPaid === opt.value ? "" : opt.value)}
              aria-pressed={filters.commissionPaid === opt.value}
              className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
                filters.commissionPaid === opt.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/70 bg-card text-muted-foreground hover:border-border hover:bg-secondary/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </InlineFilterBar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[180px]">{t("columnCandidate")}</TableHead>
                <TableHead>{t("columnJob")}</TableHead>
                <TableHead>
                  <SortableTableHeader label={t("columnSalary")} active={filters.sortBy === "salary"} order={filters.sortOrder as "asc" | "desc"} onClick={() => toggleSort("salary")} />
                </TableHead>
                <TableHead>
                  <SortableTableHeader label={t("columnStartDate")} active={filters.sortBy === "startDate"} order={filters.sortOrder as "asc" | "desc"} onClick={() => toggleSort("startDate")} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={4} />
              ) : placements.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12">
                    <EmptyState
                      title={t("emptyStateTitle")}
                      description={
                        filters.search || filters.visaStatus || activeFilterCount > 0
                          ? t("emptyStateFiltered")
                          : t("emptyStateDefault")
                      }
                      icon={Trophy}
                    />
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => (
                <TableRow key={p._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={getCandidateName(p)} email={p.candidateEmail} className="h-9 w-9" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">{getCandidateName(p)}</p>
                        {p.candidateEmail && <p className="truncate text-xs text-muted-foreground">{p.candidateEmail}</p>}
                        <StatusBadge status={getVisaStatus(p)} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground/85">
                    <span className="block">{getJobTitle(p)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{getCompanyName(p)}</span>
                  </TableCell>
                  <TableCell className="text-foreground/85 tabular-nums">
                    <span className="block">{formatPlacementSalary(p)}</span>
                    {p.commissionPaid ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        <ShieldCheck className="h-3 w-3" /> {t("commissionBadgePaid")}{p.commissionAmount ? ` · ${formatCount(p.commissionAmount)}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("commissionBadgeUnpaid")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block">{p.startDate ? formatDate(new Date(p.startDate), { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                    <span className="mt-1 block text-xs">{p.placedAt ? formatDate(new Date(p.placedAt), { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SuperAgentSection>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
