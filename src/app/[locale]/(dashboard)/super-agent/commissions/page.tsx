"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, CheckCircle2, Coins, Info, Mail, ReceiptText, Settings2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { InlinePicker } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";

interface Commission {
  _id: string;
  agentId?: { fullName?: string; userId?: { name?: string; email?: string } };
  type?: string;
  amount: number;
  currency?: string;
  status: string;
  notes?: string;
  disputeReason?: string;
  clawbackAmount?: number;
  clawbackReason?: string;
  createdAt: string;
}

export default function SuperAgentCommissionsPage() {
  const t = useTranslations("superAgentCommissions");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const [commissions, setCommissions] = useState<Commission[]>([]);
  // Per-status record counts over the whole filtered set (from the API's
  // aggregate), so the KPI tiles don't describe only the visible page.
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showOverrideInfo, setShowOverrideInfo] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [statusFilter, setStatusFilterState] = useUrlFilter("status", "");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Override rate display (read-only, set by admin)
  const [overrideRate, setOverrideRate] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile?.overrideRate != null) {
          setOverrideRate(data.profile.overrideRate);
        }
        if (data?.profile?.currencyCode) {
          setCurrencyCode(data.profile.currencyCode);
        }
      })
      .catch(() => {});
  }, []);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (typeFilter) params.set("type", typeFilter);
    if (currencyFilter) params.set("currency", currencyFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const res = await fetch(`/api/commissions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.items ?? data.commissions ?? []);
        // Record counts across the whole filtered set, not just this page.
        setStatusCounts(data.summary?.counts ?? { pending: 0, approved: 0 });
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, typeFilter, currencyFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    const res = await fetch(`/api/commissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // Was unchecked: the permission guard rejected every status change and the row
    // simply re-rendered unchanged, so an approval that never happened looked done.
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error ?? t("statusUpdateFailed"));
    }
    setUpdatingId(null);
    fetchCommissions();
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderAgent"), key: "agentId", formatter: (_v, row) => { const a = row.agentId as { fullName?: string; userId?: { name?: string } }; return a?.fullName ?? a?.userId?.name ?? ""; } },
    { header: t("tableHeaderType"), key: "type" },
    { header: t("tableHeaderNotes"), key: "notes" },
    { header: t("tableHeaderAmount"), key: "amount" },
    { header: t("exportHeaderCurrency"), key: "currency" },
    { header: tc("status"), key: "status" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-commissions",
    title: t("pageTitle"),
  });

  // Two tiles, both real counts over the whole filtered set.
  // Dropped "Visible payouts" — its own helper admitted it described "the
  // current results page", and it rendered as "—" whenever the page was empty,
  // which read as unfinished UI. Dropped "Override rate" too: it is a config
  // value, not a payout metric, and it is already stated in the row below.
  // Header strip, not a separate card grid: every other super-agent page states
  // its figures inside the hero, and two full-height cards for two counts was
  // the loudest thing on the page.
  const kpis = [
    { label: t("kpiPending"), value: statusCounts.pending ?? 0, note: t("kpiPendingHelper"), icon: ReceiptText },
    { label: t("kpiApproved"), value: statusCounts.approved ?? 0, note: t("kpiApprovedHelper"), icon: CheckCircle2 },
  ];

  // Shared by the inline bar and the phone filter sheet.
  const statusPills = ["", "pending", "approved", "paid", "disputed", "clawed_back"] as const;
  const typeOptions = [
    { value: "all", label: t("filterTypeAllTypes") },
    { value: "placement", label: t("filterTypePlacement") },
    { value: "override", label: t("filterTypeOverride") },
    { value: "bonus", label: t("filterTypeBonus") },
  ];
  const currencyOptions = [
    { value: "all", label: t("filterCurrencyAll") },
    ...["AED", "USD", "EUR", "SAR", "INR"].map((c) => ({ value: c, label: c })),
  ];
  const clearAllFilters = () => { setStatusFilterState(""); setTypeFilter(""); setCurrencyFilter(""); setDateFrom(""); setDateTo(""); resetPage(); };
  const phoneFilterCount = [statusFilter, typeFilter, currencyFilter, dateFrom, dateTo].filter(Boolean).length;
  const renderStatusPills = () => statusPills.map((s) => (
    <Button
      key={s}
      onClick={() => { setStatusFilterState(s); resetPage(); }}
      aria-pressed={statusFilter === s}
      variant={statusFilter === s ? "default" : "outline"}
      size="sm"
      className={statusFilter === s ? "h-9 shrink-0 rounded-lg px-2 text-xs sm:px-3 sm:text-sm" : "h-9 shrink-0 rounded-lg border-border/70 bg-card px-2 text-xs text-muted-foreground hover:bg-secondary/80 hover:text-foreground sm:px-3 sm:text-sm"}
    >
      {s === "" ? tc("all") : t(`status_${s}`)}
    </Button>
  ));

  return (
    <div className="page-container">
      {/* Hero carries the title and one description. The "Finance lane" summary
          box restated the page's purpose a second time, side by side with the
          description that already said it. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={kpis}
        compactMetrics
      />

      {/* No eyebrow/title/description on this section: "CONTROLS / Configure the
          regional override and filter payout status / Adjust the commission
          override rate…" was three lines explaining a search box, some status
          pills and a read-only rate. */}
      <SuperAgentSection title={t("sectionTitle")} className="[&>div:first-child]:sr-only">
        {/* ---- Error State ---- */}
        {error && <ErrorState onRetry={() => fetchCommissions()} />}

        {/* Search + status pills in plain sight, type/currency/dates behind More */}
        <InlineFilterBar
          className="mb-3"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onClear={(statusFilter || typeFilter || currencyFilter || dateFrom || dateTo) ? clearAllFilters : undefined}
          moreToggleClassName="max-sm:hidden"
          moreClassName="max-sm:hidden"
          more={(
            <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("filterTypeLabel")}</Label>
                  <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); resetPage(); }}>
                    <SelectTrigger className="h-11 w-full sm:w-36 rounded-xl border-border bg-card text-sm shadow-none">
                      <SelectValue placeholder={t("filterTypeAllTypes")} />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("filterCurrencyLabel")}</Label>
                  <Select value={currencyFilter} onValueChange={(v) => { setCurrencyFilter(v === "all" ? "" : v); resetPage(); }}>
                    <SelectTrigger className="h-11 w-full sm:w-32 rounded-xl border-border bg-card text-sm shadow-none">
                      <SelectValue placeholder={t("filterCurrencyAll")} />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {t("filterDateFrom")}</Label>
                  <DateTimePicker mode="date" value={dateFrom} onChange={(v) => { setDateFrom(v); resetPage(); }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {t("filterDateTo")}</Label>
                  <DateTimePicker mode="date" value={dateTo} onChange={(v) => { setDateTo(v); resetPage(); }} />
                </div>
              </div>
            </div>
          )}
          moreActiveCount={[typeFilter, currencyFilter, dateFrom, dateTo].filter(Boolean).length}
        >
          <InlineFilterSearch
            value={searchQuery}
            onChange={(v) => { setSearchQuery(v); resetPage(); }}
            placeholder={t("searchPlaceholder")}
            className="max-sm:basis-0"
          />
          <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
          {/* contents: from sm up these sit in the bar as before; phones use the sheet. */}
          <div className="contents max-sm:hidden">
            {renderStatusPills()}
          </div>
        </InlineFilterBar>

        <PhoneFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          activeCount={phoneFilterCount}
          onClear={clearAllFilters}
        >
          <FilterField label={tc("status")}>
            <div role="group" aria-label={tc("status")} className="flex flex-wrap gap-2">
              {renderStatusPills()}
            </div>
          </FilterField>
          <FilterField label={t("filterTypeLabel")} htmlFor="sa-commissions-sheet-type">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); resetPage(); }}>
              <SelectTrigger id="sa-commissions-sheet-type" className={SHEET_CONTROL}>
                <SelectValue placeholder={t("filterTypeAllTypes")} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("filterCurrencyLabel")} htmlFor="sa-commissions-sheet-currency">
            <Select value={currencyFilter} onValueChange={(v) => { setCurrencyFilter(v === "all" ? "" : v); resetPage(); }}>
              <SelectTrigger id="sa-commissions-sheet-currency" className={SHEET_CONTROL}>
                <SelectValue placeholder={t("filterCurrencyAll")} />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t("filterDateFrom")} htmlFor="sa-commissions-sheet-date-from">
            <DateTimePicker id="sa-commissions-sheet-date-from" mode="date" value={dateFrom} onChange={(v) => { setDateFrom(v); resetPage(); }} className="w-full" />
          </FilterField>
          <FilterField label={t("filterDateTo")} htmlFor="sa-commissions-sheet-date-to">
            <DateTimePicker id="sa-commissions-sheet-date-to" mode="date" value={dateTo} onChange={(v) => { setDateTo(v); resetPage(); }} className="w-full" />
          </FilterField>
        </PhoneFilterSheet>

        {/* Override rate as one compact line, not a bordered panel inside a
            titled section. It is read-only config, so it states the value and
            where it comes from; the ⓘ carries the "contact admin" detail. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{t("overrideRateLabel")}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="font-semibold text-foreground">{overrideRate}%</span>
            <span className="text-muted-foreground">· {t("setByAdmin")}</span>
            <button
              type="button"
              onClick={() => setShowOverrideInfo((v) => !v)}
              aria-expanded={showOverrideInfo}
              aria-label={t("contactAdminMessage")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </span>
          {showOverrideInfo && (
            <span className="basis-full text-xs text-muted-foreground">{t("contactAdminMessage")}</span>
          )}
        </div>

          <PhoneRecordList
            className="sm:hidden"
            label={t("pageTitle")}
            loading={loading}
            empty={<EmptyState title={t("emptyStateTitle")} description={t("emptyStateMessage")} icon={Coins} />}
            items={commissions.map((c) => {
              const agentName = c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—";
              return {
                key: c._id,
                leading: <UserAvatar name={agentName} email={c.agentId?.userId?.email} className="h-10 w-10" colorful />,
                title: agentName,
                subtitle: c.agentId?.userId?.email || undefined,
                trailing: c.status === "pending" ? undefined : <StatusBadge status={c.status} />,
                actions: c.status === "pending" ? (
                  <InlinePicker
                    name={agentName}
                    picker={{
                      label: tc("changeStatus"),
                      value: c.status,
                      options: [
                        { value: "pending", label: t("status_pending") },
                        { value: "approved", label: t("status_approved") },
                        { value: "disputed", label: t("status_disputed") },
                      ],
                      onChange: (next) => { if (next !== "pending") void updateStatus(c._id, next); },
                      display: <StatusBadge status={c.status} />,
                      pending: updatingId === c._id,
                      disabled: updatingId === c._id,
                    }}
                  />
                ) : undefined,
                meta: (
                  <>
                    <p className="flex min-w-0 items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {formatDate(new Date(c.createdAt), { day: "2-digit", month: "short", year: "numeric" })}
                        <span className="capitalize">{` · ${(c.type ?? "placement").replace(/_/g, " ")}`}</span>
                      </span>
                    </p>
                    {c.notes && <p className="truncate">{c.notes}</p>}
                    {c.status === "approved" && <p>{t("awaitingPayout")}</p>}
                  </>
                ),
                stats: [{ label: t("tableHeaderAmount"), value: formatCurrency(c.amount, c.currency ?? currencyCode) }],
              };
            })}
          />

          <div className="overflow-x-auto max-sm:hidden">
            <Table data-mobile-table="scroll">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("tableHeaderAgent")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderAmount")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableHeaderType")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableHeaderNotes")}</TableHead>
                  <TableHead className="hidden md:table-cell">{tc("date")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={5} cols={7} />
                ) : commissions.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12">
                      <EmptyState title={t("emptyStateTitle")} description={t("emptyStateMessage")} icon={Coins} />
                    </TableCell>
                  </TableRow>
                ) : commissions.map((c) => {
                  const agentName = c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—";
                  return (
                    <TableRow key={c._id} className="group">
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={agentName} email={c.agentId?.userId?.email} className="h-9 w-9 shrink-0" colorful />
                          <div className="min-w-0 space-y-1">
                            <p className="truncate font-medium text-foreground">{agentName}</p>
                            {c.agentId?.userId?.email && (
                              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{c.agentId.userId.email}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right font-semibold text-foreground">{formatCurrency(c.amount, c.currency ?? currencyCode)}</TableCell>
                      <TableCell className="hidden md:table-cell capitalize text-muted-foreground">{(c.type ?? "placement").replace(/_/g, " ")}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs truncate text-xs text-muted-foreground">{c.notes ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(new Date(c.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-right">
                        {/* Approve/dispute is the row's status: an inline picker,
                            not a lone Approve button. Paying out stays admin-only. */}
                        {c.status === "pending" ? (
                          <InlinePicker
                            name={agentName}
                            picker={{
                              label: tc("changeStatus"),
                              value: c.status,
                              options: [
                                { value: "pending", label: t("status_pending") },
                                { value: "approved", label: t("status_approved") },
                                { value: "disputed", label: t("status_disputed") },
                              ],
                              onChange: (next) => { if (next !== "pending") void updateStatus(c._id, next); },
                              display: <StatusBadge status={c.status} />,
                              pending: updatingId === c._id,
                              disabled: updatingId === c._id,
                            }}
                          />
                        ) : (
                          <>
                            {/* Paying out is the admin's step (it needs the payment reference); a super agent only approves. */}
                            {c.status === "approved" && <span className="text-xs text-muted-foreground">{t("awaitingPayout")}</span>}
                            {c.status === "paid" && <span className="text-xs text-muted-foreground">{t("statusPaid")}</span>}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

      </SuperAgentSection>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
