"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { accountFieldsError } from "@/lib/errors/account-fields";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, BriefcaseBusiness,
  Mail, Target, Users2,
  Plus,
} from "lucide-react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { useQueryFlag } from "@/hooks/useQueryFlag";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { SuperAgentInsightsPanel } from "@/components/features/super-agent/InsightsPanel";
import { AIExplainButton } from "@/components/shared/AIExplainButton";
import { cn } from "@/lib/utils";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";

interface AgentRow {
  _id: string;
  agentId: string;
  name: string;
  email: string;
  isActive?: boolean;
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
interface Filters extends Record<string, string> {
  search: string;
  status: string;
  performance: string;
  leadsMin: string;
  leadsMax: string;
  convRateMin: string;
  convRateMax: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  search: "", status: "", performance: "",
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
  if (f.status) count++;
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
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("superAgentAgents");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  // Aggregates across every agent assigned to this super agent, not just the
  // page on screen. The API computes them before slicing.
  const [totals, setTotals] = useState({ agents: 0, leads: 0, conversions: 0, placements: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const { filters, setFilter, resetFilters } = useUrlFilters(
    INITIAL_FILTERS,
    { debounceKeys: ["search"], debounceMs: 400 }
  );

  // Create agent modal state — addressable as ?new=1 so the global Create menu
  // can open it from any page.
  const [showCreate, setShowCreate] = useQueryFlag("new");
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", commissionRate: "0" });
  const [createCityIds, setCreateCityIds] = useState<string[]>([]);
  const [createStateIds, setCreateStateIds] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  // Step the banner belongs to: a taken email (409) goes back to Account.
  const [createErrorStep, setCreateErrorStep] = useState<number | undefined>();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.performance) params.set("performance", filters.performance);
    if (filters.leadsMin) params.set("leadsMin", filters.leadsMin);
    if (filters.leadsMax) params.set("leadsMax", filters.leadsMax);
    if (filters.convRateMin) params.set("convRateMin", filters.convRateMin);
    if (filters.convRateMax) params.set("convRateMax", filters.convRateMax);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

    try {
      const res = await fetch(`/api/super-agent/agents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.items ?? []);
        updateTotal(data.total ?? data.items?.length ?? 0);
        setTotals(data.totals ?? { agents: data.total ?? 0, leads: 0, conversions: 0, placements: 0 });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  /* ── Create agent handler ── */
  // Name / email / password are checked by the Account step before the dialog
  // lets the super agent leave it, and again on submit (StepFormDialog).
  const handleCreate = async () => {
    setCreateError("");
    setCreateErrorStep(undefined);
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
        const { message } = await formErrorFromResponse(res, {
          t: tf,
          locale,
          fieldLabels: { name: t("formLabelFullName"), email: tc("email"), password: t("formLabelPassword"), commissionRate: t("formLabelCommissionRate") },
          conflict: tf("emailInUse"),
        });
        setCreateErrorStep(res.status === 409 ? 0 : undefined);
        setCreateError(message);
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

  const handleLeadsRange = useCallback((value: string) => {
    const { min, max } = parseRange(value);
    setFilter("leadsMin", min);
    setFilter("leadsMax", max);
    resetPage();
  }, [setFilter, resetPage]);

  const handleConvRateRange = useCallback((value: string) => {
    const { min, max } = parseRange(value);
    setFilter("convRateMin", min);
    setFilter("convRateMax", max);
    resetPage();
  }, [setFilter, resetPage]);

  /* ── Column sort ── */
  const toggleSort = useCallback((field: string) => {
    const newOrder = filters.sortBy === field && filters.sortOrder === "asc" ? "desc" : "asc";
    setFilter("sortBy", field);
    setFilter("sortOrder", newOrder);
    resetPage();
  }, [filters.sortBy, filters.sortOrder, setFilter, resetPage]);

  /* ── Performance badge logic ── */
  function getPerformanceBadge(agent: AgentRow) {
    const badges: { label: string; className: string }[] = [];
    // The account switch outranks any performance reading: a deactivated
    // agent cannot sign in, whatever their numbers say.
    if (agent.isActive === false) {
      badges.push({ label: t("badgeDeactivated"), className: "bg-slate-800 text-white" });
    }
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
    { label: t("totalAgents"), value: totals.agents, note: t("totalAgentsHelper"), icon: Users2 },
    { label: t("totalLeads"), value: totals.leads, note: t("totalLeadsHelper"), icon: Target },
    { label: t("conversions"), value: totals.conversions, note: t("conversionsHelper"), icon: Activity },
    { label: t("placements"), value: totals.placements, note: t("placementsHelper"), icon: BriefcaseBusiness },
  ];

  /* Sort order for the column heads: the filter state carries strings. */
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  return (
    <div className="page-container">
      {/* The "Roster / N visible rows / stays in sync with pagination" box is
          gone: the pagination footer already states the count, and explaining
          that pagination works is not information. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={kpis}
        compact
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

      <SuperAgentSection title={t("teamReviewTitle")} className="[&>div:first-child]:sr-only">
        {/* ---- Error State ---- */}
        {error && <ErrorState onRetry={() => fetchAgents()} />}

        {/* ── Search + everyday filters in plain sight, ranges and sorts behind More ── */}
        <InlineFilterBar
          className="mb-4"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onClear={(activeFilterCount > 0 || filters.search || filters.performance) ? () => { resetFilters(); resetPage(); } : undefined}
          more={(
            <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
              <div className="grid min-w-0 flex-[1_1_100%] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                    onValueChange={(v) => { setFilter("sortBy", v); resetPage(); }}
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
                    onValueChange={(v) => { setFilter("sortOrder", v); resetPage(); }}
                    placeholder={t("ascending")}
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">{t("quickFilterLabel")}:</span>
                {[
                  { label: t("quickFilterTopPerformers"), action: () => { setFilter("performance", "high_performer"); resetPage(); } },
                  { label: t("quickFilterNeedsAttention"), action: () => { setFilter("performance", "needs_attention"); resetPage(); } },
                  { label: t("quickFilterSlowResponders"), action: () => { setFilter("performance", "slow_response"); resetPage(); } },
                  { label: t("quickFilterNoActivity"), action: () => { setFilter("performance", "no_activity"); resetPage(); } },
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
          )}
          moreActiveCount={[filters.leadsMin, filters.leadsMax, filters.convRateMin, filters.convRateMax].filter(Boolean).length}
        >
          <InlineFilterSearch
            value={filters.search}
            onChange={(v) => { setFilter("search", v); resetPage(); }}
            placeholder={t("searchAgentsPlaceholder")}
          />
          <SearchableSelect
            options={[
              { value: "", label: tc("all") },
              { value: "active", label: tc("active") },
              { value: "inactive", label: t("badgeDeactivated") },
            ]}
            value={filters.status}
            onValueChange={(v) => { setFilter("status", v); resetPage(); }}
            placeholder={tc("all")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={getPerformanceOptions(t)}
            value={filters.performance}
            onValueChange={(v) => { setFilter("performance", v); resetPage(); }}
            placeholder={t("allAgents")}
            className={INLINE_FILTER_CONTROL}
          />
        </InlineFilterBar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>
                  <SortableTableHeader label={t("agent")} active={filters.sortBy === "name"} order={sortOrder} onClick={() => toggleSort("name")} />
                </TableHead>
                <TableHead>{t("progress")}</TableHead>
                <TableHead className="text-right" title={t("convRateExplainer")}>
                  <SortableTableHeader label={t("convRateShort")} active={filters.sortBy === "conversionRate"} order={sortOrder} onClick={() => toggleSort("conversionRate")} />
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={4} />
              ) : agents.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12">
                    <EmptyState title={t("noAgentsFound")} description={t("noAgentsFoundHelper")} icon={Users2} />
                  </TableCell>
                </TableRow>
              ) : agents.map((a) => {
                const badges = getPerformanceBadge(a);
                return (
                <TableRow
                  key={a._id}
                  className="group cursor-pointer transition-colors"
                  onClick={(e) => {
                    // Phones: the row is a collapsible card and its tap expands
                    // it, so it must not also navigate; the name link opens the
                    // agent there (and for keyboard users everywhere).
                    if (e.currentTarget.hasAttribute("data-mobile-collapsible") && window.matchMedia("(max-width: 639px)").matches) return;
                    if ((e.target as HTMLElement).closest("a, button, [data-table-action]")) return;
                    router.push(`/${locale}/super-agent/agents/${a.agentId}`);
                  }}
                >
                  <TableCell>
                    {/* `grid`, not `flex-col`: the card layout re-flows any
                        flex-col (and any unclassed div) into one wrapping inline
                        row, which crammed the email into a fragment beside the
                        name. A grid container keeps its own layout, so name,
                        email and badges each hold a full-width line. */}
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={a.name} email={a.email} className="h-9 w-9 shrink-0" colorful />
                      <div className="grid w-full min-w-0 gap-1 max-sm:pe-12">
                        <Link
                          href={`/${locale}/super-agent/agents/${a.agentId}`}
                          // `!`: the phone card table centres every link as an
                          // inline-flex button (globals.css), which pulled the name
                          // off its avatar.
                          className="truncate !justify-start font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {a.name}
                        </Link>
                        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{a.email}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          {badges.map((b) => (
                            <span key={b.label} className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded-full", b.className)}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Phones: the AI sparkle is pinned to the card's top end
                        corner (the row is position:relative in card mode),
                        clear of the expand chevron, instead of floating
                        wherever the identity line happens to wrap. */}
                    <span
                      className="sm:hidden max-sm:absolute max-sm:end-8 max-sm:top-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AIExplainButton
                        rowData={aiRowData(a)}
                        entityLabel={t("entityLabelAgentPerformance")}
                        context={t("aiExplainContext")}
                      />
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-lg bg-muted px-2 py-1">{t("leads")}: <strong>{a.leadsCount ?? 0}</strong></span>
                      <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-700">{t("conversions")}: <strong>{a.conversions ?? 0}</strong></span>
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{t("placements")}: <strong>{a.placements ?? 0}</strong></span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-foreground/85">
                    {/* Converted leads over total leads — NOT placements.
                        Without the sub-label a row reading "22%" next to
                        "Placements: 0" looks like a miscalculation. */}
                    <span className="block font-semibold" title={t("convRateExplainer")}>
                      {a.leadsCount > 0 ? `${Math.round((a.conversions / a.leadsCount) * 100)}%` : "—"}
                    </span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {t("convRateBasis", { conversions: a.conversions ?? 0, leads: a.leadsCount ?? 0 })}
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

      </SuperAgentSection>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Create Agent: Account → Region, on the Add Employer frame ── */}
      <StepFormDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            // Remove ?new parameter from URL when closing the dialog
            const params = new URLSearchParams(searchParams?.toString());
            params.delete("new");
            const newUrl = params.toString() ? `?${params.toString()}` : "";
            window.history.replaceState(null, "", newUrl);
          }
        }}
        title={t("dialogAddNewAgent")}
        description={t("dialogAddNewAgentDescription")}
        error={createError}
        errorStep={createErrorStep}
        onErrorDismiss={() => setCreateError("")}
        submitLabel={t("buttonCreateAgent")}
        submittingLabel={t("buttonCreating")}
        submitting={createLoading}
        onSubmit={handleCreate}
        steps={[
          {
            label: tc("stepAccount"),
            validate: () => accountFieldsError(createForm, { t: tf, locale }),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="create-agent-name">{t("formLabelFullName")} <span className="text-destructive">*</span></Label>
                  <Input
                    id="create-agent-name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("formPlaceholderAgentFullName")}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="create-agent-email">{tc("email")} <span className="text-destructive">*</span></Label>
                  <Input
                    id="create-agent-email"
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder={t("formPlaceholderEmail")}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="create-agent-password">{t("formLabelPassword")} <span className="text-destructive">*</span></Label>
                  <PasswordInput
                    id="create-agent-password"
                    value={createForm.password}
                    onChange={(password) => setCreateForm((f) => ({ ...f, password }))}
                    placeholder={tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })}
                    aria-describedby="create-agent-password-hint"
                  />
                  <p id="create-agent-password-hint" className="text-xs text-muted-foreground">{tf("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
                </div>
                <div className="field">
                  <Label htmlFor="create-agent-commission">{t("formLabelCommissionRate")}</Label>
                  <Input
                    id="create-agent-commission"
                    type="number"
                    min="0"
                    max="100"
                    value={createForm.commissionRate}
                    placeholder="0"
                    onChange={(e) => setCreateForm((f) => ({ ...f, commissionRate: e.target.value }))}
                    aria-describedby="create-agent-commission-hint"
                  />
                  <p id="create-agent-commission-hint" className="text-xs text-muted-foreground">{t("formHintCommissionRate")}</p>
                </div>
              </div>
            ),
          },
          {
            label: tc("stepRegion"),
            content: (
              <div className="space-y-2">
                <CascadingLocationPicker
                  selectedCityIds={createCityIds}
                  selectedStateIds={createStateIds}
                  onChange={(cities, states) => { setCreateCityIds(cities); setCreateStateIds(states); }}
                  locationsEndpoint="/api/super-agent/territory/locations"
                  emptyMessage={tc("noTerritoryAssigned")}
                  label={t("formLabelAssignedRegion")}
                  alwaysOpen
                />
                <p className="text-xs text-muted-foreground">{t("formHintAssignedRegion")}</p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
