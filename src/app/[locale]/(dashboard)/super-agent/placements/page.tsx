"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown, CalendarClock, ChevronDown, ChevronUp, DollarSign,
  RotateCcw, ShieldCheck, Trophy, Users2,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

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

// Static currency options - labels are currency codes, not translated
const CURRENCY_OPTIONS = [
  { value: "", label: "All currencies" }, // Will be translated in component
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
  return `${currency} ${amount.toLocaleString()}`;
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
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [employers, setEmployers] = useState<{ _id: string; companyName: string }[]>([]);
  const [salaryByCurrency, setSalaryByCurrency] = useState<Record<string, number>>({});
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
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.visaStatus) params.set("visaStatus", filters.visaStatus);
    if (filters.search) params.set("search", filters.search);
    if (filters.commissionPaid) params.set("commissionPaid", filters.commissionPaid);
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
    if (filters.salaryMax) params.set("salaryMax", filters.salaryMax);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.agentId) params.set("agentId", filters.agentId);
    if (filters.employerId) params.set("employerId", filters.employerId);

    try {
      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.items ?? data.placements ?? []);
        updateTotal(data.total ?? data.totalCount ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
        if (data.salaryByCurrency) setSalaryByCurrency(data.salaryByCurrency);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [filters, page, limit, updateTotal]);

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

  /* -- Computed counts -- */
  const visaCounts = useMemo(() => {
    return VISA_STATUSES.reduce((acc, s) => {
      acc[s] = placements.filter((p) => getVisaStatus(p) === s).length;
      return acc;
    }, {} as Record<VisaStatus, number>);
  }, [placements]);

  const upcomingStarts = useMemo(() => placements.filter((p) => {
    const d = p.startDate;
    if (!d) return false;
    const start = new Date(d).getTime();
    if (Number.isNaN(start)) return false;
    const now = Date.now();
    return start >= now && start <= now + 14 * 24 * 60 * 60 * 1000;
  }).length, [placements]);

  const employerCount = useMemo(
    () => new Set(placements.map((p) => getCompanyName(p)).filter((n) => n !== "—")).size,
    [placements],
  );

  const totalSalary = useMemo(
    () => Object.entries(salaryByCurrency).map(([cur, val]) => `${cur} ${val.toLocaleString()}`).join(" · ") || "—",
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
    { header: t("exportStartDate"), key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: t("exportPlacedAt"), key: "placedAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-placements",
    title: "Placements",
  });

  const kpis = [
    {
      label: t("kpiPlacements"),
      value: total,
      helper: t("kpiPlacementsHelper"),
      icon: <Trophy className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: t("kpiUpcomingStarts"),
      value: upcomingStarts,
      helper: t("kpiUpcomingStartsHelper"),
      icon: <CalendarClock className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("kpiCommissionPaid"),
      value: placements.filter((p) => p.commissionPaid).length,
      helper: t("kpiCommissionPaidHelper"),
      icon: <DollarSign className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: t("kpiEmployers"),
      value: employerCount,
      helper: t("kpiEmployersHelper"),
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Sortable Header Cell                                            */
  /* ---------------------------------------------------------------- */

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    const active = filters.sortBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="group inline-flex items-center gap-1 text-muted-foreground/80 hover:text-foreground transition-colors"
      >
        {children}
        {active ? (
          filters.sortOrder === "asc"
            ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
            : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summaryTitle={t("summaryTitle")}
        summaryDescription={t("summaryDescription")}
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow={t("sectionEyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
      >
        {/* ---- Visa Status Strip ---- */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {VISA_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter("visaStatus", filters.visaStatus === s ? "" : s)}
                aria-pressed={filters.visaStatus === s}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${filters.visaStatus === s ? "border-primary/35 bg-primary/10 shadow-sm shadow-primary/15" : "border-border/70 bg-background/85 hover:border-border hover:bg-secondary/80"}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{visaLabels[s]}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{visaCounts[s]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ---- Merged Filters via TableToolbar ---- */}
        <TableToolbar
          search={filters.search}
          onSearchChange={(v) => updateFilter("search", v)}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={activeFilterCount > 0 || !!filters.visaStatus || !!filters.commissionPaid}
          actions={
            <div className="flex items-center gap-2">
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
              {(activeFilterCount > 0 || filters.visaStatus || filters.search || filters.commissionPaid) && (
                <button type="button" onClick={resetFilters} className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all">
                  <RotateCcw className="h-3.5 w-3.5" /> {t("reset")}
                </button>
              )}
            </div>
          }
          filterContent={
            <div className="space-y-4">
              {/* Salary Summary */}
              {Object.keys(salaryByCurrency).length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/40 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span>{t("totalSalaryValue")} <strong>{totalSalary}</strong></span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterCurrency")}</label>
                  <SearchableSelect options={[{ value: "", label: t("filterCurrencyPlaceholder") }, ...CURRENCY_OPTIONS.slice(1)]} value={filters.currency} onValueChange={(v) => updateFilter("currency", v)} placeholder={t("filterCurrencyPlaceholder")} searchPlaceholder={t("filterCurrencySearch")} />
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
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFilterLabel")}:</span>
                {[
                  { label: t("quickFilterVisaPending"), action: () => updateFilter("visaStatus", "pending") },
                  { label: t("quickFilterCommissionUnpaid"), action: () => updateFilter("commissionPaid", "false") },
                  { label: t("quickFilterThisMonth"), action: () => { const d = new Date(); updateFilter("dateFrom", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); } },
                  { label: t("quickFilterHighSalary"), action: () => updateFilter("salaryMin", "10000") },
                  { label: t("quickFilterVisaApproved"), action: () => updateFilter("visaStatus", "approved") },
                  { label: t("quickFilterStamped"), action: () => updateFilter("visaStatus", "stamped") },
                ].map((chip) => (
                  <button key={chip.label} type="button" onClick={chip.action} className="rounded-lg border border-border/60 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all">
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          }
          className="mb-4"
        />
        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]"><SortHeader field="candidateName">{t("columnCandidate")}</SortHeader></TableHead>
                <TableHead>{t("columnJob")}</TableHead>
                <TableHead><SortHeader field="salary">{t("columnSalary")}</SortHeader></TableHead>
                <TableHead><SortHeader field="startDate">{t("columnStartDate")}</SortHeader></TableHead>
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
              ) : placements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Trophy className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{t("emptyStateTitle")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {filters.search || filters.visaStatus || activeFilterCount > 0
                            ? t("emptyStateFiltered")
                            : t("emptyStateDefault")}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => (
                <TableRow key={p._id} className="bg-transparent">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{getCandidateName(p)}</p>
                      {p.candidateEmail && <p className="text-xs text-muted-foreground">{p.candidateEmail}</p>}
                      <StatusBadge status={getVisaStatus(p)} />
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground/85">
                    <span className="block">{getJobTitle(p)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{getCompanyName(p)}</span>
                  </TableCell>
                  <TableCell className="text-foreground/85 tabular-nums">
                    <span className="block">{formatPlacementSalary(p)}</span>
                    {p.commissionPaid ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3 w-3" /> {t("commissionBadgePaid")}{p.commissionAmount ? ` · ${p.commissionAmount.toLocaleString()}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("commissionBadgeUnpaid")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</span>
                    <span className="mt-1 block text-xs">{p.placedAt ? new Date(p.placedAt).toLocaleDateString() : "—"}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
