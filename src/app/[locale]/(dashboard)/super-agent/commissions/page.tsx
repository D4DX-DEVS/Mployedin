"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, CheckCircle2, Coins, Info, ReceiptText, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
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
      // Record counts across the whole filtered set, not just this page.
      setStatusCounts(data.summary?.counts ?? { pending: 0, approved: 0 });
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [statusFilter, searchQuery, typeFilter, currencyFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const updateStatus = async (id: string, status: string) => {
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
      return;
    }
    fetchCommissions();
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderAgent"), key: "agentId", formatter: (_v, row) => { const a = row.agentId as { fullName?: string; userId?: { name?: string } }; return a?.fullName ?? a?.userId?.name ?? ""; } },
    { header: t("tableHeaderType"), key: "type" },
    { header: t("tableHeaderNotes"), key: "notes" },
    { header: t("tableHeaderAmount"), key: "amount" },
    { header: t("exportHeaderCurrency"), key: "currency" },
    { header: tc("status"), key: "status" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "" },
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
  const kpis = [
    {
      label: t("kpiPending"),
      value: statusCounts.pending ?? 0,
      helper: t("kpiPendingHelper"),
      icon: <ReceiptText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: t("kpiApproved"),
      value: statusCounts.approved ?? 0,
      helper: t("kpiApprovedHelper"),
      icon: <CheckCircle2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
  ];

  return (
    <div className="page-container">
      {/* Hero carries the title and one description. The "Finance lane" summary
          box restated the page's purpose a second time, side by side with the
          description that already said it. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <SuperAgentMetricsGrid items={kpis} />

      {/* No eyebrow/title/description on this section: "CONTROLS / Configure the
          regional override and filter payout status / Adjust the commission
          override rate…" was three lines explaining a search box, some status
          pills and a read-only rate. */}
      <SuperAgentSection title={t("sectionTitle")} className="[&>div:first-child]:sr-only">
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
          className="mb-3"
        />

        {/* Override rate as one compact line, not a bordered panel inside a
            titled section. It is read-only config, so it states the value and
            where it comes from; the ⓘ carries the "contact admin" detail. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{t("overrideRateLabel")}</span>
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
          {showOverrideInfo && (
            <span className="basis-full text-xs text-muted-foreground">{t("contactAdminMessage")}</span>
          )}
        </div>

          <div className="mt-3 overflow-x-auto rounded-3xl border border-border/60">
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
                    {/* Compact: py-16 plus a 56px icon tile gave "No commissions
                        found" about 200px of empty table to sit in. */}
                    <TableCell colSpan={7} className="py-8 text-center">
                      <div className="flex w-full flex-col items-center gap-1 text-center">
                        <Coins className="mb-1 h-5 w-5 text-muted-foreground/60" />
                        <p className="text-sm font-medium text-foreground">{t("emptyStateTitle")}</p>
                        <p className="text-xs text-muted-foreground">{t("emptyStateMessage")}</p>
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
                      <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(c.createdAt))}</TableCell>
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
