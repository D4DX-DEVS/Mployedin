"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Plus, Sparkles, Clock3, CheckCircle2, ReceiptText,
  RotateCcw, CalendarDays, ArrowRight, Inbox, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

interface Invoice {
  _id: string;
  invoiceNumber: string;
  category: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  jobId?: { title?: string; _id?: string };
  employerId?: { companyName?: string; _id?: string };
  planName?: string;
  notes?: string;
  description?: string;
  issuedAt: string;
  paidAt?: string;
  createdAt: string;
}

interface Job {
  _id: string;
  title: string;
  employerId: { _id: string; companyName: string } | string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "recruitment", label: "Recruitment" },
  { value: "subscription", label: "Subscription" },
];

export default function AgentInvoicesPage() {
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("recruitment");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<{ draft: number; issued: number; paid: number; void: number; totalAmount: number }>({
    draft: 0, issued: 0, paid: 0, void: 0, totalAmount: 0,
  });
  const [displayCurrency, setDisplayCurrency] = useState("AED");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Fetch platform default currency
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((data) => {
        const dc = data.settings?.defaultCurrency ?? "AED";
        setDisplayCurrency(dc);
        setInvoiceCurrency(dc);
      })
      .catch(() => {});
  }, []);

  // Create invoice dialog
  const [showCreate, setShowCreate] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedEmployerId, setSelectedEmployerId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState(displayCurrency);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error("Failed to load invoices");

      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load invoices";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [status, category, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = "Invoices · MPLOYEDIN"; }, []);

  // Fetch jobs for create dialog
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=200&status=active");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (showCreate) fetchJobs();
  }, [showCreate, fetchJobs]);

  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j._id === selectedJobId);
      if (job) {
        const empId = typeof job.employerId === "object" ? job.employerId._id : job.employerId;
        setSelectedEmployerId(empId);
      }
    }
  }, [selectedJobId, jobs]);

  const handleCreateInvoice = async () => {
    if (!selectedJobId || !selectedEmployerId || !invoiceAmount) {
      toast.error("Please fill all required fields");
      return;
    }
    setCreating(true);
    try {
      const res = await csrfFetch("/api/invoices/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          employerId: selectedEmployerId,
          amount: Number(invoiceAmount),
          currency: invoiceCurrency,
          notes: invoiceNotes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to create invoice");
      }
      const data = await res.json();
      toast.success(data.message ?? "Invoice created successfully");
      setShowCreate(false);
      setSelectedJobId("");
      setSelectedEmployerId("");
      setInvoiceAmount("");
      setInvoiceNotes("");
      await fetchInvoices();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  };

  const hasActiveFilters = Boolean(status || (category && category !== "recruitment") || dateFrom || dateTo);

  const exportColumns: ExportColumn<Invoice>[] = [
    { header: "Invoice #", key: "invoiceNumber" },
    { header: "Employer", key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: "Job", key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: "Amount", key: "amount", formatter: (v) => String(v ?? 0) },
    { header: "Currency", key: "currency", formatter: (v) => String(v ?? "AED") },
    { header: "Status", key: "status" },
    { header: "Issued", key: "issuedAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "invoices",
    title: "Invoices",
  });

  return (
    <div className="page-container space-y-6">
      <TableToolbar
        title="Invoices"
        description="View and create recruitment invoices for your assigned jobs."
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search invoices…"
        left={(
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Agent workspace
          </div>
        )}
        right={(
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {total.toLocaleString()} invoice{total === 1 ? "" : "s"}
          </div>
        )}
        actions={(
          <Button
            onClick={() => setShowCreate(true)}
            className="h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
        )}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        filterContent={(
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="agent-inv-status" className="sr-only">Filter by status</label>
                <SearchableSelect
                  id="agent-inv-status"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={STATUS_OPTIONS}
                  value={status || "all"}
                  onValueChange={(v) => { setStatus(v === "all" ? "" : v); resetPage(); }}
                  placeholder="All statuses"
                />
              </div>
              <div>
                <label htmlFor="agent-inv-cat" className="sr-only">Filter by category</label>
                <SearchableSelect
                  id="agent-inv-cat"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={CATEGORY_OPTIONS}
                  value={category || "all"}
                  onValueChange={(v) => { setCategory(v === "all" ? "" : v); resetPage(); }}
                  placeholder="All categories"
                />
              </div>
              <div className="flex items-center gap-2 xl:col-span-2">
                <div className="relative flex-1">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" className="h-11 rounded-xl border-border bg-card pl-9 text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); resetPage(); }} aria-label="Date from" />
                </div>
                <span className="text-xs text-muted-foreground">to</span>
                <div className="relative flex-1">
                  <Input type="date" className="h-11 rounded-xl border-border bg-card text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); resetPage(); }} aria-label="Date to" />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatus(""); setCategory("recruitment"); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium">
                <RotateCcw className="mr-2 h-4 w-4" /> Clear filters
              </Button>
            </div>
          </div>
        )}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Issued</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {summary.issued.toLocaleString()}</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><FileText className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Draft</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {summary.draft.toLocaleString()}</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><Clock3 className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Paid</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {summary.paid.toLocaleString()}</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><CheckCircle2 className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {summary.totalAmount.toLocaleString()}</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><ReceiptText className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      {/* Invoice Table */}
      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invoice ledger</p>
          <h3 className="text-lg font-semibold text-foreground">Your invoices</h3>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>Invoice #</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
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
              ) : invoices.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">No invoices yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Create your first recruitment invoice to get started.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : invoices.map((inv) => (
                <TableRow key={inv._id} className="border-border/70">
                  <TableCell><p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p></TableCell>
                  <TableCell><p className="font-medium text-foreground">{inv.employerId?.companyName ?? inv.planName ?? "—"}</p></TableCell>
                  <TableCell><p className="text-sm text-muted-foreground">{inv.jobId?.title ?? "—"}</p></TableCell>
                  <TableCell><p className="font-semibold">{inv.currency} {inv.amount.toLocaleString()}</p></TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(inv.issuedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-4 py-3 sm:px-5">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Create Recruitment Invoice</DialogTitle>
          </DialogHeader>
          <div ref={dialogBodyRef} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="agent-inv-job">Job *</Label>
              <SearchableSelect
                id="agent-inv-job"
                className="w-full"
                container={dialogBodyRef.current}
                options={jobs.map(j => ({
                  value: j._id,
                  label: `${j.title} — ${typeof j.employerId === "object" ? j.employerId.companyName : j.employerId}`,
                }))
                }
                value={selectedJobId}
                onValueChange={setSelectedJobId}
                placeholder="Select a job…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-inv-emp">Employer</Label>
              <Input
                id="agent-inv-emp"
                value={
                  jobs.find(j => j._id === selectedJobId)
                    ? typeof jobs.find(j => j._id === selectedJobId)!.employerId === "object"
                      ? (jobs.find(j => j._id === selectedJobId)!.employerId as { companyName: string }).companyName
                      : selectedEmployerId
                    : ""
                }
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="agent-inv-amt">Amount *</Label>
                <Input id="agent-inv-amt" type="number" min="0.01" step="0.01" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-inv-cur">Currency</Label>
                <SearchableSelect
                  id="agent-inv-cur"
                  options={SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: c.code }))}
                  value={invoiceCurrency}
                  onValueChange={setInvoiceCurrency}
                  container={dialogBodyRef.current}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-inv-notes">Notes</Label>
              <Textarea id="agent-inv-notes" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Optional notes…" rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              Your commission will be auto-calculated based on your commission rate.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={creating || !selectedJobId || !invoiceAmount}>
              {creating ? "Creating…" : "Generate Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
