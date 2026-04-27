"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, CheckCircle2, Coins, ReceiptText, Search, Settings2, SlidersHorizontal, Wallet, X } from "lucide-react";
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
  createdAt: string;
}

export default function SuperAgentCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Override rate settings
  const [overrideRate, setOverrideRate] = useState<number>(0);
  const [savingRate, setSavingRate] = useState(false);
  const [rateMessage, setRateMessage] = useState("");
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

  const saveOverrideRate = async () => {
    setSavingRate(true);
    setRateMessage("");
    try {
      const res = await fetch("/api/super-agent/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideRate }),
      });
      if (res.ok) {
        setRateMessage("Saved ✓");
        setTimeout(() => setRateMessage(""), 2000);
      } else {
        setRateMessage("Failed to save");
      }
    } catch {
      setRateMessage("Network error");
    } finally {
      setSavingRate(false);
    }
  };

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
    { header: "Agent", key: "agentId", formatter: (_v, row) => { const a = row.agentId as { fullName?: string; userId?: { name?: string } }; return a?.fullName ?? a?.userId?.name ?? ""; } },
    { header: "Type", key: "type" },
    { header: "Notes", key: "notes" },
    { header: "Amount", key: "amount" },
    { header: "Currency", key: "currency" },
    { header: "Status", key: "status" },
    { header: "Date", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-commissions",
    title: "Commission Management",
  });

  const kpis = [
    {
      label: "Visible Payouts",
      value: totalAmount > 0 ? formatCurrency(totalAmount, currencyCode) : "—",
      helper: "Commission amount represented in the current results page.",
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Pending",
      value: commissions.filter((commission) => commission.status === "pending").length,
      helper: "Commission entries still waiting for approval review.",
      icon: <ReceiptText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: "Approved",
      value: commissions.filter((commission) => commission.status === "approved").length,
      helper: "Approved entries ready to move into payout confirmation.",
      icon: <CheckCircle2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Override Rate",
      value: `${overrideRate || 0}%`,
      helper: "Current regional override rate pulled from the super-agent profile.",
      icon: <Wallet className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Commission Management"
        description="Review payout records, approve commissions, and maintain the regional override rate from the same modern oversight workspace."
        summaryTitle="Finance lane"
        summaryDescription="Status filters, approval actions, and profile-rate updates still hit the same existing endpoints."
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Controls"
        title="Configure the regional override and filter payout status"
        description="Adjust the commission override rate and move between payout states without changing the current backend behavior."
      >
        {/* Override rate row */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-secondary/50 p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="overrideRate" className="whitespace-nowrap text-sm font-medium text-foreground">
                Commission Override Rate (%)
              </Label>
            </div>
            <Input
              id="overrideRate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={overrideRate}
              onChange={(e) => setOverrideRate(Number(e.target.value))}
              className="h-11 w-28 rounded-xl bg-background/85 text-foreground shadow-none"
            />
            <Button size="sm" onClick={saveOverrideRate} disabled={savingRate} className="h-11 rounded-xl px-4">
              {savingRate ? "Saving..." : "Save"}
            </Button>
            {rateMessage ? <span className="text-xs text-muted-foreground">{rateMessage}</span> : null}
          </div>
        </div>

        {/* Search + Quick Filters row */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by agent name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
              className="h-10 rounded-xl bg-background/85 pl-9 text-sm shadow-none"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); resetPage(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`rounded-xl border-border/70 text-sm ${showAdvanced ? "bg-primary/10 text-primary border-primary/30" : "bg-background/85 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}`}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Filters
              {(typeFilter || currencyFilter || dateFrom || dateTo) && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {[typeFilter, currencyFilter, dateFrom, dateTo].filter(Boolean).length}
                </span>
              )}
            </Button>

            {/* Status pill buttons */}
            {(["", "pending", "approved", "paid", "disputed"] as const).map((s) => (
              <Button
                key={s}
                onClick={() => { setStatusFilter(s); resetPage(); }}
                aria-pressed={statusFilter === s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={statusFilter === s ? "rounded-xl" : "rounded-xl border-border/70 bg-background/85 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}
              >
                {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Advanced filters panel */}
        {showAdvanced && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-4 animate-in slide-in-from-top-1 fade-in duration-200">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); resetPage(); }}>
                <SelectTrigger className="h-9 w-36 rounded-xl bg-background/85 text-sm shadow-none">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="placement">Placement</SelectItem>
                  <SelectItem value="override">Override</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Select value={currencyFilter} onValueChange={(v) => { setCurrencyFilter(v === "all" ? "" : v); resetPage(); }}>
                <SelectTrigger className="h-9 w-32 rounded-xl bg-background/85 text-sm shadow-none">
                  <SelectValue placeholder="All currencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All currencies</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
                className="h-9 w-40 rounded-xl bg-background/85 text-sm shadow-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
                className="h-9 w-40 rounded-xl bg-background/85 text-sm shadow-none"
              />
            </div>

            {(typeFilter || currencyFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTypeFilter("");
                  setCurrencyFilter("");
                  setDateFrom("");
                  setDateTo("");
                  resetPage();
                }}
                className="h-9 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Clear filters
              </Button>
            )}
          </div>
        )}

        <div className="mt-4">
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            className="mb-4"
          />
          <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
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
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                          <Coins className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">No commissions found</p>
                          <p className="mt-1 text-sm text-muted-foreground">Change the status filter or wait for payout records to appear.</p>
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
                          Approve
                        </Button>
                      )}
                      {c.status === "approved" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700" onClick={() => updateStatus(c._id, "paid")}>
                          Mark Paid
                        </Button>
                      )}
                      {c.status === "paid" && <span className="text-xs text-muted-foreground">Paid ✓</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
