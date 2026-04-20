"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Pencil, Trash2, Sparkles, Clock3, CheckCircle2, WalletCards, ReceiptText, RotateCcw, Search, CalendarDays } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Inbox } from "lucide-react";

interface Commission {
  _id: string;
  agentId?: { fullName?: string; _id?: string };
  amount: number;
  currency?: string;
  status: string;
  type?: string;
  rate?: number;
  notes?: string;
  createdAt: string;
}

const ADD_FIELDS: CrudField[] = [
  { name: "type", label: "Type", type: "select", required: true, options: [
    { value: "placement", label: "Placement" }, { value: "override", label: "Override" }, { value: "bonus", label: "Bonus" }
  ]},
  { name: "amount", label: "Amount", type: "number", required: true },
  { name: "currency", label: "Currency", type: "select", options: [
    { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
  ]},
  { name: "rate", label: "Rate (%)", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "disputed", label: "Disputed" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "placement", label: "Placement" },
  { value: "override", label: "Override" },
  { value: "bonus", label: "Bonus" },
];

export default function AdminCommissionsPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<{ pending: number; approved: number; paid: number; currency: string }>({ pending: 0, approved: 0, paid: 0, currency: "AED" });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Commission | null>(null);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (typeFilter) params.set("type", typeFilter);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/commissions?${params}`);
      if (!res.ok) {
        throw new Error("Failed to load commissions. Please try again.");
      }

      const data = await res.json();
      setCommissions(data.items ?? data.commissions ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
      if (data.summary) setSummary(data.summary);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load commissions. Please try again.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [status, typeFilter, searchTerm, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  useEffect(() => { document.title = "Commissions · MPLOYEDIN"; }, []);

  const handleCreate = async (values: Record<string, string>) => {
    const res = await csrfFetch("/api/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    await fetchCommissions();
  };

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) {
      throw new Error("No commission selected for editing");
    }

    const res = await csrfFetch(`/api/commissions/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    await fetchCommissions();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Delete this commission?");
    if (!ok) return;

    try {
      const res = await csrfFetch(`/api/commissions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? "Failed to delete commission");
      }

      toast.success("Commission deleted");
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete commission");
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const successMessage = newStatus === "approved" ? "Commission approved" : "Commission marked as paid";

    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? "Failed to update commission status");
      }

      toast.success(successMessage);
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update commission status");
    }
  };

  const visibleCommissions = commissions.length;
  const pendingAmount = summary.pending;
  const approvedAmount = summary.approved;
  const paidAmount = summary.paid;
  const summaryCurrency = summary.currency;
  const hasActiveFilters = Boolean(status || typeFilter || searchTerm || dateFrom || dateTo);

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Finance workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Commissions
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Track agent commission records, clear pending approvals, and keep payout operations inside the same polished admin workspace used across recruiting.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} commission records</p>
              <p className="text-xs text-muted-foreground">Across {totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"} in the current query.</p>
            </div>

            {can("commissions", "create") ? (
              <Button
                onClick={() => setShowAdd(true)}
                className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                Add Commission
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Visible records</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{visibleCommissions}</p>
                <p className="mt-1 text-xs text-muted-foreground">Commission records loaded on the current page.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <WalletCards className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending review</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-500 dark:text-amber-300">{summaryCurrency} {pendingAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total amount waiting for approval.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Approved</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-300">{summaryCurrency} {approvedAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total approved amount ready for payout.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Paid out</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-violet-600 dark:text-violet-300">{summaryCurrency} {paidAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total paid commission amount.</p>
              </div>
              <div className="workspace-tone-violet rounded-2xl p-2.5">
                <ReceiptText className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse records</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter the commissions you want to review next</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use filters to narrow approvals, payouts, and completed records without leaving the finance workspace.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="admin-commissions-search" className="sr-only">Search by agent name</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-commissions-search"
                className="h-11 rounded-xl border-border bg-secondary/65 pl-9"
                placeholder="Search agent…"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); resetPage(); }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-commissions-status-filter" className="sr-only">Filter commissions by status</label>
            <SearchableSelect
              id="admin-commissions-status-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={STATUS_OPTIONS}
              value={status || "all"}
              onValueChange={(value) => {
                setStatus(value === "all" ? "" : value);
                resetPage();
              }}
              placeholder="All statuses"
            />
          </div>

          <div>
            <label htmlFor="admin-commissions-type-filter" className="sr-only">Filter commissions by type</label>
            <SearchableSelect
              id="admin-commissions-type-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={TYPE_OPTIONS}
              value={typeFilter || "all"}
              onValueChange={(value) => {
                setTypeFilter(value === "all" ? "" : value);
                resetPage();
              }}
              placeholder="All types"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
                aria-label="Date from"
              />
            </div>
            <span className="text-xs text-muted-foreground">to</span>
            <div className="relative flex-1">
              <Input
                type="date"
                className="h-11 rounded-xl border-border bg-secondary/65 text-sm"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
                aria-label="Date to"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStatus("");
              setTypeFilter("");
              setSearchTerm("");
              setDateFrom("");
              setDateTo("");
              resetPage();
            }}
            disabled={!hasActiveFilters}
            className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Commission ledger</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-foreground">Review and action agent payouts</h3>
            <p className="text-sm text-muted-foreground">Showing {visibleCommissions.toLocaleString()} record{visibleCommissions === 1 ? "" : "s"} on this page.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : commissions.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="workspace-muted-pill rounded-[20px] p-3">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">No commissions found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Adjust filters or create a new commission record to populate this ledger.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : commissions.map((c) => (
                <TableRow key={c._id} className="border-border/70">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{c.agentId?.fullName ?? "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Commission record</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-2.5 py-1 text-xs font-medium capitalize text-foreground">
                      {c.type ?? "placement"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-foreground">{c.currency ?? "USD"} {c.amount.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.rate ? `${c.rate}% rate` : "Rate not set"}</p>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {can("commissions", "approve") && c.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => updateStatus(c._id, "approved")}
                          className="text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Approve
                        </Button>
                      )}
                      {can("commissions", "approve") && c.status === "approved" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => updateStatus(c._id, "paid")}
                          className="text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                        >
                          Mark Paid
                        </Button>
                      )}
                      {can("commissions", "update") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditItem(c)}
                          title="Edit"
                          aria-label={`Edit commission for ${c.agentId?.fullName ?? "agent"}`}
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("commissions", "delete") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDelete(c._id)}
                          title="Delete"
                          aria-label={`Delete commission for ${c.agentId?.fullName ?? "agent"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-4 py-3 sm:px-5">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Commission" fields={ADD_FIELDS} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Commission" fields={ADD_FIELDS}
        initialValues={editItem ? { type: editItem.type ?? "placement", amount: String(editItem.amount), currency: editItem.currency ?? "AED", rate: String(editItem.rate ?? ""), notes: editItem.notes ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
