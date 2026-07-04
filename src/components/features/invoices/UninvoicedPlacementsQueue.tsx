"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { csrfFetch } from "@/lib/security/csrf-client";
import { INTERNATIONAL_TAX_PRESETS } from "@/lib/invoices/taxPresets";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckSquare, Square, FileText, Zap, Loader2, Search,
  Users, Building2, Briefcase, Receipt, AlertTriangle,
  ChevronDown, ChevronUp, Globe, Calculator,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface UninvoicedPlacement {
  _id: string;
  placedAt: string;
  startDate?: string;
  salary: number;
  currency: string;
  jobId: string | null;
  jobTitle: string;
  jobSalary?: number;
  jobCurrency?: string;
  employerId: string | null;
  employerName: string;
  employerEmail?: string;
  employerCountry?: string;
  employerTaxId?: string;
  candidateName: string;
  candidateEmail?: string;
  agentId: string | null;
  agentName: string;
  agentRate: number;
  superAgentId: string | null;
  superAgentName: string | null;
  superAgentRate: number;
  visaStatus: string;
}

interface BulkResult {
  placementId: string;
  status: "created" | "skipped" | "error";
  invoiceNumber?: string;
  invoiceId?: string;
  reason?: string;
  totalAmount?: number;
}

interface BulkResponse {
  results: BulkResult[];
  summary: { created: number; skipped: number; errors: number; total: number };
  message: string;
}

interface UninvoicedPlacementsQueueProps {
  onInvoicesCreated: () => void;
  defaultCurrency: string;
}

const TAX_TYPE_OPTIONS = [
  { value: "none", label: "No Tax" },
  { value: "vat", label: "VAT" },
  { value: "gst", label: "GST" },
  { value: "reverse_charge", label: "Reverse Charge" },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "immediate", label: "Immediate" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

const STATUS_OPTIONS = [
  { value: "issued", label: "Issue Immediately" },
  { value: "draft", label: "Save as Draft" },
];

// ── Component ────────────────────────────────────────────────────────────────
export function UninvoicedPlacementsQueue({ onInvoicesCreated, defaultCurrency }: UninvoicedPlacementsQueueProps) {
  const t = useTranslations("uninvoicedPlacementsQueue");
  const tCommon = useTranslations("common");
  const [placements, setPlacements] = useState<UninvoicedPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk generation modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTaxType, setBulkTaxType] = useState("none");
  const [bulkTaxPercent, setBulkTaxPercent] = useState(0);
  const [bulkAutoDetectTax, setBulkAutoDetectTax] = useState(true);
  const [bulkPaymentTerms, setBulkPaymentTerms] = useState("net_30");
  const [bulkStatus, setBulkStatus] = useState("issued");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResponse | null>(null);

  // Quick generate (single)
  const [quickGenerating, setQuickGenerating] = useState<string | null>(null);

  // Expanded rows for mobile/detail view
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/invoices/uninvoiced-placements?${params}`);
      if (!res.ok) throw new Error("Failed to load uninvoiced placements");
      const data = await res.json();
      setPlacements(data.placements ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === placements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(placements.map((p) => p._id)));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Quick generate single invoice
  const handleQuickGenerate = async (placement: UninvoicedPlacement) => {
    setQuickGenerating(placement._id);
    try {
      const res = await csrfFetch("/api/invoices/recruitment/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placementIds: [placement._id],
          autoDetectTax: true,
          paymentTerms: "net_30",
          status: "issued",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }

      const data: BulkResponse = await res.json();
      const result = data.results[0];

      if (result?.status === "created") {
        toast.success(`Invoice ${result.invoiceNumber} created for ${placement.employerName}`);
        onInvoicesCreated();
        fetchPlacements();
      } else {
        toast.error(result?.reason ?? "Failed to generate invoice");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setQuickGenerating(null);
    }
  };

  // Bulk generate
  const handleBulkGenerate = async () => {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    setBulkResults(null);
    try {
      const res = await csrfFetch("/api/invoices/recruitment/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placementIds: Array.from(selected),
          taxType: bulkAutoDetectTax ? "none" : bulkTaxType,
          taxPercent: bulkAutoDetectTax ? 0 : bulkTaxPercent,
          autoDetectTax: bulkAutoDetectTax,
          paymentTerms: bulkPaymentTerms,
          status: bulkStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Bulk generation failed");
      }

      const data: BulkResponse = await res.json();
      setBulkResults(data);

      if (data.summary.created > 0) {
        toast.success(data.message);
        onInvoicesCreated();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk generation failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkResults(null);
    setSelected(new Set());
    fetchPlacements();
  };

  // Compute selected totals for preview
  const selectedPlacements = placements.filter((p) => selected.has(p._id));
  const selectedTotal = selectedPlacements.reduce((sum, p) => sum + (p.salary ?? 0), 0);
  const selectedCountries = [...new Set(selectedPlacements.map((p) => p.employerCountry).filter(Boolean))];

  // Get tax info for display
  const getTaxInfo = (country?: string) => {
    if (!country) return null;
    return INTERNATIONAL_TAX_PRESETS.find(
      (t) => t.countryCode.toUpperCase() === country.toUpperCase() ||
             t.country.toUpperCase() === country.toUpperCase()
    );
  };

  const fmt = (amount: number, cur?: string) =>
    `${cur ?? defaultCurrency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("uninvoicedPlacements")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("placementsPending", { count: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-48 rounded-lg pl-8 text-sm"
              placeholder={t("searchPlacements")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {selected.size > 0 && (
            <Button
              onClick={() => setShowBulkModal(true)}
              className="h-9 gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Receipt className="h-4 w-4" />
              {t("generateInvoices", { count: selected.size })}
            </Button>
          )}
        </div>
      </div>

      {/* Summary bar when items selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckSquare className="h-4 w-4" />
            {t("selected", { count: selected.size })}
          </div>
          <div className="h-4 w-px bg-emerald-300 dark:bg-emerald-700" />
          <div className="text-sm text-emerald-600 dark:text-emerald-400">
            {t("estTotal")}: <span className="font-semibold">{fmt(selectedTotal)}</span>
          </div>
          {selectedCountries.length > 0 && (
            <>
              <div className="h-4 w-px bg-emerald-300 dark:bg-emerald-700" />
              <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Globe className="h-3.5 w-3.5" />
                {selectedCountries.join(", ")}
              </div>
            </>
          )}
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="h-7 text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
              {tCommon("delete")}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/60 hover:bg-secondary/60">
                <TableHead className="w-12">
                  <button onClick={toggleSelectAll} className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary">
                    {selected.size === placements.length && placements.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="min-w-[130px]">{t("job")}</TableHead>
                <TableHead className="min-w-[120px]">{t("employer")}</TableHead>
                <TableHead>{t("candidate")}</TableHead>
                <TableHead>{t("agent")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{t("taxRegion")}</TableHead>
                <TableHead>{t("commission")}</TableHead>
                <TableHead>{t("visa")}</TableHead>
                <TableHead className="text-right">{t("quickAction")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : placements.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={10} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-[20px] bg-emerald-50 p-3 dark:bg-emerald-950/30">
                        <FileText className="h-6 w-6 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t("allPlacementsInvoiced")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("noPendingPlacements")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => {
                const isSelected = selected.has(p._id);
                const isExpanded = expandedRows.has(p._id);
                const taxInfo = getTaxInfo(p.employerCountry);
                const estTax = taxInfo ? Math.round(p.salary * taxInfo.defaultRate / 100) : 0;
                const estTotal = p.salary + estTax;

                return (
                  <Fragment key={p._id}>
                    <TableRow
                      className={`border-border/70 cursor-pointer transition-colors ${isSelected ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "hover:bg-secondary/30"}`}
                      onClick={() => toggleSelect(p._id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(p._id)} className="flex h-5 w-5 items-center justify-center rounded">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.jobTitle}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t("placedDate")} {new Date(p.placedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{p.employerName}</p>
                          {p.employerCountry && (
                            <p className="text-[10px] text-muted-foreground">{p.employerCountry}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{p.candidateName}</p>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium">{p.agentName}</p>
                          {p.superAgentName && (
                            <p className="text-muted-foreground">SA: {p.superAgentName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="text-sm font-semibold">{fmt(p.salary, p.currency)}</p>
                          {taxInfo && taxInfo.defaultRate > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              +{taxInfo.label}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {taxInfo ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            taxInfo.taxType === "vat" ? "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300" :
                            taxInfo.taxType === "gst" ? "border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300" :
                            taxInfo.taxType === "reverse_charge" ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300" :
                            "border border-border bg-secondary text-muted-foreground"
                          }`}>
                            {taxInfo.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {p.agentRate > 0 && (
                            <p className="text-sky-600">A: {p.agentRate}%</p>
                          )}
                          {p.superAgentRate > 0 && (
                            <p className="text-indigo-600">SA: {p.superAgentRate}%</p>
                          )}
                          {p.agentRate === 0 && p.superAgentRate === 0 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.visaStatus} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleQuickGenerate(p)}
                            disabled={quickGenerating === p._id}
                            className="h-7 gap-1 px-2 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            {quickGenerating === p._id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Quick
                          </Button>
                          <button
                            onClick={() => toggleExpand(p._id)}
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded detail row */}
                    {isExpanded && (
                      <TableRow key={`${p._id}-detail`} className="border-border/70 bg-secondary/20 hover:bg-secondary/20">
                        <TableCell colSpan={10}>
                          <div className="grid gap-4 py-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-border/70 bg-card p-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("invoicePreview")}
                              </p>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span>{t("subtotal")}</span>
                                  <span className="font-medium">{fmt(p.salary, p.currency)}</span>
                                </div>
                                {taxInfo && taxInfo.defaultRate > 0 && (
                                  <div className="flex justify-between text-amber-600">
                                    <span>{taxInfo.taxType.toUpperCase()} ({taxInfo.defaultRate}%)</span>
                                    <span>{fmt(estTax, p.currency)}</span>
                                  </div>
                                )}
                                <div className="border-t border-border/70 pt-1" />
                                <div className="flex justify-between font-bold">
                                  <span>{t("estTotal")}</span>
                                  <span className="text-primary">{fmt(estTotal, p.currency)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-card p-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("commissionSplit")}
                              </p>
                              <div className="space-y-1 text-xs">
                                {p.agentRate > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-sky-600">Agent ({p.agentRate}%)</span>
                                    <span className="font-medium text-sky-600">{fmt(Math.round(estTotal * p.agentRate / 100), p.currency)}</span>
                                  </div>
                                )}
                                {p.superAgentRate > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-indigo-600">Super Agent ({p.superAgentRate}%)</span>
                                    <span className="font-medium text-indigo-600">{fmt(Math.round(estTotal * p.superAgentRate / 100), p.currency)}</span>
                                  </div>
                                )}
                                <div className="border-t border-border/70 pt-1" />
                                <div className="flex justify-between font-medium text-emerald-600">
                                  <span>{t("companyNet")}</span>
                                  <span>{fmt(Math.round(estTotal * (100 - p.agentRate - p.superAgentRate) / 100), p.currency)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-card p-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("employerBilling")}
                              </p>
                              <div className="space-y-1 text-xs">
                                <p className="font-medium">{p.employerName}</p>
                                {p.employerEmail && <p className="text-muted-foreground">{p.employerEmail}</p>}
                                {p.employerCountry && <p className="text-muted-foreground">{p.employerCountry}</p>}
                                {p.employerTaxId && <p className="text-muted-foreground">Tax ID: {p.employerTaxId}</p>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-4 py-3">
          <PaginationControls
            page={page}
            totalPages={Math.ceil(total / limit)}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      </section>

      {/* Bulk Generate Modal */}
      <Dialog open={showBulkModal} onOpenChange={(v) => { if (!v) closeBulkModal(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              {t("bulkInvoiceGeneration")}
            </DialogTitle>
            <DialogDescription>
              {t("generateInvoicesDesc", { count: selected.size })}
            </DialogDescription>
          </DialogHeader>

          {!bulkResults ? (
            <div className="space-y-4">
              {/* Preview summary */}
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{selected.size}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("invoices")}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{fmt(selectedTotal)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("estSubtotal")}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{selectedCountries.length}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("countries")}</p>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-foreground">{t("taxHandling")}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => setBulkAutoDetectTax(!bulkAutoDetectTax)}
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        bulkAutoDetectTax ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-card"
                      }`}
                    >
                      {bulkAutoDetectTax && <span className="text-xs">✓</span>}
                    </button>
                    <span className="text-sm text-muted-foreground">{t("autoDetectByCountry")}</span>
                  </div>
                  {!bulkAutoDetectTax && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <SearchableSelect
                        id="bulk-tax-type"
                        className="h-9 w-full rounded-lg border-border bg-card text-sm"
                        options={TAX_TYPE_OPTIONS}
                        value={bulkTaxType}
                        onValueChange={setBulkTaxType}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="h-9 rounded-lg text-sm"
                        placeholder="Tax %"
                        value={bulkTaxPercent}
                        onChange={(e) => setBulkTaxPercent(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">{t("paymentTerms")}</label>
                  <SearchableSelect
                    id="bulk-payment-terms"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card text-sm"
                    options={PAYMENT_TERMS_OPTIONS}
                    value={bulkPaymentTerms}
                    onValueChange={setBulkPaymentTerms}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-foreground">{t("invoiceStatus")}</label>
                  <SearchableSelect
                    id="bulk-status"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card text-sm"
                    options={STATUS_OPTIONS}
                    value={bulkStatus}
                    onValueChange={setBulkStatus}
                  />
                </div>
              </div>

              {/* Selected placements preview */}
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-secondary/50">
                      <th className="px-3 py-1.5 text-left font-semibold">{t("job")}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("employer")}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">{t("amount")}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("tax")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlacements.map((p) => {
                      const tax = getTaxInfo(p.employerCountry);
                      return (
                        <tr key={p._id} className="border-b border-border/50">
                          <td className="px-3 py-1.5">{p.jobTitle}</td>
                          <td className="px-3 py-1.5">{p.employerName}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmt(p.salary, p.currency)}</td>
                          <td className="px-3 py-1.5">{tax ? tax.label : "No tax"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeBulkModal} className="h-9 rounded-lg">
                  {tCommon("cancel")}
                </Button>
                <Button
                  onClick={handleBulkGenerate}
                  disabled={bulkProcessing}
                  className="h-9 gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                >
                  {bulkProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("processing")}</>
                  ) : (
                    <><Receipt className="h-4 w-4" /> {t("generateInvoices", { count: selected.size })}</>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* Results View */
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <p className="text-2xl font-bold text-emerald-600">{bulkResults.summary.created}</p>
                  <p className="text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-400">{t("created")}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-2xl font-bold text-amber-600">{bulkResults.summary.skipped}</p>
                  <p className="text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">{t("skipped")}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
                  <p className="text-2xl font-bold text-rose-600">{bulkResults.summary.errors}</p>
                  <p className="text-[10px] font-medium uppercase text-rose-700 dark:text-rose-400">{t("errors")}</p>
                </div>
              </div>

              {/* Detailed results */}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-secondary/50">
                      <th className="px-3 py-1.5 text-left font-semibold">{t("status")}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("invoiceNumber")}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">{t("amount")}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.results.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.status === "created" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                            r.status === "skipped" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono">{r.invoiceNumber ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{r.totalAmount != null ? fmt(r.totalAmount) : "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <Button onClick={closeBulkModal} className="h-9 rounded-lg">
                  {t("done")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
