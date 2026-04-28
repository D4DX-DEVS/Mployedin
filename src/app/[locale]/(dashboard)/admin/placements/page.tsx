"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Filter, CheckCircle2, Clock, AlertCircle, Pencil,
  Trash2, Inbox, CalendarDays, DollarSign, Sparkles, ChevronDown, ChevronUp, X, RotateCcw,
  Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function formatCurrencyBreakdown(salaryByCurrency: Record<string, number>): string {
  const entries = Object.entries(salaryByCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return "No salary data";
  return entries.map(([cur, val]) => `${val.toLocaleString()} ${cur}`).join(" · ");
}

export default function AdminPlacementsPage() {
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editItem, setEditItem] = useState<Placement | null>(null);

  // AI Insights state
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
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, visaFilter, commissionFilter, currencyFilter, dateFrom, dateTo, salaryMin, salaryMax, limit]);

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
          message: `Analyze the current placement data and provide brief actionable insights. We have ${total} total placements. Salary breakdown: ${formatCurrencyBreakdown(salaryByCurrency)}. Pending visas: ${placements.filter(p => p.visaStatus === "pending").length}. Unpaid commissions: ${placements.filter(p => !p.commissionPaid).length}. Recent placements this page: ${placements.length}. Give 3-4 bullet points with trends, risks, and recommendations. Keep it concise.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data.reply ?? data.message ?? "No insights available.");
      }
    } catch {
      setAiInsights("Unable to generate insights at this time.");
    } finally {
      setAiLoading(false);
    }
  };

  const markCommission = async (id: string, paid: boolean) => {
    await fetch(`/api/placements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPaid: paid }),
    });
    load();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/placements/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, salary: values.salary ? Number(values.salary) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Delete this placement?");
    if (!ok) return;
    await fetch(`/api/placements/${id}`, { method: "DELETE" });
    load();
  };

  const EDIT_FIELDS: CrudField[] = [
    { name: "salary", label: "Salary", type: "number" },
    { name: "currency", label: "Currency", type: "select", options: [
      { value: "AED", label: "AED" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "SAR", label: "SAR" }
    ]},
    { name: "visaStatus", label: "Visa Status", type: "select", options: [
      { value: "not_required", label: "Not Required" }, { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "stamped", label: "Stamped" }
    ]},
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const pendingVisa = placements.filter(p => p.visaStatus === "pending").length;
  const unpaidCommissions = placements.filter(p => !p.commissionPaid).length;

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
    <div className="page-container space-y-4">
      {ConfirmDialogNode}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Placements", value: total, color: "text-foreground" },
          { label: "Pending Visa", value: pendingVisa, color: "text-amber-600" },
          { label: "Unpaid Commission", value: unpaidCommissions, color: "text-red-500" },
          { label: "Total Salary Value", value: formatSalaryValue(totalValue), color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="card-base text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            {i === 3 && Object.keys(salaryByCurrency).length > 1 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {Object.entries(salaryByCurrency).map(([cur, val]) => `${formatSalaryValue(val)} ${cur}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* AI Insights Panel */}
      <div className="card-base">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium">AI Placement Insights</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAiInsights} disabled={aiLoading}>
            {aiLoading ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {aiLoading ? "Analyzing…" : "Generate Insights"}
          </Button>
        </div>
        {aiInsights && (
          <div className="mt-3 text-sm text-muted-foreground whitespace-pre-line border-t pt-3">
            {aiInsights}
          </div>
        )}
      </div>

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Placement Tracking</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{total} placements · {formatCurrencyBreakdown(salaryByCurrency)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search candidate or company…"
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <select value={visaFilter} onChange={e => { setVisaFilter(e.target.value); resetPage(); }} className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs">
              <option value="">All Visa</option>
              <option value="not_required">Not Required</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="stamped">Stamped</option>
            </select>
            <select value={commissionFilter} onChange={e => { setCommissionFilter(e.target.value); resetPage(); }} className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs">
              <option value="">All Commission</option>
              <option value="true">Paid</option>
              <option value="false">Unpaid</option>
            </select>
            <select value={currencyFilter} onChange={e => { setCurrencyFilter(e.target.value); resetPage(); }} className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs">
              <option value="">All Currencies</option>
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="SAR">SAR</option>
            </select>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="h-8 rounded-lg text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 rounded-lg text-xs text-red-500 hover:text-red-600">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Advanced Filters Row */}
        {showAdvanced && (
          <div className="flex flex-wrap gap-3 items-end border-b border-border/80 px-5 py-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Date From
              </label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage(); }} className="h-8 w-40 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Date To
              </label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage(); }} className="h-8 w-40 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Min Salary
              </label>
              <Input type="number" placeholder="0" value={salaryMin} onChange={e => { setSalaryMin(e.target.value); resetPage(); }} className="h-8 w-28 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Max Salary
              </label>
              <Input type="number" placeholder="∞" value={salaryMax} onChange={e => { setSalaryMax(e.target.value); resetPage(); }} className="h-8 w-28 text-xs" />
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {["Candidate", "Role", "Company", "Agent", "Salary", "Visa", "Commission", "Date", ""].map((h, i) => (
                <TableHead key={i}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : placements.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No placements found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id}>
                <TableCell>
                  <p className="font-medium">{p.candidateName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{p.candidateEmail}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.jobTitle ?? "—"}</TableCell>
                <TableCell>{p.companyName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.agentName ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  {p.salary?.toLocaleString()} <span className="text-xs text-muted-foreground">{p.currency}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {VISA_ICONS[p.visaStatus]}
                    <span className="text-xs capitalize">{p.visaStatus?.replace("_", " ")}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.commissionPaid ? "paid" : "pending"} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(p.startDate).toLocaleDateString("en-AE")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!p.commissionPaid && can("placements", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => markCommission(p._id, true)}
                        className="text-emerald-700 hover:bg-emerald-50">
                        Mark Paid
                      </Button>
                    )}
                    {can("placements", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => setEditItem(p)} className="text-blue-600 hover:bg-blue-50" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {can("placements", "delete") && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(p._id)} className="text-red-600 hover:bg-red-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
