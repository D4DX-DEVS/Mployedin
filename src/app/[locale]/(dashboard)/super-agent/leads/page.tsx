"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Gauge, Loader2, X,
  Sparkles, Eye, MessageSquare, Phone, Trophy, XCircle, Mail, MapPin, Calendar, User, Target,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { localDateString } from "@/lib/interviews/availabilitySlots";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { InlinePicker } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";
import { toast } from "sonner";
import { knownStageDetails, missingStageFields } from "@/lib/leads/stageRules";
// The agent board's Move dialog: a stage that needs details (a final value
// for Won, a reason for Lost…) collects them here too, not just on the board.
import { MoveStageDialog } from "../../agent/leads/_components/MoveStageDialog";
import { getStageConfig, type Lead as WorkspaceLead } from "../../agent/leads/_components/leadShared";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";
type LeadQualification = "cold" | "warm" | "hot" | "qualified";

const QUAL_STYLES: Record<string, string> = {
  qualified: "border-emerald-300 bg-emerald-50 text-emerald-800",
  hot: "border-rose-300 bg-rose-50 text-rose-800",
  warm: "border-amber-300 bg-amber-50 text-amber-800",
  cold: "border-sky-300 bg-sky-50 text-sky-800",
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

interface Filters extends Record<string, string> {
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

// Stage icon tiles for the hero strip, same language as the metric cards on
// the neighbouring pages (the strip used to be label + number only).
const STAGE_ICONS: Record<LeadStatus, { icon: typeof Sparkles; tile: string; text: string }> = {
  new: { icon: Sparkles, tile: "bg-sky-500/10", text: "text-sky-600" },
  contacted: { icon: Phone, tile: "bg-blue-500/10", text: "text-blue-600" },
  interested: { icon: Eye, tile: "bg-amber-500/10", text: "text-amber-600" },
  negotiating: { icon: MessageSquare, tile: "bg-violet-500/10", text: "text-violet-600" },
  converted: { icon: Trophy, tile: "bg-emerald-500/10", text: "text-emerald-600" },
  lost: { icon: XCircle, tile: "bg-rose-500/10", text: "text-rose-500" },
};

const SORT_OPTIONS = [
  { value: "createdAt", label: "sortOptionCreatedAt" },
  { value: "companyName", label: "sortOptionCompanyName" },
  { value: "status", label: "sortOptionStatus" },
  { value: "score", label: "sortOptionScore" },
  { value: "followUpAt", label: "sortOptionFollowUpAt" },
  { value: "country", label: "sortOptionCountry" },
  { value: "industry", label: "sortOptionIndustry" },
];

/**
 * The label key for a sort field.
 *
 * The active-filter chip used to build this key by concatenation —
 * `sortOption${filters.sortBy}` — which produces `sortOptioncreatedAt` for a
 * value of `createdAt`, while the key is `sortOptionCreatedAt`. next-intl
 * throws on an unknown key, so simply switching the sort order to ascending
 * crashed the page. SORT_OPTIONS already holds the correct key per value.
 */
function sortLabelKey(value: string): string {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? "sortOptionCreatedAt";
}

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
  const tStage = useTranslations("statusBadge");
  const tLead = useTranslations("agentLeads");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const stageConfig = useMemo(() => getStageConfig(tLead), [tLead]);

  const [leads, setLeads] = useState<Lead[]>([]);
  // Per-stage totals across the whole filtered pipeline, from the API.
  const [apiStageCounts, setApiStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // In the URL, not just in state: the dashboard's "overdue follow-ups" row
  // links straight to ?hasFollowUp=overdue, and that only works if this page
  // reads its filters back from the query string on mount.
  const { filters, setFilter, resetFilters: clearUrlFilters } = useUrlFilters<Filters>(
    INITIAL_FILTERS,
    { debounceKeys: ["search"], debounceMs: 400 },
  );

  const [facets, setFacets] = useState<Facets>({ countries: [], industries: [], sources: [] });
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // AI search state
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiDegraded, setAiDegraded] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  /* -- Fetch agents for filter dropdown -- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/super-agent/agents?limit=200");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.items?.map((a: { _id: string; name: string; email: string }) => ({
            _id: a._id, name: a.name, email: a.email,
          })) ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  /* -- Fetch leads -- */
  const fetchLeads = useCallback(async (overrideFilters?: Partial<Filters>) => {
    setLoading(true);
    setError("");
    const f = { ...filters, ...overrideFilters };
    const params = new URLSearchParams({ page: String(page), limit: String(limit), distinct: "true" });
    if (f.status) params.set("status", f.status);
    if (f.search.trim()) params.set("search", f.search.trim());
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
        setApiStageCounts(data.stageCounts ?? {});
        updateTotal(data.total ?? 0);
        if (data.facets) setFacets(data.facets);
      } else {
        setError(t("loadError"));
      }
    } catch {
      setError(t("loadError"));
    }
    setLoading(false);
  }, [filters, page, limit, updateTotal, t]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* -- Filter helpers -- */
  const updateFilter = useCallback((key: keyof Filters & string, value: string) => {
    setFilter(key, value);
    resetPage();
  }, [setFilter, resetPage]);

  const resetFilters = useCallback(() => {
    clearUrlFilters();
    setAiSummary("");
    setAiQuery("");
    resetPage();
  }, [clearUrlFilters, resetPage]);

  /* -- Column sort -- */
  const toggleSort = useCallback((field: string) => {
    setFilter("sortBy", field);
    setFilter(
      "sortOrder",
      filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    );
    resetPage();
  }, [filters.sortBy, filters.sortOrder, setFilter, resetPage]);

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
        // One key at a time: the hook keeps the query string and the state in
        // step, and each write composes on the previous one.
        (Object.keys(newFilters) as (keyof Filters & string)[]).forEach((key) => {
          setFilter(key, newFilters[key]);
        });
        setAiSummary(data.summary ?? "");
        setAiDegraded(data.degraded ?? false);
        resetPage();
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  }, [aiQuery, setFilter, resetPage]);

  /* -- Change lead stage -- */
  // A move whose stage needs details the lead does not hold opens the Move
  // dialog; anything else goes straight through the stage route.
  const [moveRequest, setMoveRequest] = useState<{ lead: Lead; target: LeadStatus } | null>(null);

  const onStageMoved = useCallback((moved: { _id: string; status: LeadStatus }) => {
    setLeads((prev) => prev.map((l) => (l._id === moved._id ? { ...l, status: moved.status } : l)));
    toast.success(t("stageUpdated", { stage: tStage(moved.status) }));
    // The stage strip counts the whole pipeline; refetch so it moves too.
    void fetchLeads();
  }, [t, tStage, fetchLeads]);

  const handleChangeStage = useCallback(async (lead: Lead, newStatus: LeadStatus) => {
    if (newStatus === lead.status) return;
    if (missingStageFields(lead.status, newStatus, {}, knownStageDetails(lead)).length > 0) {
      setMoveRequest({ lead, target: newStatus });
      return;
    }
    setUpdatingLeadId(lead._id);
    try {
      const res = await fetch(`/api/leads/${lead._id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        onStageMoved({ _id: lead._id, status: newStatus });
      } else {
        toast.error(t("stageUpdateError"));
      }
    } catch {
      toast.error(t("stageUpdateError"));
    } finally {
      setUpdatingLeadId(null);
    }
  }, [t, onStageMoved]);

  /* -- Computed values -- */
  // Counts come from the API aggregate, over the whole filtered pipeline.
  // Deriving them from `leads` counted the current page, so the six stages
  // always summed to the page size instead of the pipeline.
  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = apiStageCounts[s] ?? 0;
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
    { header: t("columnFollowUp"), key: "followUpAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: leads as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-leads",
    title: t("pageTitle"),
  });

  /* ── Column sort order for the header controls ── */
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="page-container">
      {/* One concept, one representation. The four KPI tiles (Open pipeline /
          Contacted / Converted / Lost) restated the stage strip below, which
          carries the same funnel in more detail and doubles as the filter — so
          the tiles are gone and the strip is the primary control. The hero's
          "Coverage" box explained how to use that strip, which the strip
          demonstrates by itself. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <SuperAgentSection title={t("sectionTitle")} className="[&>div:first-child]:sr-only">
        {/* ---- Error State ---- */}
        {error && <ErrorState onRetry={() => fetchLeads()} />}

        {/* ---- Stage Strip ---- */}
        <div className="flex flex-col gap-4">
          {/* Phones: one scrollable chip row. Six stage cards owned a full screen. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-6">
            {STAGES.map((s) => {
              const StageIcon = STAGE_ICONS[s].icon;
              return (
              <button
                key={s}
                type="button"
                onClick={() => { updateFilter("status", filters.status === s ? "" : s); }}
                aria-pressed={filters.status === s}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-start transition-all sm:block sm:shrink sm:rounded-2xl sm:px-4 sm:py-3 ${filters.status === s ? "border-primary/35 bg-primary/10 shadow-sm shadow-primary/15" : "border-border/70 bg-background/85 hover:border-border hover:bg-secondary/80"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`hidden h-7 w-7 items-center justify-center rounded-lg sm:inline-flex ${STAGE_ICONS[s].tile}`}>
                    <StageIcon className={`h-3.5 w-3.5 ${STAGE_ICONS[s].text}`} aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:tracking-[0.18em]">{tStage(s)}</span>
                  <StageIcon className={`h-3.5 w-3.5 sm:hidden ${STAGE_ICONS[s].text}`} aria-hidden="true" />
                </span>
                <p className="text-[13px] font-semibold tabular-nums tracking-tight text-foreground sm:mt-2 sm:text-2xl">{stageCounts[s]}</p>
              </button>
              );
            })}
          </div>

        {/* ---- Filters: search + AI in plain sight, facets and sorts behind More ---- */}
        <InlineFilterBar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onClear={(activeFilterCount > 0 || filters.status || filters.search || aiSummary) ? resetFilters : undefined}
          more={(
            <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
              <div className="grid min-w-0 flex-[1_1_100%] grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFiltersLabel")}</span>
                {[
                  { label: t("quickFilterOverdueFollowUps"), action: () => { updateFilter("hasFollowUp", "overdue"); } },
                  { label: t("quickFilterThisWeek"), action: () => { const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - d.getDay()); updateFilter("dateFrom", localDateString(start)); } },
                  { label: t("quickFilterConverted"), action: () => { updateFilter("status", "converted"); } },
                  { label: t("quickFilterLostLeads"), action: () => { updateFilter("status", "lost"); } },
                  { label: t("quickFilterWithNotes"), action: () => { updateFilter("hasNotes", "true"); } },
                  { label: t("quickFilterNeedsContact"), action: () => { updateFilter("status", "new"); } },
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

              {/* Active filters strip */}
              {activeFilterCount > 0 && (
                <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <span className="text-xs text-muted-foreground/70">{t("activeFiltersLabel")}</span>
                  {filters.country && <FilterChip label={t("filterLabelCountry", { value: filters.country })} onRemove={() => updateFilter("country", "")} />}
                  {filters.industry && <FilterChip label={t("filterLabelIndustry", { value: filters.industry })} onRemove={() => updateFilter("industry", "")} />}
                  {filters.source && <FilterChip label={t("filterLabelSource", { value: filters.source })} onRemove={() => updateFilter("source", "")} />}
                  {filters.agentId && <FilterChip label={t("filterLabelAgent", { value: agents.find((a) => a._id === filters.agentId)?.name ?? filters.agentId })} onRemove={() => updateFilter("agentId", "")} />}
                  {(filters.dateFrom || filters.dateTo) && <FilterChip label={t("filterLabelCreated", { from: filters.dateFrom || "…", to: filters.dateTo || "…" })} onRemove={() => { updateFilter("dateFrom", ""); updateFilter("dateTo", ""); }} />}
                  {(filters.followUpFrom || filters.followUpTo) && <FilterChip label={t("filterLabelFollowUp", { from: filters.followUpFrom || "…", to: filters.followUpTo || "…" })} onRemove={() => { updateFilter("followUpFrom", ""); updateFilter("followUpTo", ""); }} />}
                  {filters.hasNotes && <FilterChip label={filters.hasNotes === "true" ? t("filterLabelHasNotes") : t("filterLabelNoNotes")} onRemove={() => updateFilter("hasNotes", "")} />}
                  {filters.hasFollowUp && <FilterChip label={filters.hasFollowUp === "overdue" ? t("filterLabelOverdueFollowUps") : t("filterLabelHasFollowUp")} onRemove={() => updateFilter("hasFollowUp", "")} />}
                  {(filters.sortBy !== "createdAt" || filters.sortOrder !== "desc") && <FilterChip label={t("filterLabelSort", { sortBy: t(sortLabelKey(filters.sortBy)), order: filters.sortOrder })} onRemove={() => { updateFilter("sortBy", "createdAt"); updateFilter("sortOrder", "desc"); }} />}
                </div>
              )}
            </div>
          )}
          moreActiveCount={activeFilterCount}
          footer={aiSummary ? (
            <div className={`mt-2 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${aiDegraded ? "border-amber-500/20 bg-amber-50/40 text-amber-800" : "border-emerald-500/20 bg-emerald-50/40 text-emerald-800"}`}>
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p>{aiSummary}</p>
                {aiDegraded && <p className="mt-1 text-xs opacity-70">{t("aiDegradedMessage")}</p>}
              </div>
              <button type="button" onClick={() => setAiSummary("")} className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label={t("dismissAiSummary")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        >
          <InlineFilterSearch
            value={filters.search}
            onChange={(v) => updateFilter("search", v)}
            placeholder={t("searchPlaceholder")}
          />
          {/* AI search shares the bar instead of a boxed sub-container that
              forced it onto stacked lines. */}
          <div className="relative min-w-0 flex-[2_1_14rem]">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500/70" />
            <Input
              ref={aiInputRef}
              aria-label={t("aiSearchLabel")}
              placeholder={t("aiSearchPlaceholder")}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
              className="h-11 w-full rounded-lg border-amber-500/20 bg-amber-50/50 pl-9 pr-3 text-sm shadow-none focus:border-amber-500/40 focus:ring-amber-500/20 sm:h-9"
            />
          </div>
          <button
            type="button"
            onClick={handleAiSearch}
            disabled={aiLoading || !aiQuery.trim()}
            aria-label={t("aiButton")}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 transition-all hover:bg-amber-500/20 disabled:opacity-50 sm:h-9"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="sr-only sm:not-sr-only sm:inline">{t("aiButton")}</span>
          </button>
        </InlineFilterBar>

        {/* ---- Data Table ---- */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>
                    <SortableTableHeader label={t("columnCompany")} active={filters.sortBy === "companyName"} order={sortOrder} onClick={() => toggleSort("companyName")} />
                  </TableHead>
                  <TableHead>{t("columnContact")}</TableHead>
                  <TableHead>
                    <SortableTableHeader label={t("columnIndustry")} active={filters.sortBy === "industry"} order={sortOrder} onClick={() => toggleSort("industry")} />
                  </TableHead>
                  <TableHead>{t("columnAgent")}</TableHead>
                  <TableHead>
                    <SortableTableHeader label={t("columnFollowUp")} active={filters.sortBy === "followUpAt"} order={sortOrder} onClick={() => toggleSort("followUpAt")} />
                  </TableHead>
                  <TableHead className="text-right">{t("columnActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={5} cols={6} />
                ) : leads.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12">
                      <EmptyState title={t("noLeadsFoundTitle")} description={t("noLeadsFoundMessage")} icon={Target} />
                    </TableCell>
                  </TableRow>
                ) : leads.map((lead) => {
                  const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
                  return (
                    <TableRow key={lead._id} className="group">
                      <TableCell className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={lead.companyName} className="h-9 w-9 shrink-0" colorful />
                          <div className="min-w-0 space-y-1">
                            <p className="truncate font-medium text-foreground">{lead.companyName}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={lead.status} />
                              {lead.score != null && (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${QUAL_STYLES[lead.qualificationLevel ?? "cold"] ?? QUAL_STYLES.cold}`}>
                                  <Gauge className="h-3 w-3" />{lead.score}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-foreground/85">{lead.contactPerson}</div>
                        {lead.contactEmail && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{lead.contactEmail}</span>
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{lead.country ?? "—"}</span>
                        </div>
                        {lead.autoRouted && (
                          <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-semibold text-emerald-700">{t("badgeRouted")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="block">{lead.industry ?? "—"}</span>
                        <span className="mt-1 block text-xs">{lead.source ?? "—"}{lead.exhibitionId ? " · Linked" : ""}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {lead.agentId?.userId?.name ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {lead.followUpAt ? (
                          <span className={`inline-flex items-center gap-1 ${isOverdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                            <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {formatDate(new Date(lead.followUpAt), { day: "2-digit", month: "short", year: "numeric" })}
                            {isOverdue && <span className="ml-1 text-[11px]">{t("labelOverdue")}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground">{formatDate(new Date(lead.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Stage changes are the row's status: an inline picker,
                            not a "…" menu that buried them three clicks deep. */}
                        <InlinePicker
                          name={lead.companyName}
                          picker={{
                            label: t("changeStageFor", { company: lead.companyName }),
                            value: lead.status,
                            options: STAGES.map((s) => ({ value: s, label: tStage(s) })),
                            onChange: (next) => { void handleChangeStage(lead, next as LeadStatus); },
                            display: <StatusBadge status={lead.status} />,
                            pending: updatingLeadId === lead._id,
                            disabled: updatingLeadId === lead._id,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

      </SuperAgentSection>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <MoveStageDialog
        open={Boolean(moveRequest)}
        // The list row carries the whole lead document; only `agentId` is
        // populated differently, and the dialog does not read it.
        lead={(moveRequest?.lead ?? null) as unknown as WorkspaceLead | null}
        target={moveRequest?.target}
        lockTarget
        onOpenChange={(open) => { if (!open) setMoveRequest(null); }}
        onMoved={(moved) => onStageMoved(moved)}
        stageConfig={stageConfig}
        t={tLead}
        tf={tf}
        locale={locale}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterChip                                                         */
/* ------------------------------------------------------------------ */

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useTranslations("superAgentLeads");
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-primary/15 transition-colors" aria-label={t("removeFilterWithLabel", { label })}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
