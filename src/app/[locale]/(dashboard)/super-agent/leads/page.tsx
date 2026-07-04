"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, ArrowUpDown, ChevronDown, ChevronUp,
  CircleSlash, Gauge, Handshake, Loader2, RotateCcw,
  Sparkles, Target, X,
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

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";
type LeadQualification = "cold" | "warm" | "hot" | "qualified";

const QUAL_STYLES: Record<string, string> = {
  qualified: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  hot: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
  warm: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  cold: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
};

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  industry?: string;
  source?: string;
  notes?: string;
  score?: number;
  qualificationLevel?: LeadQualification;
  exhibitionId?: string;
  autoRouted?: boolean;
  status: LeadStatus;
  agentId?: { _id?: string; userId?: { _id?: string; name?: string } };
  followUpAt?: string;
  createdAt: string;
}

interface AgentOption {
  _id: string;
  name: string;
  email: string;
}

interface Facets {
  countries: string[];
  industries: string[];
  sources: string[];
}

interface Filters {
  status: string;
  search: string;
  country: string;
  industry: string;
  source: string;
  agentId: string;
  dateFrom: string;
  dateTo: string;
  followUpFrom: string;
  followUpTo: string;
  hasNotes: string;
  hasFollowUp: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  status: "", search: "", country: "", industry: "", source: "",
  agentId: "", dateFrom: "", dateTo: "", followUpFrom: "", followUpTo: "",
  hasNotes: "", hasFollowUp: "", sortBy: "createdAt", sortOrder: "desc",
};

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

const SORT_OPTIONS = [
  { value: "createdAt", label: "sortOptionCreatedAt" },
  { value: "companyName", label: "sortOptionCompanyName" },
  { value: "status", label: "sortOptionStatus" },
  { value: "score", label: "sortOptionScore" },
  { value: "followUpAt", label: "sortOptionFollowUpAt" },
  { value: "country", label: "sortOptionCountry" },
  { value: "industry", label: "sortOptionIndustry" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.country) count++;
  if (f.industry) count++;
  if (f.source) count++;
  if (f.agentId) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.followUpFrom || f.followUpTo) count++;
  if (f.hasNotes) count++;
  if (f.hasFollowUp) count++;
  if (f.sortBy !== "createdAt" || f.sortOrder !== "desc") count++;
  return count;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function SuperAgentLeadsPage() {
  const t = useTranslations("superAgentLeads");
  const tc = useTranslations("common");
  const tt = useTranslations("table");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  const [facets, setFacets] = useState<Facets>({ countries: [], industries: [], sources: [] });
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // AI search state
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiDegraded, setAiDegraded] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

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

  /* -- Fetch leads -- */
  const fetchLeads = useCallback(async (overrideFilters?: Partial<Filters>) => {
    setLoading(true);
    const f = { ...filters, ...overrideFilters };
    const params = new URLSearchParams({ page: String(page), limit: String(limit), distinct: "true" });
    if (f.status) params.set("status", f.status);
    if (f.search) params.set("search", f.search);
    if (f.country) params.set("country", f.country);
    if (f.industry) params.set("industry", f.industry);
    if (f.source) params.set("source", f.source);
    if (f.agentId) params.set("agentId", f.agentId);
    if (f.dateFrom) params.set("dateFrom", f.dateFrom);
    if (f.dateTo) params.set("dateTo", f.dateTo);
    if (f.followUpFrom) params.set("followUpFrom", f.followUpFrom);
    if (f.followUpTo) params.set("followUpTo", f.followUpTo);
    if (f.hasNotes) params.set("hasNotes", f.hasNotes);
    if (f.hasFollowUp) params.set("hasFollowUp", f.hasFollowUp);
    if (f.sortBy) params.set("sortBy", f.sortBy);
    if (f.sortOrder) params.set("sortOrder", f.sortOrder);

    try {
      const res = await fetch(`/api/super-agent/leads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.items ?? []);
        updateTotal(data.total ?? 0);
        if (data.facets) setFacets(data.facets);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [filters, page, limit, updateTotal]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* -- Filter helpers -- */
  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPage();
  }, [resetPage]);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setAiSummary("");
    setAiQuery("");
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

  /* -- AI Search -- */
  const handleAiSearch = useCallback(async () => {
    const q = aiQuery.trim();
    if (!q) return;
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/lead-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (res.ok) {
        const data = await res.json();
        const f = data.filters ?? {};
        const newFilters: Filters = {
          status: f.status ?? "",
          search: f.search ?? "",
          country: f.country ?? "",
          industry: f.industry ?? "",
          source: f.source ?? "",
          agentId: "",
          dateFrom: f.dateFrom ?? "",
          dateTo: f.dateTo ?? "",
          followUpFrom: f.followUpFrom ?? "",
          followUpTo: f.followUpTo ?? "",
          hasNotes: f.hasNotes === true ? "true" : f.hasNotes === false ? "false" : "",
          hasFollowUp: f.hasFollowUp ?? "",
          sortBy: f.sortBy ?? "createdAt",
          sortOrder: f.sortOrder ?? "desc",
        };
        setFilters(newFilters);
        setAiSummary(data.summary ?? "");
        setAiDegraded(data.degraded ?? false);
        resetPage();
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  }, [aiQuery, resetPage]);

  /* -- Computed values -- */
  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("columnCompany"), key: "companyName" },
    { header: t("columnContact"), key: "contactPerson" },
    { header: tc("email"), key: "contactEmail" },
    { header: tc("phone"), key: "contactPhone" },
    { header: tc("country"), key: "country" },
    { header: t("columnIndustry"), key: "industry" },
    { header: t("columnSource"), key: "source" },
    { header: t("columnExhibitionLinked"), key: "exhibitionId", formatter: (v) => v ? t("yes") : "" },
    { header: t("columnAgent"), key: "agentId", formatter: (_v, row) => (row.agentId as { userId?: { name?: string } })?.userId?.name ?? "" },
    { header: t("columnStage"), key: "status" },
    { header: t("columnScore"), key: "score" },
    { header: t("columnQualification"), key: "qualificationLevel" },
    { header: t("columnFollowUp"), key: "followUpAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: leads as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-leads",
    title: t("pageTitle"),
  });

  const kpis = [
    {
      label: t("kpiOpenPipeline"),
      value: leads.filter((lead) => !["converted", "lost"].includes(lead.status)).length,
      helper: t("kpiOpenPipelineHelper"),
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: t("kpiContacted"),
      value: stageCounts.contacted,
      helper: t("kpiContactedHelper"),
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: t("kpiConverted"),
      value: stageCounts.converted,
      helper: t("kpiConvertedHelper"),
      icon: <Handshake className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("kpiLost"),
      value: stageCounts.lost,
      helper: t("kpiLostHelper"),
      icon: <CircleSlash className="h-5 w-5" />,
      toneClassName: "workspace-tone-rose",
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
    <div className="page-container space-y-6">
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
        {/* ---- Stage Strip ---- */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { updateFilter("status", filters.status === s ? "" : s); }}
                aria-pressed={filters.status === s}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${filters.status === s ? "border-primary/35 bg-primary/10 shadow-sm shadow-primary/15" : "border-border/70 bg-background/85 hover:border-border hover:bg-secondary/80"}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{s}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stageCounts[s]}</p>
              </button>
            ))}
          </div>

        {/* ---- Merged Filters via TableToolbar ---- */}
        <TableToolbar
          search={filters.search}
          onSearchChange={(v) => updateFilter("search", v)}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={activeFilterCount > 0 || !!filters.status || !!aiSummary}
          actions={
            <div className="flex items-center gap-2">
              {/* AI Search inline */}
              <div className="relative flex items-center gap-2">
                <div className="relative">
                  <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500/70" />
                  <Input
                    ref={aiInputRef}
                    aria-label={t("aiSearchLabel")}
                    placeholder={t("aiSearchPlaceholder")}
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
                    className="h-9 w-56 rounded-xl border-amber-500/20 bg-amber-50/50 pl-9 pr-3 text-sm shadow-none focus:border-amber-500/40 focus:ring-amber-500/20 dark:bg-amber-950/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAiSearch}
                  disabled={aiLoading || !aiQuery.trim()}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 transition-all hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                >
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {t("aiButton")}
                </button>
              </div>
              {(activeFilterCount > 0 || filters.status || filters.search || aiSummary) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("resetButton")}
                </button>
              )}
            </div>
          }
          filterContent={
            <div className="space-y-4">
              {/* AI Summary Banner */}
              {aiSummary && (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${aiDegraded ? "border-amber-500/20 bg-amber-50/40 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300" : "border-emerald-500/20 bg-emerald-50/40 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"}`}>
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <p>{aiSummary}</p>
                    {aiDegraded && <p className="mt-1 text-xs opacity-70">{t("aiDegradedMessage")}</p>}
                  </div>
                  <button type="button" onClick={() => setAiSummary("")} className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{tc("country")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAllCountries") }, ...facets.countries.map((c) => ({ value: c, label: c }))]}
                    value={filters.country}
                    onValueChange={(v) => updateFilter("country", v)}
                    placeholder={t("filterAllCountries")}
                    searchPlaceholder={t("searchCountry")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterIndustry")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAllIndustries") }, ...facets.industries.map((i) => ({ value: i, label: i }))]}
                    value={filters.industry}
                    onValueChange={(v) => updateFilter("industry", v)}
                    placeholder={t("filterAllIndustries")}
                    searchPlaceholder={t("searchIndustry")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSource")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAllSources") }, ...facets.sources.map((s) => ({ value: s, label: s }))]}
                    value={filters.source}
                    onValueChange={(v) => updateFilter("source", v)}
                    placeholder={t("filterAllSources")}
                    searchPlaceholder={t("searchSource")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterAgent")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAllAgents") }, ...agents.map((a) => ({ value: a._id, label: a.name || a.email }))]}
                    value={filters.agentId}
                    onValueChange={(v) => updateFilter("agentId", v)}
                    placeholder={t("filterAllAgents")}
                    searchPlaceholder={t("searchAgent")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterCreatedFrom")}</label>
                  <DateTimePicker value={filters.dateFrom} onChange={(v) => updateFilter("dateFrom", v)} placeholder={t("placeholderStartDate")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterCreatedTo")}</label>
                  <DateTimePicker value={filters.dateTo} onChange={(v) => updateFilter("dateTo", v)} placeholder={t("placeholderEndDate")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterFollowUpFrom")}</label>
                  <DateTimePicker value={filters.followUpFrom} onChange={(v) => updateFilter("followUpFrom", v)} placeholder={t("placeholderFollowUpStart")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterFollowUpTo")}</label>
                  <DateTimePicker value={filters.followUpTo} onChange={(v) => updateFilter("followUpTo", v)} placeholder={t("placeholderFollowUpEnd")} mode="date" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterHasNotes")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAny") }, { value: "true", label: t("filterWithNotes") }, { value: "false", label: t("filterWithoutNotes") }]}
                    value={filters.hasNotes}
                    onValueChange={(v) => updateFilter("hasNotes", v)}
                    placeholder={t("filterAny")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterFollowUpStatus")}</label>
                  <SearchableSelect
                    options={[{ value: "", label: t("filterAny") }, { value: "true", label: t("filterHasFollowUp") }, { value: "overdue", label: t("filterOverdueOnly") }]}
                    value={filters.hasFollowUp}
                    onValueChange={(v) => updateFilter("hasFollowUp", v)}
                    placeholder={t("filterAny")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSortBy")}</label>
                  <SearchableSelect options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} value={filters.sortBy} onValueChange={(v) => updateFilter("sortBy", v)} placeholder={t("sortOptionCreatedAt")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSortOrder")}</label>
                  <SearchableSelect
                    options={[{ value: "desc", label: t("sortNewestFirst") }, { value: "asc", label: t("sortOldestFirst") }]}
                    value={filters.sortOrder}
                    onValueChange={(v) => updateFilter("sortOrder", v)}
                    placeholder={t("sortNewestFirst")}
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFiltersLabel")}</span>
                {[
                  { label: t("quickFilterOverdueFollowUps"), action: () => { updateFilter("hasFollowUp", "overdue"); } },
                  { label: t("quickFilterThisWeek"), action: () => { const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - d.getDay()); updateFilter("dateFrom", start.toISOString().split("T")[0]); } },
                  { label: t("quickFilterConverted"), action: () => { updateFilter("status", "converted"); } },
                  { label: t("quickFilterLostLeads"), action: () => { updateFilter("status", "lost"); } },
                  { label: t("quickFilterWithNotes"), action: () => { updateFilter("hasNotes", "true"); } },
                  { label: t("quickFilterNeedsContact"), action: () => { updateFilter("status", "new"); } },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={chip.action}
                    className="rounded-lg border border-border/60 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Active filters strip */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <span className="text-xs text-muted-foreground/70">{t("activeFiltersLabel")}</span>
                  {filters.country && <FilterChip label={t("filterLabelCountry", { value: filters.country })} onRemove={() => updateFilter("country", "")} />}
                  {filters.industry && <FilterChip label={t("filterLabelIndustry", { value: filters.industry })} onRemove={() => updateFilter("industry", "")} />}
                  {filters.source && <FilterChip label={t("filterLabelSource", { value: filters.source })} onRemove={() => updateFilter("source", "")} />}
                  {filters.agentId && <FilterChip label={t("filterLabelAgent", { value: agents.find((a) => a._id === filters.agentId)?.name ?? filters.agentId })} onRemove={() => updateFilter("agentId", "")} />}
                  {(filters.dateFrom || filters.dateTo) && <FilterChip label={t("filterLabelCreated", { from: filters.dateFrom || "…", to: filters.dateTo || "…" })} onRemove={() => { updateFilter("dateFrom", ""); updateFilter("dateTo", ""); }} />}
                  {(filters.followUpFrom || filters.followUpTo) && <FilterChip label={t("filterLabelFollowUp", { from: filters.followUpFrom || "…", to: filters.followUpTo || "…" })} onRemove={() => { updateFilter("followUpFrom", ""); updateFilter("followUpTo", ""); }} />}
                  {filters.hasNotes && <FilterChip label={filters.hasNotes === "true" ? t("filterLabelHasNotes") : t("filterLabelNoNotes")} onRemove={() => updateFilter("hasNotes", "")} />}
                  {filters.hasFollowUp && <FilterChip label={filters.hasFollowUp === "overdue" ? t("filterLabelOverdueFollowUps") : t("filterLabelHasFollowUp")} onRemove={() => updateFilter("hasFollowUp", "")} />}
                  {(filters.sortBy !== "createdAt" || filters.sortOrder !== "desc") && <FilterChip label={t("filterLabelSort", { sortBy: t(`sortOption${filters.sortBy}`), order: filters.sortOrder })} onRemove={() => { updateFilter("sortBy", "createdAt"); updateFilter("sortOrder", "desc"); }} />}
                </div>
              )}
            </div>
          }
          className="mb-4"
        />

        {/* ---- Data Table ---- */}
          <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead><SortHeader field="companyName">{t("columnCompany")}</SortHeader></TableHead>
                  <TableHead>{t("columnContact")}</TableHead>
                  <TableHead><SortHeader field="country">{tc("country")}</SortHeader></TableHead>
                  <TableHead><SortHeader field="industry">{t("columnIndustry")}</SortHeader></TableHead>
                  <TableHead>{t("columnSource")}</TableHead>
                  <TableHead>{t("columnExhibition")}</TableHead>
                  <TableHead><SortHeader field="status">{t("columnStage")}</SortHeader></TableHead>
                  <TableHead><SortHeader field="score">{t("columnScore")}</SortHeader></TableHead>
                  <TableHead>{t("columnAgent")}</TableHead>
                  <TableHead><SortHeader field="followUpAt">{t("columnFollowUp")}</SortHeader></TableHead>
                  <TableHead><SortHeader field="createdAt">{tc("date")}</SortHeader></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                          <Target className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">{t("noLeadsFoundTitle")}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{t("noLeadsFoundMessage")}</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : leads.map((lead) => {
                  const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
                  return (
                    <TableRow key={lead._id} className="bg-transparent">
                      <TableCell className="font-medium text-foreground">{lead.companyName}</TableCell>
                      <TableCell>
                        <div className="text-foreground/85">{lead.contactPerson}</div>
                        {lead.contactEmail && <div className="text-xs text-muted-foreground/70">{lead.contactEmail}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span>{lead.country ?? "—"}</span>
                        {lead.autoRouted && (
                          <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">{t("badgeRouted")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lead.industry ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.source ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.exhibitionId ? "Linked" : "—"}</TableCell>
                      <TableCell><StatusBadge status={lead.status} /></TableCell>
                      <TableCell>
                        {lead.score != null ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${QUAL_STYLES[lead.qualificationLevel ?? "cold"] ?? QUAL_STYLES.cold}`}>
                            <Gauge className="h-3 w-3" />
                            {lead.score}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.agentId?.userId?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {lead.followUpAt ? (
                          <span className={isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                            {new Date(lead.followUpAt).toLocaleDateString()}
                            {isOverdue && <span className="ml-1 text-[10px]">{t("labelOverdue")}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterChip                                                         */
/* ------------------------------------------------------------------ */

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-primary/15 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
