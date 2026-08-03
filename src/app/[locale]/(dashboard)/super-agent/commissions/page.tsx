"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, CheckCircle2, Coins, Info, ReceiptText, Search, Settings2, SlidersHorizontal, Wallet, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
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
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showOverrideInfo, setShowOverrideInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (typeFilter) params.set("type", typeFilter);
    if (currencyFilter) params.set("currency", currencyFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/commissions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCommissions(data.items ?? data.commissions ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [statusFilter, searchQuery, typeFilter, currencyFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/commissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchCommissions();
  };

  const totalAmount = commissions.reduce((sum, commission) => sum + (commission.amount ?? 0), 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderAgent"), key: "agentId", formatter: (_v, row) => { const a = row.agentId as { fullName?: string; userId?: { name?: string } }; return a?.fullName ?? a?.userId?.name ?? ""; } },
    { header: t("tableHeaderType"), key: "type" },
    { header: t("tableHeaderNotes"), key: "notes" },
    { header: t("tableHeaderAmount"), key: "amount" },
    { header: t("exportHeaderCurrency"), key: "currency" },
    { header: tc("status"), key: "status" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-commissions",
    title: t("pageTitle"),
  });

  const kpis = [
    {
      label: t("kpiVisiblePayouts"),
      value: totalAmount > 0 ? formatCurrency(totalAmount, currencyCode) : "—",
      helper: t("kpiVisiblePayoutsHelper"),
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: t("kpiPending"),
      value: commissions.filter((commission) => commission.status === "pending").length,
      helper: t("kpiPendingHelper"),
      icon: <ReceiptText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: t("kpiApproved"),
      value: commissions.filter((commission) => commission.status === "approved").length,
      helper: t("kpiApprovedHelper"),
      icon: <CheckCircle2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: t("kpiOverrideRate"),
      value: `${overrideRate || 0}%`,
      helper: t("kpiOverrideRateHelper"),
      icon: <Wallet className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
  ];

  return (
    <div className="page-container space-y-3 sm:space-y-4">
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
        {/* Override rate row — read-only, set by admin. On phones this collapses
            to one short line (label + rate + ⓘ); the "set by admin" note and the
            contact-admin sentence only appear when the ⓘ is tapped. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-secondary/50 p-2.5 sm:gap-3 sm:rounded-2xl sm:p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Label className="whitespace-nowrap text-xs font-medium text-foreground sm:text-sm">
                {t("overrideRateLabel")}
              </Label>
            </div>
            <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 sm:h-11 sm:rounded-xl sm:px-4">
              <span className="text-sm font-semibold text-foreground sm:text-lg">{overrideRate}%</span>
              <span className="ml-2 hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">{t("setByAdmin")}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowOverrideInfo((v) => !v)}
              aria-expanded={showOverrideInfo}
              aria-label={t("contactAdminMessage")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            >
              <Info className="h-4 w-4" />
            </button>
            <p className={`${showOverrideInfo ? "block" : "hidden"} basis-full text-xs text-muted-foreground sm:block sm:basis-auto`}>
              {t("setByAdmin")} — {t("contactAdminMessage")}
            </p>
          </div>
        </div>

        {/* Search + Quick Filters + Advanced row */}
        <TableToolbar
          search={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); resetPage(); }}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={!!(statusFilter || typeFilter || currencyFilter || dateFrom || dateTo)}
          actions={
            <div className="order-last flex w-full flex-wrap items-center gap-1.5 sm:order-none sm:w-auto">
              {(["", "pending", "approved", "paid", "disputed"] as const).map((s) => (
                <Button
                  key={s}
                  onClick={() => { setStatusFilter(s); resetPage(); }}
                  aria-pressed={statusFilter === s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  className={statusFilter === s ? "h-7 shrink-0 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" : "h-7 shrink-0 rounded-lg border-border/70 bg-card px-2 text-xs text-muted-foreground hover:bg-secondary/80 hover:text-foreground sm:h-9 sm:px-3 sm:text-sm"}
                >
                  {s === "" ? tc("all") : t(`status_${s}`)}
                </Button>
              ))}
            </div>
          }
          filterContent={
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("filterTypeLabel")}</Label>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-11 w-36 rounded-xl border-border bg-card text-sm shadow-none">
                    <SelectValue placeholder={t("filterTypeAllTypes")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filterTypeAllTypes")}</SelectItem>
                    <SelectItem value="placement">{t("filterTypePlacement")}</SelectItem>
                    <SelectItem value="override">{t("filterTypeOverride")}</SelectItem>
                    <SelectItem value="bonus">{t("filterTypeBonus")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("filterCurrencyLabel")}</Label>
                <Select value={currencyFilter} onValueChange={(v) => { setCurrencyFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-11 w-32 rounded-xl border-border bg-card text-sm shadow-none">
                    <SelectValue placeholder={t("filterCurrencyAll")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filterCurrencyAll")}</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
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
              {(typeFilter || currencyFilter || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(""); setCurrencyFilter(""); setDateFrom(""); setDateTo(""); resetPage(); }} className="h-11 rounded-xl text-xs text-muted-foreground hover:text-foreground">
                  <X className="mr-1 h-3 w-3" /> {t("clearFilters")}
                </Button>
              )}
            </div>
          }
          className="mt-4 mb-4"
        />
          <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>{t("tableHeaderAgent")}</TableHead>
                  <TableHead>{t("tableHeaderType")}</TableHead>
                  <TableHead>{t("tableHeaderNotes")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderAmount")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead>{tc("date")}</TableHead>
                  <TableHead>{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <div className="flex w-full flex-col items-center gap-3 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                          <Coins className="h-6 w-6" />
                        </div>
                        <div className="w-full">
                          <p className="text-base font-semibold text-foreground">{t("emptyStateTitle")}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{t("emptyStateMessage")}</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : commissions.map((c) => (
                    <TableRow key={c._id} className="bg-transparent">
                    <TableCell>
                        <div className="font-medium text-foreground">{c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.agentId?.userId?.email ?? ""}</div>
                    </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{(c.type ?? "placement").replace(/_/g, " ")}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{c.notes ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-foreground">{formatCurrency(c.amount, c.currency ?? currencyCode)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {c.status === "pending" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={() => updateStatus(c._id, "approved")}>
                          {t("actionApprove")}
                        </Button>
                      )}
                      {c.status === "approved" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700" onClick={() => updateStatus(c._id, "paid")}>
                          {t("actionMarkPaid")}
                        </Button>
                      )}
                      {c.status === "paid" && <span className="text-xs text-muted-foreground">{t("statusPaid")}</span>}
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
