"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Activity, ArrowUpDown, BriefcaseBusiness, ChevronDown, ChevronUp,
  Filter, RotateCcw, Search, SlidersHorizontal, Target, Users2,
  Plus, AlertCircle, Loader2,
} from "lucide-react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { SuperAgentInsightsPanel } from "@/components/features/super-agent/InsightsPanel";
import { AIExplainButton } from "@/components/shared/AIExplainButton";
import { cn } from "@/lib/utils";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface AgentRow {
  _id: string;
  agentId: string;
  name: string;
  email: string;
  leadsCount: number;
  conversions: number;
  placements: number;
  conversionRate: number;
  avgResponseHours: number;
}

function aiRowData(a: AgentRow) {
  return {
    name: a.name,
    leads: a.leadsCount,
    conversions: a.conversions,
    placements: a.placements,
    conversionRate: a.conversionRate,
    avgResponseHours: a.avgResponseHours,
  };
}

/* ── Filter types ── */
interface Filters {
  search: string;
  performance: string;
  leadsMin: string;
  leadsMax: string;
  convRateMin: string;
  convRateMax: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  search: "", performance: "",
  leadsMin: "", leadsMax: "",
  convRateMin: "", convRateMax: "",
  sortBy: "name", sortOrder: "asc",
};

const getPerformanceOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "", label: t("allAgents") },
  { value: "high_performer", label: t("highPerformers") },
  { value: "needs_attention", label: t("needsAttention") },
  { value: "slow_response", label: t("slowResponse") },
  { value: "no_activity", label: t("noActivity") },
];

const getLeadsRangeOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "", label: t("any") },
  { value: "0-5", label: "0 – 5" },
  { value: "6-15", label: "6 – 15" },
  { value: "16-50", label: "16 – 50" },
  { value: "51+", label: "51+" },
];

const getConvRateOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "", label: t("any") },
  { value: "0-25", label: "0 – 25%" },
  { value: "26-50", label: "26 – 50%" },
  { value: "51-75", label: "51 – 75%" },
  { value: "76-100", label: "76 – 100%" },
];

const getSortOptions = (t: ReturnType<typeof useTranslations>, tc: ReturnType<typeof useTranslations>) => [
  { value: "name", label: tc("name") },
  { value: "leadsCount", label: t("leads") },
  { value: "conversions", label: t("conversions") },
  { value: "placements", label: t("placements") },
  { value: "conversionRate", label: t("conversionRate") },
  { value: "avgResponseHours", label: t("responseTime") },
];

function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.performance) count++;
  if (f.leadsMin || f.leadsMax) count++;
  if (f.convRateMin || f.convRateMax) count++;
  if (f.sortBy !== "name" || f.sortOrder !== "asc") count++;
  return count;
}

function parseRange(value: string): { min: string; max: string } {
  if (!value) return { min: "", max: "" };
  if (value.endsWith("+")) return { min: value.replace("+", ""), max: "" };
  const [min, max] = value.split("-");
  return { min: min ?? "", max: max ?? "" };
}

export default function SuperAgentAgentsPage() {
  const router = useRouter();
  const t = useTranslations("superAgentAgents");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  // Aggregates across every agent assigned to this super agent, not just the
  // page on screen. The API computes them before slicing.
  const [totals, setTotals] = useState({ agents: 0, leads: 0, conversions: 0, placements: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Create agent modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", commissionRate: "0" });
  const [createCityIds, setCreateCityIds] = useState<string[]>([]);
  const [createStateIds, setCreateStateIds] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.search) params.set("search", filters.search);
    if (filters.performance) params.set("performance", filters.performance);
    if (filters.leadsMin) params.set("leadsMin", filters.leadsMin);
    if (filters.leadsMax) params.set("leadsMax", filters.leadsMax);
    if (filters.convRateMin) params.set("convRateMin", filters.convRateMin);
    if (filters.convRateMax) params.set("convRateMax", filters.convRateMax);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

    const res = await fetch(`/api/super-agent/agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAgents(data.items ?? []);
      updateTotal(data.total ?? data.items?.length ?? 0);
      setTotals(data.totals ?? { agents: data.total ?? 0, leads: 0, conversions: 0, placements: 0 });
    }
    setLoading(false);
  }, [filters, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  /* ── Create agent handler ── */
  const handleCreate = async () => {
    setCreateError("");
    if (!createForm.name || !createForm.email || !createForm.password) {
      setCreateError(t("validateNameEmailPasswordRequired"));
      return;
    }
    if (
      createForm.password.length < 12 ||
      !/[a-z]/.test(createForm.password) ||
      !/[A-Z]/.test(createForm.password) ||
      !/[0-9]/.test(createForm.password) ||
      !/[^A-Za-z0-9]/.test(createForm.password)
    ) {
      setCreateError("Password must be 12+ characters and include upper-case, lower-case, numeric, and special characters");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/super-agent/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          commissionRate: parseFloat(createForm.commissionRate) || 0,
          assignedCityIds: createCityIds,
          assignedStateIds: createStateIds,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setCreateError(e.error ?? t("errorFailedToCreateAgent"));
        return;
      }
      const data = await res.json();
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", commissionRate: "0" });
      setCreateCityIds([]);
      setCreateStateIds([]);
      if (data.emailSent === false) {
        toast.warning(t("toastAgentCreatedNoEmail"));
      } else {
        toast.success(t("toastAgentCreatedSuccess"));
      }
      fetchAgents();
    } catch {
      setCreateError(t("errorNetworkError"));
    } finally {
      setCreateLoading(false);
    }
  };

  /* ── Filter helpers ── */
  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPage();
  }, [resetPage]);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    resetPage();
  }, [resetPage]);

  const handleLeadsRange = useCallback((value: string) => {
    const { min, max } = parseRange(value);
    setFilters((prev) => ({ ...prev, leadsMin: min, leadsMax: max }));
    resetPage();
  }, [resetPage]);

  const handleConvRateRange = useCallback((value: string) => {
    const { min, max } = parseRange(value);
    setFilters((prev) => ({ ...prev, convRateMin: min, convRateMax: max }));
    resetPage();
  }, [resetPage]);

  /* ── Column sort ── */
  const toggleSort = useCallback((field: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === "asc" ? "desc" : "asc",
    }));
    resetPage();
  }, [resetPage]);

  /* ── Performance badge logic ── */
  function getPerformanceBadge(agent: AgentRow) {
    const badges: { label: string; className: string }[] = [];
    if (agent.leadsCount === 0) {
      badges.push({ label: t("badgeNoActivity"), className: "bg-gray-100 text-gray-600" });
    } else if (agent.conversionRate >= 50) {
      badges.push({ label: t("badgeHighPerformer"), className: "bg-emerald-100 text-emerald-700" });
    } else if (agent.conversionRate < 15 && agent.leadsCount > 0) {
      badges.push({ label: t("badgeNeedsAttention"), className: "bg-rose-100 text-rose-700" });
    }
    if (agent.avgResponseHours > 48 && agent.leadsCount > 0) {
      badges.push({ label: t("badgeSlowResponse"), className: "bg-amber-100 text-amber-700" });
    }
    return badges;
  }

  /* ── Derived values ── */
  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: tc("name"), key: "name" },
    { header: tc("email"), key: "email" },
    { header: t("leads"), key: "leadsCount" },
    { header: t("conversions"), key: "conversions" },
    { header: t("placements"), key: "placements" },
    { header: t("convRateShort"), key: "conversionRate", formatter: (v) => `${v ?? 0}%` },
    { header: t("avgResponseShort"), key: "avgResponseHours" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: agents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-agents",
    title: t("pageTitle"),
  });

  // Reconstruct the selected range value for the dropdown
  const leadsRangeValue = filters.leadsMin || filters.leadsMax
    ? (filters.leadsMax ? `${filters.leadsMin}-${filters.leadsMax}` : `${filters.leadsMin}+`)
    : "";
  const convRateValue = filters.convRateMin || filters.convRateMax
    ? (filters.convRateMax ? `${filters.convRateMin}-${filters.convRateMax}` : `${filters.convRateMin}+`)
    : "";

  // These read from `totals`, not `agents`. Reducing over `agents` counted only
  // the rows on the current page, so "Total agents" showed 10 next to a
  // pagination footer reading "1–10 of 57".
  const kpis = [
    {
      label: t("totalAgents"),
      value: totals.agents,
      helper: t("totalAgentsHelper"),
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: t("totalLeads"),
      value: totals.leads,
      helper: t("totalLeadsHelper"),
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("conversions"),
      value: totals.conversions,
      helper: t("conversionsHelper"),
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: t("placements"),
      value: totals.placements,
      helper: t("placementsHelper"),
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  /* ── Sortable Header Cell ── */
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

  return (
    <div className="page-container">
      {/* The "Roster / N visible rows / stays in sync with pagination" box is
          gone: the pagination footer already states the count, and explaining
          that pagination works is not information. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
      >
        {/* Insights live here as one button that opens a dialog. As four cards
            they sat between the heading and the table on every visit. */}
        <SuperAgentInsightsPanel asDialog />
        <Button
          onClick={() => { setCreateError(""); setShowCreate(true); }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("addAgent")}
        </Button>
      </SuperAgentPageIntro>

      {/* One compact line instead of four large tiles. These are context for the
          table below, not the reason anyone opens this page — as cards they
          pushed the first agent row off the first screen. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
        {kpis.map((k, i) => (
          <span key={k.label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">·</span>}
            <span className="font-semibold tabular-nums text-foreground">{k.value}</span>
            {k.label}
          </span>
        ))}
      </div>

      <SuperAgentSection title={t("teamReviewTitle")} className="[&>div:first-child]:sr-only">
        {/* ── Search Row + Advanced Toggle ── */}
        <TableToolbar
          search={filters.search}
          onSearchChange={(v) => updateFilter("search", v)}
          searchPlaceholder={t("searchAgentsPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={activeFilterCount > 0 || filters.performance !== ""}
          actions={
            (activeFilterCount > 0 || filters.search || filters.performance) ? (
              <button
                type="button"
                onClick={resetFilters}
                className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {tc("reset")}
              </button>
            ) : undefined
          }
          filterContent={
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {/* Performance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterPerformance")}</label>
                  <SearchableSelect
                    options={getPerformanceOptions(t)}
                    value={filters.performance}
                    onValueChange={(v) => updateFilter("performance", v)}
                    placeholder={t("allAgents")}
                    searchPlaceholder={t("filterPerformancePlaceholder")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Leads Range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterLeadsCount")}</label>
                  <SearchableSelect
                    options={getLeadsRangeOptions(t)}
                    value={leadsRangeValue}
                    onValueChange={handleLeadsRange}
                    placeholder={t("any")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Conversion Rate Range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterConversionRate")}</label>
                  <SearchableSelect
                    options={getConvRateOptions(t)}
                    value={convRateValue}
                    onValueChange={handleConvRateRange}
                    placeholder={t("any")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sortBy")}</label>
                  <SearchableSelect
                    options={getSortOptions(t, tc)}
                    value={filters.sortBy}
                    onValueChange={(v) => updateFilter("sortBy", v)}
                    placeholder={tc("name")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort Order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sortOrder")}</label>
                  <SearchableSelect
                    options={[
                      { value: "asc", label: t("ascending") },
                      { value: "desc", label: t("descending") },
                    ]}
                    value={filters.sortOrder}
                    onValueChange={(v) => updateFilter("sortOrder", v)}
                    placeholder={t("ascending")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFilterLabel")}:</span>
                {[
                  { label: t("quickFilterTopPerformers"), action: () => updateFilter("performance", "high_performer") },
                  { label: t("quickFilterNeedsAttention"), action: () => updateFilter("performance", "needs_attention") },
                  { label: t("quickFilterSlowResponders"), action: () => updateFilter("performance", "slow_response") },
                  { label: t("quickFilterNoActivity"), action: () => updateFilter("performance", "no_activity") },
                  { label: t("quickFilterHighVolume"), action: () => handleLeadsRange("51+") },
                  { label: t("quickFilterBestConverters"), action: () => handleConvRateRange("76-100") },
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
          }
          className="mb-4"
        />

        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead><SortHeader field="name">{t("agent")}</SortHeader></TableHead>
                <TableHead>{t("progress")}</TableHead>
                <TableHead className="text-right"><SortHeader field="conversionRate">{t("convRateShort")}</SortHeader></TableHead>
                <TableHead className="w-10" />
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
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Users2 className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{t("noAgentsFound")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("noAgentsFoundHelper")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : agents.map((a) => {
                const badges = getPerformanceBadge(a);
                return (
                <TableRow
                  key={a._id}
                  className="bg-transparent cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`agents/${a.agentId}`)}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.email}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {badges.map((b) => (
                          <span key={b.label} className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", b.className)}>
                            {b.label}
                          </span>
                        ))}
                        {/* Phones: inline with the badges instead of a lone icon on its own card row. */}
                        <span className="sm:hidden" onClick={(e) => e.stopPropagation()}>
                          <AIExplainButton
                            rowData={aiRowData(a)}
                            entityLabel={t("entityLabelAgentPerformance")}
                            context={t("aiExplainContext")}
                          />
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-lg bg-muted px-2 py-1">{t("leads")}: <strong>{a.leadsCount ?? 0}</strong></span>
                      <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-700">{t("conversions")}: <strong>{a.conversions ?? 0}</strong></span>
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{t("placements")}: <strong>{a.placements ?? 0}</strong></span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-foreground/85">
                    <span className="block font-semibold">
                      {a.leadsCount > 0 ? `${Math.round((a.conversions / a.leadsCount) * 100)}%` : "—"}
                    </span>
                    <div className="ms-auto mt-1.5 h-2 w-32 max-w-full overflow-hidden rounded-full bg-muted/75">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="!hidden sm:!table-cell">
                    <AIExplainButton
                      rowData={aiRowData(a)}
                      entityLabel={t("entityLabelAgentPerformance")}
                      context={t("aiExplainContext")}
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>

      {/* ── Create Agent Dialog ──────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogAddNewAgent")}</DialogTitle>
            <DialogDescription>
              {t("dialogAddNewAgentDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
                <AlertCircle className="h-4 w-4 shrink-0" />{createError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <Label>{t("formLabelFullName")} <span className="text-destructive">*</span></Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("formPlaceholderAgentFullName")}
                />
              </div>
              <div className="field">
                <Label>{tc("email")} <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={t("formPlaceholderEmail")}
                />
              </div>
              <div className="field">
                <Label>{t("formLabelPassword")} <span className="text-destructive">*</span></Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t("formPlaceholderPassword")}
                />
              </div>
              <div className="field">
                <Label>{t("formLabelCommissionRate")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={createForm.commissionRate}
                  placeholder="0"
                  onChange={(e) => setCreateForm((f) => ({ ...f, commissionRate: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">{t("formHintCommissionRate")}</p>
              </div>
            </div>

            <CascadingLocationPicker
              selectedCityIds={createCityIds}
              selectedStateIds={createStateIds}
              onChange={(cities, states) => { setCreateCityIds(cities); setCreateStateIds(states); }}
              label={t("formLabelAssignedRegion")}
            />

            <p className="text-xs text-muted-foreground">
              {t("formHintAssignedRegion")}
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createLoading}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {createLoading ? t("buttonCreating") : t("buttonCreateAgent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
