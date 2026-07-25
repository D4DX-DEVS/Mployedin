"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Search, Filter, CheckCircle2, Clock, AlertCircle, Pencil,
  Trash2, Inbox, CalendarDays, DollarSign, Sparkles, ChevronDown, ChevronUp, X, RotateCcw,
  TrendingUp, Users,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";

interface Placement {
  _id: string;
  startDate: string;
  placedAt: string;
  salary: number;
  currency: string;
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
  return value.toLocaleString();
}

function formatCurrencyBreakdown(salaryByCurrency: Record<string, number>, t: any): string {
  const entries = Object.entries(salaryByCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return t("noSalaryData");
  return entries.map(([cur, val]) => `${val.toLocaleString()} ${cur}`).join(t("currencyBreakdownSeparator"));
}

export default function AdminPlacementsPage() {
  const t = useTranslations("adminPlacements");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [totalValue, setTotalValue] = useState(0);
  const [salaryByCurrency, setSalaryByCurrency] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.placements ?? []);
        updateTotal(data.total ?? 0);
        setTotalValue(data.totalSalaryValue ?? 0);
        setSalaryByCurrency(data.salaryByCurrency ?? {});
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to load placements");
      }
    } catch (error) {
      toast.error("Failed to load placements");
    } finally {
      setLoading(false);
    }
  }, [page, search, visaFilter, commissionFilter, currencyFilter, dateFrom, dateTo, salaryMin, salaryMax, limit, updateTotal]);

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
          message: `Analyze the current placement data and provide brief actionable insights. We have ${total} total placements. Salary breakdown: ${formatCurrencyBreakdown(salaryByCurrency, t)}. Pending visas: ${pendingVisa}. Unpaid commissions: ${unpaidCommissions}. Recent placements this page: ${placements.length}. Give 3-4 bullet points with trends, risks, and recommendations. Keep it concise.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data.reply ?? data.message ?? "No insights available.");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to generate insights");
        setAiInsights(null);
      }
    } catch (error) {
      toast.error("Failed to generate insights");
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
        toast.success(paid ? "Commission marked as paid" : "Commission marked as unpaid");
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update commission status");
      }
    } catch (error) {
      toast.error("Failed to update commission status");
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
        toast.error(e.error || "Failed to update placement");
        return;
      }
      toast.success("Placement updated successfully");
      setEditItem(null);
      load();
    } catch (error) {
      toast.error("Failed to update placement");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteConfirmation"));
    if (!ok) return;
    try {
      const res = await fetch(`/api/placements/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Placement deleted successfully");
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to delete placement");
      }
    } catch (error) {
      toast.error("Failed to delete placement");
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
    { name: "currency", label: t("currency"), type: "select", options: [
      { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
    ]},
    { name: "visaStatus", label: t("visa"), type: "select", options: visaStatusOptions },
    { name: "notes", label: t("notes"), type: "textarea" },
  ];

  const pendingVisa = placements.filter((p) => p.visaStatus === "pending").length;
  const unpaidCommissions = placements.filter((p) => !p.commissionPaid).length;

  const exportColumns: ExportColumn<Placement>[] = [
    { header: "Candidate", key: "candidateName", formatter: (v) => String(v ?? "—") },
    { header: "Company", key: "companyName", formatter: (v) => String(v ?? "—") },
    { header: "Job Title", key: "jobTitle", formatter: (v) => String(v ?? "—") },
    { header: "Agent", key: "agentName", formatter: (v) => String(v ?? "—") },
    { header: "Salary", key: "salary", formatter: (v, r) => `${v ?? 0} ${(r as unknown as Placement).currency ?? "AED"}` },
    { header: "Visa Status", key: "visaStatus" },
    { header: "Commission Paid", key: "commissionPaid", formatter: (v) => v ? "Yes" : "No" },
    { header: "Start Date", key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "placements",
    title: "Placements",
  });

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}

      {/* ─── Compact page header ──────────────────────────────────────── */}
      <DashboardPageHeader
        eyebrow={t("recruitmentControl")}
        title={t("placementTracking")}
        description={t("placementTrackingDescription")}
        summary={{
          label: t("portfolio"),
          value: t("placementsCount", { count: total }),
          note: formatCurrencyBreakdown(salaryByCurrency, t),
        }}
        actions={(
          <Button
            onClick={fetchAiInsights}
            disabled={aiLoading}
            className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {aiLoading ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? t("analyzing") : t("generateInsights")}
          </Button>
        )}
        metrics={[
          { label: t("totalPlacements"), value: total, note: t("allTime"), icon: Users, iconClassName: "text-status-applied", iconSurfaceClassName: "bg-status-applied-bg dark:bg-sky-950/30" },
          { label: t("pendingVisa"), value: pendingVisa, note: t("awaitingApproval"), icon: Clock, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg dark:bg-amber-950/30" },
          { label: t("unpaidCommission"), value: unpaidCommissions, note: t("needsCollection"), icon: DollarSign, iconClassName: "text-red-500", iconSurfaceClassName: "bg-status-rejected-bg dark:bg-red-950/30" },
          { label: t("totalSalaryValue"), value: formatSalaryValue(totalValue), note: Object.keys(salaryByCurrency).length > 0 ? Object.entries(salaryByCurrency).slice(0, 2).map(([c, v]) => `${formatSalaryValue(v)} ${c}`).join(t("currencyBreakdownSeparator")) : t("noData"), icon: TrendingUp, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg dark:bg-emerald-950/30" },
        ]}
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background/50"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              {showFilters ? t("hideFilters") : t("showFilters")}
              {activeFilterCount > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{t("activeFilters", { count: activeFilterCount })}</Badge>}
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                  {t("clearActiveFilters", { count: activeFilterCount })}
                </Button>
              )}
              <TableToolbar
                onExportCsv={handleExportCsv}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
              />
            </div>
          </>
        )}
      >

        {/* AI Insights inline panel */}
        {aiInsights && (
          <div className="mt-4 rounded-[20px] border border-sky-200/50 bg-sky-50/50 p-4 dark:border-sky-800/30 dark:bg-sky-950/20">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-status-applied dark:text-sky-400" />
              <span className="text-sm font-semibold text-sky-800 dark:text-sky-300">{t("aiPlacementInsights")}</span>
            </div>
            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{aiInsights}</div>
          </div>
        )}

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchPlaceholder")}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SearchableSelect
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "", label: t("allVisaStatuses") },
                  { value: "not_required", label: t("notRequired") },
                  { value: "pending", label: t("pending") },
                  { value: "approved", label: t("approved") },
                  { value: "rejected", label: t("rejected") },
                  { value: "stamped", label: t("stamped") },
                ]}
                value={visaFilter}
                onValueChange={(v) => { setVisaFilter(v); resetPage(); }}
                placeholder={t("allVisaStatuses")}
              />
              <SearchableSelect
                className="h-11 w-full rounded-xl border-border bg-card"
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
                className="h-11 w-full rounded-xl border-border bg-card"
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
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Filter className="h-3.5 w-3.5" />
                {t("advancedFilters")}
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
                <DateTimePicker
                  mode="date"
                  value={dateFrom}
                  onChange={(v) => { setDateFrom(v); resetPage(); }}
                  placeholder={t("from")}
                  className="h-11 rounded-xl border-border bg-card text-sm"
                />
                <DateTimePicker
                  mode="date"
                  value={dateTo}
                  onChange={(v) => { setDateTo(v); resetPage(); }}
                  placeholder={t("to")}
                  className="h-11 rounded-xl border-border bg-card text-sm"
                />
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder={t("minSalaryPlaceholder")}
                    value={salaryMin}
                    onChange={(e) => { setSalaryMin(e.target.value); resetPage(); }}
                    className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                  />
                </div>
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder={t("maxSalaryPlaceholder")}
                    value={salaryMax}
                    onChange={(e) => { setSalaryMax(e.target.value); resetPage(); }}
                    className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </DashboardPageHeader>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {[t("candidate"), t("role"), t("company"), t("agent"), t("salary"), t("visa"), t("commission"), t("date"), ""].map((h, i) => (
                  <TableHead key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
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
                        <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1 h-8 rounded-lg text-xs">
                          {t("clearFilters")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => (
                <TableRow key={p._id} className="group transition-colors">
                  <TableCell className="px-4 py-3">
                    <p className="font-medium">{p.candidateName ?? t("dashSeparator")}</p>
                    <p className="text-xs text-muted-foreground">{p.candidateEmail}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">{p.jobTitle ?? t("dashSeparator")}</TableCell>
                  <TableCell className="px-4 py-3">{p.companyName ?? t("dashSeparator")}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">{p.agentName ?? t("dashSeparator")}</TableCell>
                  <TableCell className="px-4 py-3 font-medium">
                    {p.salary?.toLocaleString()}{" "}
                    <span className="text-xs text-muted-foreground">{p.currency}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {VISA_ICONS[p.visaStatus]}
                      <span className="text-xs capitalize">{p.visaStatus?.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge status={p.commissionPaid ? "paid" : "pending"} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {new Date(p.startDate).toLocaleDateString("en-AE")}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!p.commissionPaid && can("placements", "update") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => markCommission(p._id, true)}
                          className="text-emerald-700 hover:bg-status-selected-bg dark:hover:bg-emerald-950/30"
                        >
                          {t("markPaid")}
                        </Button>
                      )}
                      {can("placements", "update") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditItem(p)}
                          className="text-status-applied hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          title={t("edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can("placements", "delete") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDelete(p._id)}
                          className="text-status-rejected hover:bg-status-rejected-bg dark:hover:bg-red-950/30"
                          title={t("delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/60 px-4 py-4">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      </section>

      <CrudModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t("editPlacement")}
        fields={EDIT_FIELDS}
        initialValues={editItem ? {
          salary: String(editItem.salary ?? ""),
          currency: editItem.currency ?? "AED",
          visaStatus: editItem.visaStatus ?? "",
          notes: editItem.notes ?? "",
        } : {}}
        onSubmit={handleEdit}
      />
    </div>
  );
}
