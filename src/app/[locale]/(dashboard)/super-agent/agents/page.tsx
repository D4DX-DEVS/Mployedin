"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  SuperAgentMetricsGrid,
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

const PERFORMANCE_OPTIONS = [
  { value: "", label: "All agents" },
  { value: "high_performer", label: "High Performers (≥50% conv.)" },
  { value: "needs_attention", label: "Needs Attention (<15% conv.)" },
  { value: "slow_response", label: "Slow Response (>48h avg.)" },
  { value: "no_activity", label: "No Activity (0 leads)" },
];

const LEADS_RANGE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "0-5", label: "0 – 5" },
  { value: "6-15", label: "6 – 15" },
  { value: "16-50", label: "16 – 50" },
  { value: "51+", label: "51+" },
];

const CONV_RATE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "0-25", label: "0 – 25%" },
  { value: "26-50", label: "26 – 50%" },
  { value: "51-75", label: "51 – 75%" },
  { value: "76-100", label: "76 – 100%" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "leadsCount", label: "Leads" },
  { value: "conversions", label: "Conversions" },
  { value: "placements", label: "Placements" },
  { value: "conversionRate", label: "Conversion Rate" },
  { value: "avgResponseHours", label: "Response Time" },
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
  const [agents, setAgents] = useState<AgentRow[]>([]);
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
    }
    setLoading(false);
  }, [filters, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  /* ── Create agent handler ── */
  const handleCreate = async () => {
    setCreateError("");
    if (!createForm.name || !createForm.email || !createForm.password) {
      setCreateError("Name, email, and password are required.");
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
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
        setCreateError(e.error ?? "Failed to create agent");
        return;
      }
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", commissionRate: "0" });
      setCreateCityIds([]);
      setCreateStateIds([]);
      fetchAgents();
    } catch {
      setCreateError("Network error");
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
      badges.push({ label: "No Activity", className: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300" });
    } else if (agent.conversionRate >= 50) {
      badges.push({ label: "High Performer", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" });
    } else if (agent.conversionRate < 15 && agent.leadsCount > 0) {
      badges.push({ label: "Needs Attention", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" });
    }
    if (agent.avgResponseHours > 48 && agent.leadsCount > 0) {
      badges.push({ label: "Slow Response", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" });
    }
    return badges;
  }

  /* ── Derived values ── */
  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Name", key: "name" },
    { header: "Email", key: "email" },
    { header: "Leads", key: "leadsCount" },
    { header: "Conversions", key: "conversions" },
    { header: "Placements", key: "placements" },
    { header: "Conv. Rate", key: "conversionRate", formatter: (v) => `${v ?? 0}%` },
    { header: "Avg Response (h)", key: "avgResponseHours" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: agents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-agents",
    title: "Agent Performance",
  });

  // Reconstruct the selected range value for the dropdown
  const leadsRangeValue = filters.leadsMin || filters.leadsMax
    ? (filters.leadsMax ? `${filters.leadsMin}-${filters.leadsMax}` : `${filters.leadsMin}+`)
    : "";
  const convRateValue = filters.convRateMin || filters.convRateMax
    ? (filters.convRateMax ? `${filters.convRateMin}-${filters.convRateMax}` : `${filters.convRateMin}+`)
    : "";

  const kpis = [
    {
      label: "Total Agents",
      value: agents.length,
      helper: "Live team members currently visible in your reporting scope.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Total Leads",
      value: agents.reduce((a, b) => a + (b.leadsCount ?? 0), 0),
      helper: "Combined employer opportunities being worked across the team.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Conversions",
      value: agents.reduce((a, b) => a + (b.conversions ?? 0), 0),
      helper: "Leads converted into active hiring relationships or outcomes.",
      icon: <Activity className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: "Placements",
      value: agents.reduce((a, b) => a + (b.placements ?? 0), 0),
      helper: "Confirmed placements credited to your supervised team.",
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
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Agent Performance"
        description="Monitor agent activity, lead conversion, and placement momentum across your team from one clean review surface."
      >
        <SuperAgentInsightsPanel />
        <div className="flex flex-col gap-3 sm:min-w-[160px] xl:min-w-[180px]">
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Roster</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{total} visible rows</p>
            <p className="text-xs text-muted-foreground">Current page and search results stay in sync with pagination.</p>
          </div>
          <Button
            onClick={() => { setCreateError(""); setShowCreate(true); }}
            className="gap-2 w-full"
          >
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
        </div>
      </SuperAgentPageIntro>

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Team review"
        title="Compare output across your assigned agents"
        description="Search by name or email, filter by performance level, leads volume, and conversion rate."
      >
        {/* ── Search Row + Advanced Toggle ── */}
        <TableToolbar
          search={filters.search}
          onSearchChange={(v) => updateFilter("search", v)}
          searchPlaceholder="Search agents..."
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
                Reset
              </button>
            ) : undefined
          }
          filterContent={
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {/* Performance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Performance</label>
                  <SearchableSelect
                    options={PERFORMANCE_OPTIONS}
                    value={filters.performance}
                    onValueChange={(v) => updateFilter("performance", v)}
                    placeholder="All agents"
                    searchPlaceholder="Filter performance..."
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Leads Range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Leads Count</label>
                  <SearchableSelect
                    options={LEADS_RANGE_OPTIONS}
                    value={leadsRangeValue}
                    onValueChange={handleLeadsRange}
                    placeholder="Any"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Conversion Rate Range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Conversion Rate</label>
                  <SearchableSelect
                    options={CONV_RATE_OPTIONS}
                    value={convRateValue}
                    onValueChange={handleConvRateRange}
                    placeholder="Any"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort By</label>
                  <SearchableSelect
                    options={SORT_OPTIONS}
                    value={filters.sortBy}
                    onValueChange={(v) => updateFilter("sortBy", v)}
                    placeholder="Name"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort Order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
                  <SearchableSelect
                    options={[
                      { value: "asc", label: "Ascending" },
                      { value: "desc", label: "Descending" },
                    ]}
                    value={filters.sortOrder}
                    onValueChange={(v) => updateFilter("sortOrder", v)}
                    placeholder="Ascending"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">Quick:</span>
                {[
                  { label: "Top Performers", action: () => updateFilter("performance", "high_performer") },
                  { label: "Needs Attention", action: () => updateFilter("performance", "needs_attention") },
                  { label: "Slow Responders", action: () => updateFilter("performance", "slow_response") },
                  { label: "No Activity", action: () => updateFilter("performance", "no_activity") },
                  { label: "High Volume (50+ leads)", action: () => handleLeadsRange("51+") },
                  { label: "Best Converters (75%+)", action: () => handleConvRateRange("76-100") },
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
            </div>
          }
          className="mb-4"
        />

        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead><SortHeader field="name">Agent</SortHeader></TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right"><SortHeader field="leadsCount">Leads</SortHeader></TableHead>
                <TableHead className="text-right"><SortHeader field="conversions">Conversions</SortHeader></TableHead>
                <TableHead className="text-right"><SortHeader field="placements">Placements</SortHeader></TableHead>
                <TableHead className="text-right"><SortHeader field="conversionRate">Conv. Rate</SortHeader></TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Users2 className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No agents found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try a broader search or adjust filters to see more results.</p>
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
                      {badges.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {badges.map((b) => (
                            <span key={b.label} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", b.className)}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.email}</TableCell>
                  <TableCell className="text-right text-foreground/85">{a.leadsCount ?? 0}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600">{a.conversions ?? 0}</TableCell>
                  <TableCell className="text-right font-medium text-primary">{a.placements ?? 0}</TableCell>
                  <TableCell className="text-right text-foreground/85">
                    {a.leadsCount > 0
                      ? `${Math.round((a.conversions / a.leadsCount) * 100)}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-muted/75">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, a.leadsCount > 0 ? (a.conversions / a.leadsCount) * 100 : 0)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <AIExplainButton
                      rowData={{
                        name: a.name,
                        leads: a.leadsCount,
                        conversions: a.conversions,
                        placements: a.placements,
                        conversionRate: a.conversionRate,
                        avgResponseHours: a.avgResponseHours,
                      }}
                      entityLabel="Agent Performance"
                      context="Analyze this agent's performance metrics. Identify strengths and weaknesses. If conversion is low relative to leads, explain possible causes (slow response, poor follow-up). Suggest 2-3 specific improvement actions."
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
            <DialogTitle>Add New Agent</DialogTitle>
            <DialogDescription>
              Create a new agent under your team. Regions must be within your assigned territory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{createError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Agent full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="agent@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Password <span className="text-destructive">*</span></Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label>Commission Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={createForm.commissionRate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, commissionRate: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">Set the agent&apos;s commission rate (0–100%). Default is 0%.</p>
              </div>
            </div>

            <CascadingLocationPicker
              selectedCityIds={createCityIds}
              selectedStateIds={createStateIds}
              onChange={(cities, states) => { setCreateCityIds(cities); setCreateStateIds(states); }}
              label="Assigned Region"
            />

            <p className="text-xs text-muted-foreground">
              The agent will be automatically assigned to your team. Their region must fall within your territory.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createLoading}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {createLoading ? "Creating…" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
