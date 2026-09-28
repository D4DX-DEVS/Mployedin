"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, AlertCircle, Pencil,
  Trash2, Inbox, DollarSign, Sparkles, RotateCcw,
  TrendingUp, Users,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/shared/ErrorState";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { usePermissions } from "@/hooks/usePermissions";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

function salaryAmount(salary: Placement["salary"]): number | undefined {
  return typeof salary === "number" ? salary : salary?.amount;
}

function salaryCurrency(p: Pick<Placement, "salary" | "currency">): string {
  return p.currency ?? (typeof p.salary === "object" ? p.salary?.currency : undefined) ?? "AED";
}

interface Placement {
  _id: string;
  startDate: string;
  placedAt: string;
  /** /api/placements sends { amount, currency }; a bare number is the stored shape. */
  salary?: number | { amount: number; currency?: string };
  currency?: string;
  visaStatus: "not_required" | "pending" | "approved" | "rejected" | "stamped";
  commissionPaid: boolean;
  commissionAmount?: number;
  candidateName?: string;
  candidateEmail?: string;
  companyName?: string;
  agentName?: string;
  jobTitle?: string;
  notes?: string;
  createdAt: string;
}

const VISA_ICONS: Record<string, React.ReactNode> = {
  stamped: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  rejected: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
  not_required: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />,
};

function formatSalaryValue(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return formatCount(value);
}

function formatCurrencyBreakdown(salaryByCurrency: Record<string, number>, t: any): string {
  const entries = Object.entries(salaryByCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return t("noSalaryData");
  return entries.map(([cur, val]) => `${formatCount(val)} ${cur}`).join(t("currencyBreakdownSeparator"));
}

export default function AdminPlacementsPage() {
  const t = useTranslations("adminPlacements");
  const tc = useTranslations("common");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [totalValue, setTotalValue] = useState(0);
  const [salaryByCurrency, setSalaryByCurrency] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  /* The search term addresses the view: an admin notification, a ⌘K people
     hit and the system-health panel all link here with `?search=<name>`,
     and a filter kept only in component state would silently ignore it. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "startDate", "salary"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
    resetPage();
  };
  const [visaFilter, setVisaFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [editItem, setEditItem] = useState<Placement | null>(null);

  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const activeFilterCount = [visaFilter, commissionFilter, currencyFilter, dateFrom, dateTo, salaryMin, salaryMax].filter(Boolean).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (visaFilter) params.set("visaStatus", visaFilter);
      if (commissionFilter) params.set("commissionPaid", commissionFilter);
      if (currencyFilter) params.set("currency", currencyFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (salaryMin) params.set("salaryMin", salaryMin);
      if (salaryMax) params.set("salaryMax", salaryMax);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.placements ?? []);
        updateTotal(data.total ?? 0);
        setTotalValue(data.totalSalaryValue ?? 0);
        setSalaryByCurrency(data.salaryByCurrency ?? {});
        setLoadFailed(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setLoadFailed(true);
        toast.error(err.error || t("toastLoadFailed"));
      }
    } catch (error) {
      // A toast alone left the table body empty, which reads exactly like
      // "no placements" once the toast has gone.
      setLoadFailed(true);
      toast.error(t("toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [page, search, visaFilter, commissionFilter, currencyFilter, dateFrom, dateTo, salaryMin, salaryMax, sortBy, sortOrder, limit, updateTotal]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setSearch(""); setVisaFilter(""); setCommissionFilter(""); setCurrencyFilter("");
    setDateFrom(""); setDateTo(""); setSalaryMin(""); setSalaryMax("");
    resetPage();
  };

  const fetchAiInsights = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Analyze the current placement data and provide brief actionable insights. We have ${total} total placements. Salary breakdown: ${formatCurrencyBreakdown(salaryByCurrency, t)}. Pending visas: ${pendingVisa}. Unpaid commissions: ${unpaidCommissions}. Recent placements this page: ${placements.length}. Give 3-4 bullet points with trends, risks, and recommendations. Keep it concise.`,
            },
          ],
          currentPage: "admin/placements",
        }),
      });
      if (res.ok) {
        // /api/ai/chat streams plain text, not JSON
        const text = await res.text();
        setAiInsights(text.trim() || "No insights available.");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastGenerateInsightsFailed"));
        setAiInsights(null);
      }
    } catch (error) {
      toast.error(t("toastGenerateInsightsFailed"));
      setAiInsights(null);
    } finally {
      setAiLoading(false);
    }
  };

  const markCommission = async (id: string, paid: boolean) => {
    try {
      const res = await fetch(`/api/placements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPaid: paid }),
      });
      if (res.ok) {
        toast.success(paid ? t("toastCommissionMarkedPaid") : t("toastCommissionMarkedUnpaid"));
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastUpdateCommissionStatusFailed"));
      }
    } catch (error) {
      toast.error(t("toastUpdateCommissionStatusFailed"));
    }
  };

  const handleEdit = async (values: Record<string, string>) => {
    try {
      const res = await fetch(`/api/placements/${editItem!._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, salary: values.salary ? Number(values.salary) : undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || t("toastUpdatePlacementFailed"));
        return;
      }
      toast.success(t("toastPlacementUpdated"));
      setEditItem(null);
      load();
    } catch (error) {
      toast.error(t("toastUpdatePlacementFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteConfirmation"));
    if (!ok) return;
    try {
      const res = await fetch(`/api/placements/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("toastPlacementDeleted"));
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastDeletePlacementFailed"));
      }
    } catch (error) {
      toast.error(t("toastDeletePlacementFailed"));
    }
  };

  const visaStatusOptions = [
    { value: "not_required", label: t("notRequired") },
    { value: "pending", label: t("pending") },
    { value: "approved", label: t("approved") },
    { value: "rejected", label: t("rejected") },
    { value: "stamped", label: t("stamped") },
  ];

  const EDIT_FIELDS: CrudField[] = [
    { name: "salary", label: t("salary"), type: "number" },
    // ISO 4217 codes are the label on purpose: they read the same in every
    // locale, and every other currency picker in the product shows the code.
    { name: "currency", label: t("currency"), type: "select", options: [
      { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
    ]},
    { name: "visaStatus", label: t("visa"), type: "select", options: visaStatusOptions },
    { name: "notes", label: t("notes"), type: "textarea" },
  ];

  // Unpaid rows put "Mark paid" in plain sight; edit, undo and delete sit under More.
  const rowActionsFor = (p: Placement): { quick: RowAction[]; menu: RowAction[] } => {
    const canUpdate = can("placements", "update");
    const quick: RowAction[] = !p.commissionPaid && canUpdate
      ? [{ key: "paid", label: t("markPaid"), icon: CheckCircle2, iconClassName: "text-emerald-600", onSelect: () => markCommission(p._id, true) }]
      : [];
    const menu: RowAction[] = [];
    if (canUpdate) {
      menu.push({ key: "edit", label: t("edit"), icon: Pencil, onSelect: () => setEditItem(p) });
      if (p.commissionPaid) menu.push({ key: "unpaid", label: t("markUnpaid"), icon: RotateCcw, onSelect: () => markCommission(p._id, false) });
    }
    if (can("placements", "delete")) {
      menu.push({ key: "delete", label: t("delete"), icon: Trash2, onSelect: () => handleDelete(p._id), destructive: true });
    }
    return { quick, menu };
  };

  const pendingVisa = placements.filter((p) => p.visaStatus === "pending").length;
  const unpaidCommissions = placements.filter((p) => !p.commissionPaid).length;

  const exportColumns: ExportColumn<Placement>[] = [
    { header: t("exportHeaderCandidate"), key: "candidateName", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderCompany"), key: "companyName", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderJobTitle"), key: "jobTitle", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderAgent"), key: "agentName", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderSalary"), key: "salary", formatter: (_v, r) => `${salaryAmount((r as unknown as Placement).salary) ?? 0} ${salaryCurrency(r as unknown as Placement)}` },
    { header: t("exportHeaderVisaStatus"), key: "visaStatus" },
    { header: t("exportHeaderCommissionPaid"), key: "commissionPaid", formatter: (v) => v ? t("exportYes") : t("exportNo") },
    { header: t("exportHeaderStartDate"), key: "startDate", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "placements",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* ─── Compact page header ──────────────────────────────────────── */}
      <DashboardPageHeader
        compact
        title={t("placementTracking")}
        description={t("placementTrackingDescription")}
        actions={(
          <Button
            onClick={fetchAiInsights}
            disabled={aiLoading}
            className="gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {aiLoading ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? t("analyzing") : t("generateInsights")}
          </Button>
        )}
        metrics={[
          { label: t("totalPlacements"), value: total, note: t("allTime"), icon: Users, iconClassName: "text-status-applied", iconSurfaceClassName: "bg-status-applied-bg" },
          { label: t("pendingVisa"), value: pendingVisa, note: t("awaitingApproval"), icon: Clock, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg" },
          { label: t("unpaidCommission"), value: unpaidCommissions, note: t("needsCollection"), icon: DollarSign, iconClassName: "text-red-500", iconSurfaceClassName: "bg-status-rejected-bg" },
          { label: t("totalSalaryValue"), value: formatSalaryValue(totalValue), note: Object.keys(salaryByCurrency).length > 0 ? Object.entries(salaryByCurrency).slice(0, 2).map(([c, v]) => `${formatSalaryValue(v)} ${c}`).join(t("currencyBreakdownSeparator")) : t("noData"), icon: TrendingUp, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
        ]}
        compactOnMobile
      >

        {/* AI Insights inline panel */}
        {aiInsights && (
          <div className="mt-4 rounded-3xl border border-sky-200/50 bg-sky-50/50 card-pad">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-status-applied" />
              <span className="text-sm font-semibold text-sky-800">{t("aiPlacementInsights")}</span>
            </div>
            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{aiInsights}</div>
          </div>
        )}

      </DashboardPageHeader>

      {/* ─── Filters ──────────────────────────────────────────────────── */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        more={(
          <>
            <DateTimePicker
              mode="date"
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); resetPage(); }}
              placeholder={t("from")}
              className="min-w-0 max-w-56 flex-[1_1_9rem]"
            />
            <DateTimePicker
              mode="date"
              value={dateTo}
              onChange={(v) => { setDateTo(v); resetPage(); }}
              placeholder={t("to")}
              className="min-w-0 max-w-56 flex-[1_1_9rem]"
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder={t("minSalaryPlaceholder")}
              aria-label={t("minSalaryPlaceholder")}
              value={salaryMin}
              onChange={(e) => { setSalaryMin(e.target.value); resetPage(); }}
              className={`${INLINE_FILTER_CONTROL} shadow-none`}
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder={t("maxSalaryPlaceholder")}
              aria-label={t("maxSalaryPlaceholder")}
              value={salaryMax}
              onChange={(e) => { setSalaryMax(e.target.value); resetPage(); }}
              className={`${INLINE_FILTER_CONTROL} shadow-none`}
            />
          </>
        )}
        moreLabel={t("advancedFilters")}
        moreActiveCount={[dateFrom, dateTo, salaryMin, salaryMax].filter(Boolean).length}
        onClear={activeFilterCount > 0 ? clearFilters : undefined}
        clearLabel={t("clearActiveFilters", { count: activeFilterCount })}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[{ value: "", label: t("allVisaStatuses") }, ...visaStatusOptions]}
          value={visaFilter}
          onValueChange={(v) => { setVisaFilter(v); resetPage(); }}
          placeholder={t("allVisaStatuses")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "", label: t("allCommission") },
            { value: "true", label: t("paid") },
            { value: "false", label: t("unpaid") },
          ]}
          value={commissionFilter}
          onValueChange={(v) => { setCommissionFilter(v); resetPage(); }}
          placeholder={t("allCommission")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "", label: t("allCurrencies") },
            { value: "AED", label: "AED" },
            { value: "USD", label: "USD" },
            { value: "EUR", label: "EUR" },
            { value: "SAR", label: "SAR" },
          ]}
          value={currencyFilter}
          onValueChange={(v) => { setCurrencyFilter(v); resetPage(); }}
          placeholder={t("allCurrencies")}
        />
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v); resetPage(); }}
          options={[
            { value: "createdAt", label: t("sortDateAdded") },
            { value: "startDate", label: t("exportHeaderStartDate") },
            { value: "salary", label: t("salary") },
          ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      {loadFailed && !loading ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {[t("candidate"), t("role"), t("company"), t("agent")].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
                <TableHead>
                  <SortableTableHeader label={t("salary")} active={sortBy === "salary"} order={sortOrder} onClick={() => sortByColumn("salary")} />
                </TableHead>
                <TableHead>{t("visa")}</TableHead>
                <TableHead>{t("commission")}</TableHead>
                <TableHead>
                  <SortableTableHeader label={t("date")} active={sortBy === "startDate"} order={sortOrder} onClick={() => sortByColumn("startDate")} />
                </TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={6} cols={9} />
              ) : placements.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="h-44 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/50">
                        <Inbox className="h-7 w-7 opacity-40" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("noPlacementsFound")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activeFilterCount > 0
                            ? t("tryAdjustingFilters")
                            : t("placementsWillAppear")}
                        </p>
                      </div>
                      {activeFilterCount > 0 && (
                        <Button variant="outline" size="dense" onClick={clearFilters} className="mt-1 rounded-lg text-xs">
                          {t("clearFilters")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => (
                <TableRow key={p._id} className="group transition-colors">
                  <TableCell className="py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={p.candidateName} email={p.candidateEmail} className="h-10 w-10" colorful />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{p.candidateName ?? t("dashSeparator")}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.candidateEmail}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.jobTitle ?? t("dashSeparator")}</TableCell>
                  <TableCell>{p.companyName ?? t("dashSeparator")}</TableCell>
                  <TableCell className="text-muted-foreground">{p.agentName ?? t("dashSeparator")}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatCount(salaryAmount(p.salary) ?? 0)}{" "}
                    <span className="text-xs text-muted-foreground">{salaryCurrency(p)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {VISA_ICONS[p.visaStatus]}
                      <span className="text-sm">{visaStatusOptions.find((o) => o.value === p.visaStatus)?.label ?? t("dashSeparator")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.commissionPaid ? "paid" : "pending"} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(new Date(p.startDate), { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions name={p.candidateName ?? t("dashSeparator")} {...rowActionsFor(p)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t("editPlacement")}
        fields={EDIT_FIELDS}
        initialValues={editItem ? {
          salary: String(salaryAmount(editItem.salary) ?? ""),
          currency: salaryCurrency(editItem),
          visaStatus: editItem.visaStatus ?? "",
          notes: editItem.notes ?? "",
        } : {}}
        onSubmit={handleEdit}
      />
    </div>
  );
}
