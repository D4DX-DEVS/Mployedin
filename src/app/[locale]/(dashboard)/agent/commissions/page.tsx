"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, CalendarDays, Clock, DollarSign, Inbox, RotateCcw, Search, SlidersHorizontal, Sparkles, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Commission {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  placementId?: { jobTitle?: string; candidateName?: string };
  createdAt: string;
  paidAt?: string;
}

interface Summary {
  pending: number;
  approved: number;
  paid: number;
  disputed: number;
  currency: string;
}

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "placement", label: "Placement" },
  { value: "override", label: "Override" },
  { value: "bonus", label: "Bonus" },
];

const CURRENCY_OPTIONS = [
  { value: "all", label: "All currencies" },
  { value: "AED", label: "AED" },
  { value: "SAR", label: "SAR" },
  { value: "QAR", label: "QAR" },
  { value: "KWD", label: "KWD" },
  { value: "BHD", label: "BHD" },
  { value: "OMR", label: "OMR" },
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
  { value: "EUR", label: "EUR" },
];

export default function AgentCommissionsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "all" || currencyFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Placement", key: "placementId", formatter: (_v, row) => (row.placementId as { jobTitle?: string })?.jobTitle ?? "" },
    { header: "Candidate", key: "placementId", formatter: (_v, row) => (row.placementId as { candidateName?: string })?.candidateName ?? "" },
    { header: "Type", key: "type" },
    { header: "Amount", key: "amount" },
    { header: "Currency", key: "currency" },
    { header: "Status", key: "status" },
    { header: "Date", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-commissions",
    title: "Agent Commissions",
  });

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filter !== "all") params.set("status", filter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (currencyFilter !== "all") params.set("currency", currencyFilter);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/commissions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.commissions ?? []);
        setSummary(data.summary ?? null);
        pagination.updateTotal(data.total ?? data.pagination?.total ?? data.commissions?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter, currencyFilter, search, dateFrom, dateTo, pagination.page, pagination.limit]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  useEffect(() => { pagination.resetPage(); }, [filter, typeFilter, currencyFilter, search, dateFrom, dateTo]);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 400);
  };

  const clearFilters = () => {
    setFilter("all");
    setTypeFilter("all");
    setCurrencyFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setShowAdvanced(false);
  };

  const statusColor = (status: string) => {
    if (status === "paid") return "text-[hsl(var(--status-selected))]";
    if (status === "approved") return "text-[hsl(var(--status-applied))]";
    if (status === "disputed") return "text-red-600";
    return "text-[hsl(var(--status-shortlisted))]";
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {/* ── Hero ── */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">My Commissions</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Track the earnings created by successful placements and quickly separate pending payouts from already paid commission lines.</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ledger</p><p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} commission records</p><p className="text-xs text-muted-foreground">Financial activity tied to your placement outcomes.</p></div>
        </div>
        {summary && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Pending", value: summary.pending, color: "text-amber-600", tone: "workspace-tone-amber", icon: Clock },
              { label: "Approved", value: summary.approved, color: "text-blue-600", tone: "workspace-tone-sky", icon: TrendingUp },
              { label: "Paid", value: summary.paid, color: "text-green-600", tone: "workspace-tone-emerald", icon: DollarSign },
              { label: "Disputed", value: summary.disputed ?? 0, color: "text-red-600", tone: "workspace-tone-rose", icon: X },
            ].map(({ label, value, color, tone, icon: Icon }) => (
              <div key={label} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className={`mt-3 text-2xl font-semibold tracking-tight ${color}`}>{formatCurrency(value, currencyCode)}</p><p className="mt-1 text-xs text-muted-foreground">Current {label.toLowerCase()} commission value.</p></div><div className={`rounded-2xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Search & Filters ── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter ledger</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search and filter your commissions</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`workspace-muted-pill h-9 rounded-xl px-3 text-xs hover:bg-card ${showAdvanced ? "workspace-tone-sky border-transparent" : ""}`}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Advanced
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="workspace-muted-pill h-9 rounded-xl px-3 text-xs hover:bg-card"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by placement title or candidate name…"
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-11 rounded-xl border-border bg-secondary/65 pl-10 pr-10"
          />
          {search && (
            <button onClick={() => { setSearch(""); const el = document.querySelector<HTMLInputElement>('[placeholder*="placement"]'); if (el) el.value = ""; }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "approved", "paid", "disputed"].map((status) => {
            const isSelected = filter === status;
            return (
              <Button
                key={status}
                onClick={() => setFilter(status)}
                size="sm"
                aria-pressed={isSelected}
                variant="outline"
                className={isSelected
                  ? "workspace-tone-sky h-10 rounded-xl border-transparent px-4 capitalize hover:opacity-90"
                  : "workspace-muted-pill h-10 rounded-xl px-4 capitalize hover:bg-card"
                }
              >
                {status}
              </Button>
            );
          })}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl workspace-subtle-surface p-4">
            <div>
              <label htmlFor="agent-commissions-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Type</label>
              <SearchableSelect
                id="agent-commissions-type"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={TYPE_OPTIONS}
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v)}
                placeholder="All types"
              />
            </div>
            <div>
              <label htmlFor="agent-commissions-currency" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Currency</label>
              <SearchableSelect
                id="agent-commissions-currency"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={CURRENCY_OPTIONS}
                value={currencyFilter}
                onValueChange={(v) => setCurrencyFilter(v)}
                placeholder="All currencies"
              />
            </div>
            <div>
              <label htmlFor="agent-commissions-date-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">From date</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="agent-commissions-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-11 rounded-xl border-border bg-secondary/65 pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="agent-commissions-date-to" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">To date</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="agent-commissions-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-11 rounded-xl border-border bg-secondary/65 pl-10"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Results table ── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review each commission line and its payment state</h2></div><div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{pagination.total} commissions across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mb-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>Placement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : commissions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{hasActiveFilters ? "No commissions match your filters" : "No commissions yet"}</span>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 rounded-xl text-xs">
                        <RotateCcw className="mr-1.5 h-3 w-3" />Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id} className="hover:bg-secondary/50">
                <TableCell>
                  <p className="font-medium text-foreground">{c.placementId?.jobTitle ?? "Placement"}</p>
                  {c.placementId?.candidateName && (
                    <p className="text-xs text-muted-foreground">{c.placementId.candidateName}</p>
                  )}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{c.type?.replace("_", " ")}</TableCell>
                <TableCell className={`font-bold ${statusColor(c.status)}`}>
                  {formatCurrency(c.amount, c.currency || currencyCode)}
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.paidAt ?? c.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
