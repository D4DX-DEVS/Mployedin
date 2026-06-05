"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Search, RotateCcw, Gift, Clock, CheckCircle2, XCircle,
  DollarSign, Calendar, FileText, Inbox,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OfferItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  salary?: number;
  currency?: string;
  status: string;
  startDate?: string;
  expiresAt?: string;
  createdAt: string;
}

interface Filters {
  search: string;
  status: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentOffersPage() {
  const t = useTranslations("agentOffers");
  const locale = useLocale();
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, declined: 0 });
  const pagination = usePagination();
  const { paginationParams, updateTotal } = pagination;

  const statusOptions = [
    { value: "all", label: t("statusOptions.all") },
    { value: "pending", label: t("status.pending") },
    { value: "accepted", label: t("status.accepted") },
    { value: "declined", label: t("status.declined") },
    { value: "expired", label: t("status.expired") },
    { value: "withdrawn", label: t("status.withdrawn") },
  ];

  const formatDate = useCallback((date?: string) => date ? new Date(date).toLocaleDateString(locale) : "—", [locale]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending": return t("status.pending");
      case "accepted": return t("status.accepted");
      case "declined": return t("status.declined");
      case "expired": return t("status.expired");
      case "withdrawn": return t("status.withdrawn");
      default: return status;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "accepted": return "default";
      case "pending": return "secondary";
      case "declined":
      case "withdrawn": return "destructive";
      default: return "outline";
    }
  };

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      params.set("scope", "agent");

      const res = await fetch(`/api/offers?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch offers");
      }

      const data = await res.json();
      setOffers(data.items ?? []);
      updateTotal(data.total ?? 0);
      if (data.stats) setStats(data.stats);
    } catch {
      setOffers([]);
      updateTotal(0);
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters, paginationParams, updateTotal, t]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const metricsItems = [
    { label: t("metrics.total"), value: stats.total, icon: <Gift className="h-5 w-5" />, tone: "workspace-tone-sky" },
    { label: t("status.pending"), value: stats.pending, icon: <Clock className="h-5 w-5" />, tone: "workspace-tone-amber" },
    { label: t("status.accepted"), value: stats.accepted, icon: <CheckCircle2 className="h-5 w-5" />, tone: "workspace-tone-emerald" },
    { label: t("status.declined"), value: stats.declined, icon: <XCircle className="h-5 w-5" />, tone: "workspace-tone-rose" },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("header.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("header.description")}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricsItems.map((m) => (
            <div key={m.label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{m.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{m.value}</p>
                </div>
                <div className={`${m.tone} rounded-xl p-2`}>{m.icon}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("filters.searchPlaceholder")}
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9"
            />
          </div>
          <SearchableSelect options={statusOptions} value={filters.status} onValueChange={(v) => updateFilter("status", v)} placeholder={t("filters.status")} className="w-36" />
          <Button variant="ghost" size="sm" onClick={() => { setFilters(INITIAL_FILTERS); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> {t("actions.reset")}
          </Button>
        </div>
      </section>

      {/* Table */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.candidate")}</TableHead>
                  <TableHead>{t("table.job")}</TableHead>
                  <TableHead>{t("table.salary")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.startDate")}</TableHead>
                  <TableHead>{t("table.expires")}</TableHead>
                  <TableHead>{t("table.sent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{o.candidateName}</p>
                      {o.candidateEmail && <p className="text-xs text-muted-foreground">{o.candidateEmail}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{o.jobTitle}</p>
                      {o.companyName && <p className="text-xs text-muted-foreground">{o.companyName}</p>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.salary ? `${o.currency ?? "AED"} ${o.salary.toLocaleString(locale)}` : "—"}
                    </TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(o.status)}>{statusLabel(o.status)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(o.startDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(o.expiresAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
