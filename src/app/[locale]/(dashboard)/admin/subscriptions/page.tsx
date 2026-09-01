"use client";

import React, { useState, useMemo, useCallback, Fragment } from "react";
import { useTranslations } from "next-intl";
import {
  Search, Crown, ArrowUpRight, ArrowDownRight, RotateCcw, X, Loader2,
  Clock, CheckCircle, XCircle, AlertTriangle, User, Briefcase,
  ChevronDown, ChevronUp, CreditCard, Users, ChevronLeft, ChevronRight,
  FileText, CalendarDays, BarChart3, Eye,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHero } from "@/components/shared/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUserSearch, type SearchUser } from "@/hooks/useUserSearch";
import { useSubscriptionPlans, type SubscriptionPlanItem } from "@/hooks/useSubscriptionPlans";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useDebounce } from "@/hooks/useDebounce";
import type { ExportColumn } from "@/lib/export";
import {
  useAdminSubscriptions,
  type AdminSubscriptionItem,
  type AdminSubscriptionsFilters,
} from "@/hooks/useAdminSubscriptions";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import {
  useUserSubscription,
  useSubscriptionHistory,
  useAssignSubscription,
  useChangeSubscription,
  useCancelSubscription,
  useRenewSubscription,
  useBulkAssignSubscription,
  type SubscriptionItem,
  type HistoryItem,
  type BulkAssignResult,
} from "@/hooks/useSubscriptionManagement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function daysUntil(d: string | undefined) {
  if (!d) return 0;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  active: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle },
  expired: { color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: AlertTriangle },
  cancelled: { color: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
  suspended: { color: "bg-orange-500/10 text-orange-600 border-orange-500/30", icon: AlertTriangle },
};


// ── KPI Fetch ─────────────────────────────────────────────────────────────────

interface OverviewStats {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  suspended: number;
}

interface StatsData {
  overview: OverviewStats;
  expiringSoon: { _id: string }[];
  expiringSoonCount?: number;
}

async function fetchStats(): Promise<StatsData> {
  const res = await fetch("/api/admin/subscription-stats");
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminSubscriptionsPage() {
  const t = useTranslations("adminSubscriptions");
  const [activeTab, setActiveTab] = useState<"table" | "manage">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);

  // ── KPI Stats ──
  const { data: stats } = useQuery({
    queryKey: ["admin", "subscription-stats"],
    queryFn: fetchStats,
    staleTime: 60_000,
  });

  // ── Search users ──
  const { data: searchResults } = useUserSearch(searchQuery);
  const filteredResults = useMemo(
    () => (searchResults ?? []).filter((u) => u.role === "employer" || u.role === "job_seeker"),
    [searchResults],
  );

  const exportColumns: ExportColumn<SearchUser>[] = [
    { header: t("exportHeaderName"), key: "name" as keyof SearchUser },
    { header: t("tableHeaderRole"), key: "role" as keyof SearchUser, formatter: (v) => v === "employer" ? t("employerBadge") : t("jobSeekerBadge") },
    { header: t("exportHeaderCompany"), key: "companyName" as keyof SearchUser, formatter: (v) => String(v || "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: filteredResults as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "subscriptions-users",
    title: t("exportTitleUsers"),
  });

  const overview = stats?.overview;
  const expiringSoonCount = stats?.expiringSoonCount ?? stats?.expiringSoon?.length ?? 0;

  return (
    <div className="page-container">
      <PageHero
        compact
        compactOnMobile
        icon={Crown}
        title={t("subscriptionManagementTitle")}
        description={t("subscriptionManagementDesc")}
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t("totalSubscribersLabel"), value: overview?.total ?? 0, icon: Users, color: "text-sky-500 bg-sky-500/10" },
          { label: t("activeLabel"), value: overview?.active ?? 0, icon: CheckCircle, color: "text-emerald-500 bg-emerald-500/10" },
          { label: t("expiringLabel"), value: expiringSoonCount, icon: AlertTriangle, color: "text-amber-500 bg-amber-500/10" },
          { label: t("cancelledLabel"), value: overview?.cancelled ?? 0, icon: XCircle, color: "text-red-500 bg-red-500/10" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-border/60 bg-card flex items-center gap-3 card-pad">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={activeTab === "table" ? "default" : "outline"}
          className={activeTab === "table" ? "bg-primary hover:bg-primary/90" : ""}
          onClick={() => setActiveTab("table")}
        >
          <Users className="h-3.5 w-3.5 mr-1.5" />
          {t("allSubscribersTab")}
        </Button>
        <Button
          size="sm"
          variant={activeTab === "manage" ? "default" : "outline"}
          className={activeTab === "manage" ? "bg-primary hover:bg-primary/90" : ""}
          onClick={() => setActiveTab("manage")}
        >
          <Search className="h-3.5 w-3.5 mr-1.5" />
          {t("searchManageTab")}
        </Button>
      </div>

      {/* ── All Subscribers Table ── */}
      {activeTab === "table" && <SubscribersTable />}

      {/* ── Search & Manage (existing flow) ── */}
      {activeTab === "manage" && (
        <>
          <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
            <h3 className="heading-label font-semibold text-muted-foreground uppercase tracking-wider">
              {t("searchUserLabel")}
            </h3>
            <TableToolbar
              search={searchQuery}
              onSearchChange={(v) => setSearchQuery(v)}
              searchPlaceholder={t("searchPlaceholder")}
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
            />
            {filteredResults.length > 0 && !selectedUser && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredResults.map((user) => (
                  <button
                    key={user._id}
                    onClick={() => { setSelectedUser(user); setSearchQuery(""); }}
                    className="w-full flex items-center gap-3 rounded-xl border border-border/40 hover:bg-sky-500/5 hover:border-sky-500/30 transition-colors text-left chip-pad"
                  >
                    <div className="h-9 w-9 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
                      {user.role === "employer" ? <Briefcase className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.role === "employer" ? t("employerBadge") : t("jobSeekerBadge")}
                        {user.companyName ? ` · ${user.companyName}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {user.role === "employer" ? t("employerBadge") : t("jobSeekerBadge")}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </section>
          <BulkAssignSection />
          {selectedUser && (
            <UserSubscriptionPanel user={selectedUser} onClear={() => setSelectedUser(null)} />
          )}
        </>
      )}
    </div>
  );
}

// ── Subscribers Table ────────────────────────────────────────────────────────

function SubscribersTable() {
  const t = useTranslations("adminSubscriptions");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [filters, setFilters] = useState<AdminSubscriptionsFilters>({
    sortBy: "createdAt", sortOrder: "desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search box drives the query directly — the Apply Filters button lives inside the
  // collapsed filter panel, so typing has to filter on its own.
  const debouncedSearch = useDebounce(searchInput, 300);

  // Merge search + pagination into filters for the API call
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch || undefined, page, limit }),
    [filters, debouncedSearch, page, limit],
  );

  const { data, isLoading } = useAdminSubscriptions(queryFilters);
  const subscriptions = data?.subscriptions ?? [];

  // Sync total from API response
  React.useEffect(() => {
    if (data?.total != null) updateTotal(data.total);
  }, [data?.total, updateTotal]);

  // Plans for filter dropdown
  const { data: employerPlans } = useSubscriptionPlans({ targetRole: filters.role === "job_seeker" ? "job_seeker" : "employer", isActive: "true" });
  const { data: jobSeekerPlans } = useSubscriptionPlans({ targetRole: "job_seeker", isActive: "true" });
  const allPlans = useMemo(() => {
    if (filters.role === "employer") return employerPlans ?? [];
    if (filters.role === "job_seeker") return jobSeekerPlans ?? [];
    return [...(employerPlans ?? []), ...(jobSeekerPlans ?? [])];
  }, [filters.role, employerPlans, jobSeekerPlans]);

  const hasActiveFilters = !!(filters.status || filters.role || filters.planId || filters.autoRenew || searchInput || dateFrom || dateTo);

  const clearFilters = useCallback(() => {
    setFilters({ sortBy: "createdAt", sortOrder: "desc" });
    setSearchInput("");
    setDateFrom("");
    setDateTo("");
    resetPage();
  }, [resetPage]);

  // Export columns
  const subExportColumns: ExportColumn<AdminSubscriptionItem>[] = useMemo(() => [
    { header: t("tableHeaderUser"), key: "userId" as keyof AdminSubscriptionItem, formatter: (_v, r) => (r as unknown as AdminSubscriptionItem).userId?.name ?? "—" },
    { header: t("exportHeaderEmail"), key: "userId" as keyof AdminSubscriptionItem, formatter: (_v, r) => (r as unknown as AdminSubscriptionItem).userId?.email ?? "—" },
    { header: t("tableHeaderRole"), key: "targetRole" as keyof AdminSubscriptionItem, formatter: (v) => v === "employer" ? t("employerBadge") : t("jobSeekerBadge") },
    { header: t("tableHeaderPlan"), key: "planSnapshot" as keyof AdminSubscriptionItem, formatter: (_v, r) => (r as unknown as AdminSubscriptionItem).planSnapshot?.name ?? "—" },
    { header: t("tierLabel"), key: "planSnapshot" as keyof AdminSubscriptionItem, formatter: (_v, r) => String((r as unknown as AdminSubscriptionItem).planSnapshot?.tier ?? 0) },
    { header: t("tableHeaderPrice"), key: "planSnapshot" as keyof AdminSubscriptionItem, formatter: (_v, r) => { const s = (r as unknown as AdminSubscriptionItem).planSnapshot; return s?.price > 0 ? `${s.price} ${s.currency}` : t("priceFreeLabel"); } },
    { header: t("exportHeaderBillingCycle"), key: "planSnapshot" as keyof AdminSubscriptionItem, formatter: (_v, r) => (r as unknown as AdminSubscriptionItem).planSnapshot?.billingCycle ?? "—" },
    { header: t("tableHeaderStatus"), key: "status" as keyof AdminSubscriptionItem },
    { header: t("tableHeaderStart"), key: "startDate" as keyof AdminSubscriptionItem, formatter: (v) => formatDate(v as string) },
    { header: t("tableHeaderEnd"), key: "endDate" as keyof AdminSubscriptionItem, formatter: (v) => formatDate(v as string) },
    { header: t("tableHeaderAutoRenew"), key: "autoRenew" as keyof AdminSubscriptionItem, formatter: (v) => v ? t("autoRenewYes") : t("autoRenewNo") },
    { header: t("tableHeaderDaysLeft"), key: "endDate" as keyof AdminSubscriptionItem, formatter: (v, r) => (r as unknown as AdminSubscriptionItem).status === "active" ? String(daysUntil(v as string)) : "—" },
  ], [t]);

  const { handleExportCsv: exportCsv, handleExportExcel: exportExcel, handleExportPdf: exportPdf } = useTableExport({
    data: subscriptions as unknown as Record<string, unknown>[],
    columns: subExportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "subscribers-export",
    title: t("exportTitleSubscribers"),
  });

  return (
    <section className="space-y-4">
      {/* ── Role Toggle ── */}
      <div className="flex gap-2">
        {([
          { value: undefined, label: t("allRoleOption"), icon: Users },
          { value: "employer", label: t("employersRoleOption"), icon: Briefcase },
          { value: "job_seeker", label: t("jobSeekersRoleOption"), icon: User },
        ] as const).map((opt) => (
          <button
            key={opt.label}
            onClick={() => { setFilters((f) => ({ ...f, role: opt.value, planId: undefined })); resetPage(); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              filters.role === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <opt.icon className="h-4 w-4" />
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Table Card ── */}
      <div className="workspace-panel-surface overflow-hidden rounded-3xl">
        <TableToolbar
          search={searchInput}
          onSearchChange={(v) => { setSearchInput(v); resetPage(); }}
          searchPlaceholder={t("searchPlaceholder")}
          onExportCsv={exportCsv}
          onExportExcel={exportExcel}
          onExportPdf={exportPdf}
          hasActiveFilters={hasActiveFilters}
          filterContent={
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {/* Status */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("planLabel")}</label>
                  <Select
                    value={filters.status ?? "all"}
                    onValueChange={(v) => { setFilters((f) => ({ ...f, status: v === "all" ? undefined : v })); resetPage(); }}
                  >
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allStatusesOption")}</SelectItem>
                      <SelectItem value="active">{t("statusActiveOption")}</SelectItem>
                      <SelectItem value="expired">{t("statusExpiredOption")}</SelectItem>
                      <SelectItem value="cancelled">{t("statusCancelledOption")}</SelectItem>
                      <SelectItem value="suspended">{t("statusSuspendedOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Plan */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("planLabel")}</label>
                  <Select
                    value={filters.planId ?? "all"}
                    onValueChange={(v) => { setFilters((f) => ({ ...f, planId: v === "all" ? undefined : v })); resetPage(); }}
                  >
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allPlansOption")}</SelectItem>
                      {allPlans.map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Auto-Renew */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("autoRenewLabel")}</label>
                  <Select
                    value={filters.autoRenew ?? "all"}
                    onValueChange={(v) => { setFilters((f) => ({ ...f, autoRenew: v === "all" ? undefined : v })); resetPage(); }}
                  >
                    <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allFilter")}</SelectItem>
                      <SelectItem value="true">{t("autoRenewYesOption")}</SelectItem>
                      <SelectItem value="false">{t("autoRenewNoOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="xl:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">{t("dateRangeLabel")}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <DateTimePicker
                        mode="date"
                        value={dateFrom}
                        onChange={(v) => { setDateFrom(v); setFilters((f) => ({ ...f, dateFrom: v || undefined })); resetPage(); }}
                        placeholder={t("dateRangeLabel")}
                        className="rounded-xl h-9"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{t("dateRangeToLabel")}</span>
                    <div className="flex-1">
                      <DateTimePicker
                        mode="date"
                        value={dateTo}
                        onChange={(v) => { setDateTo(v); setFilters((f) => ({ ...f, dateTo: v || undefined })); resetPage(); }}
                        placeholder={t("dateRangeLabel")}
                        className="rounded-xl h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="outline" size="sm"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("clearFiltersBtn")}
                </Button>
                <Button
                  size="sm" className="bg-primary hover:bg-primary/90 gap-1.5"
                  onClick={() => { setFilters((f) => ({ ...f, search: searchInput || undefined })); resetPage(); }}
                >
                  <Search className="h-3.5 w-3.5" /> {t("applyFiltersBtn")}
                </Button>
              </div>
            </div>
          }
          right={
            <span className="text-xs text-muted-foreground">
              {total} {total !== 1 ? t("subscriberCountPlural") : t("subscriberCountLabel")}
            </span>
          }
        />

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">{t("tableHeaderUser")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderRole")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderPlan")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderPrice")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderStart")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderEnd")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderAutoRenew")}</th>
                <th className="px-4 py-3 font-medium">{t("tableHeaderDaysLeft")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted/30" />
                    </td>
                  </tr>
                ))
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    <Crown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {t("noSubscriptionsFound")}
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <ExpandableRow
                    key={sub._id}
                    sub={sub}
                    isExpanded={expandedId === sub._id}
                    onToggle={() => setExpandedId(expandedId === sub._id ? null : sub._id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className="border-t border-border/80 px-4 py-3 sm:px-5">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      </div>
    </section>
  );
}

// ── Expandable Row ──────────────────────────────────────────────────────────

function ExpandableRow({
  sub, isExpanded, onToggle,
}: {
  sub: AdminSubscriptionItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("adminSubscriptions");
  const user = sub.userId;
  const snap = sub.planSnapshot;
  const days = daysUntil(sub.endDate);
  const sCfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
  const SIcon = sCfg.icon;

  return (
    <Fragment>
      <tr
        className="border-b border-border/20 hover:bg-sky-500/5 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {/* data-mobile-hidden: the phone card draws its own expand chevron, so
            this column would be a second chevron in an empty labelled row. */}
        <td className="px-4 py-3" data-mobile-hidden>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500 shrink-0">
              {sub.targetRole === "employer" ? <Briefcase className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{user?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline" className="text-xs">
            {sub.targetRole === "employer" ? t("employerBadge") : t("jobSeekerBadge")}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium">{snap?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{t("tierLabel")} {snap?.tier ?? 0}</p>
        </td>
        <td className="px-4 py-3 text-sm">
          {snap?.price > 0 ? `${snap.price} ${snap.currency}` : t("priceFreeLabel")}
          {snap?.price > 0 && <span className="text-xs text-muted-foreground">{t("pricePerLabel")}{snap.billingCycle}</span>}
        </td>
        <td className="px-4 py-3">
          <Badge className={`${sCfg.color} border text-xs`}>
            <SIcon className="h-3 w-3 mr-1" />
            {sub.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(sub.startDate)}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(sub.endDate)}</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={`text-xs ${sub.autoRenew ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}`}>
            {sub.autoRenew ? t("autoRenewYes") : t("autoRenewNo")}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {sub.status === "active" ? (
            <span className={`text-sm font-medium ${days <= 7 ? "text-red-400" : days <= 30 ? "text-amber-400" : "text-foreground"}`}>
              {days > 0 ? `${days}${t("daysLabelShort")}` : t("todayLabel")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {/* ── Expanded Detail ── */}
      {isExpanded && (
        <tr>
          <td colSpan={10} className="bg-muted/20 px-6 py-5 border-b border-border/40">
            <ExpandedDetail sub={sub} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ── Expanded Detail Panel ───────────────────────────────────────────────────

function ExpandedDetail({ sub }: { sub: AdminSubscriptionItem }) {
  const t = useTranslations("adminSubscriptions");
  const userId = sub.userId?._id;
  const [activeSection, setActiveSection] = useState<"details" | "history" | "invoices">("details");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: history } = useSubscriptionHistory(userId ?? "");
  const { data: invoices } = useInvoices({ userId: userId ?? "" });

  const snap = sub.planSnapshot;

  return (
    <div className="space-y-4">
      {/* ── Section Tabs ── */}
      <div className="flex gap-2">
        {([
          { key: "details" as const, label: t("detailsTab"), icon: Eye },
          { key: "history" as const, label: t("historyTab"), icon: Clock, count: history?.length },
          { key: "invoices" as const, label: t("invoicesTab"), icon: FileText, count: (invoices as InvoiceItem[] | undefined)?.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={(e) => { e.stopPropagation(); setActiveSection(tab.key); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSection === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${
                activeSection === tab.key ? "bg-white/20" : "bg-sky-500/10 text-sky-500"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Details Section ── */}
      {activeSection === "details" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label={t("detailCardPlanLabel")} value={snap?.name ?? "—"} sub={`${t("tierLabel")} ${snap?.tier ?? 0}`} />
          <DetailCard label={t("detailCardPriceLabel")} value={snap?.price > 0 ? `${snap.price} ${snap.currency}` : t("priceFreeLabel")} sub={snap?.billingCycle ?? "monthly"} />
          <DetailCard label={t("detailCardPeriodLabel")} value={`${formatDate(sub.startDate)} — ${formatDate(sub.endDate)}`} sub={sub.status === "active" ? `${daysUntil(sub.endDate)} ${t("daysRemainingLabel")}` : sub.status} />
          <DetailCard label={t("detailCardAutoRenewLabel")} value={sub.autoRenew ? t("autoRenewEnabledLabel") : t("autoRenewDisabledLabel")} sub={`${t("createdDatePrefix")} ${formatDate(sub.createdAt)}`} />
        </div>
      )}

      {/* ── History Section ── */}
      {activeSection === "history" && (
        <div className="space-y-2">
          {!history?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("noHistoryYet")}</p>
          ) : (
            <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border/60">
              {history.map((item: HistoryItem) => {
                const actionLabel = item.action === "assigned" ? t("actionLabelAssigned")
                  : item.action === "upgraded" ? t("actionLabelUpgraded")
                  : item.action === "downgraded" ? t("actionLabelDowngraded")
                  : item.action === "renewed" ? t("actionLabelRenewed")
                  : item.action === "cancelled" ? t("actionLabelCancelled")
                  : item.action === "expired" ? t("actionLabelExpired")
                  : item.action === "suspended" ? t("actionLabelSuspended")
                  : item.action === "reactivated" ? t("actionLabelReactivated")
                  : item.action;
                return (
                  <div key={item._id} className="relative">
                    <div className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-background bg-sky-500" />
                    <div className="rounded-xl border border-border/40 chip-pad">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {actionLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                      </div>
                      {item.fromPlanName && item.toPlanName && (
                        <p className="text-sm text-muted-foreground">{item.fromPlanName} {t("historyTransitionSeparator")} {item.toPlanName}</p>
                      )}
                      {!item.fromPlanName && item.toPlanName && (
                        <p className="text-sm text-muted-foreground">{t("historyAssignedPrefix")} {item.toPlanName}</p>
                      )}
                      {item.reason && <p className="text-xs text-muted-foreground/70 mt-1">{t("historyReasonPrefix")}: {item.reason}</p>}
                      <p className="text-xs text-muted-foreground/50 mt-1">{t("historyPerformedByPrefix")} {item.performedByRole}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Invoices Section ── */}
      {activeSection === "invoices" && (
        <div className="space-y-2">
          {!(invoices as InvoiceItem[] | undefined)?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("noInvoicesYet")}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-xs text-muted-foreground uppercase">
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderNumber")}</th>
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderPlan")}</th>
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderAmount")}</th>
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderStatus")}</th>
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderIssued")}</th>
                      <th className="px-3 py-2 font-medium">{t("invoiceHeaderPaid")}</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices as InvoiceItem[]).map((inv) => {
                      const invStatus = inv.status === "paid"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : inv.status === "issued"
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                          : "bg-muted text-muted-foreground border-border/40";
                      return (
                        <tr key={inv._id} className="border-b border-border/20 hover:bg-sky-500/5">
                          <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                          <td className="px-3 py-2 text-xs">{inv.planName ?? "—"}</td>
                          <td className="px-3 py-2 text-xs font-medium">{inv.amount} {inv.currency}</td>
                          <td className="px-3 py-2">
                            <Badge className={`${invStatus} border text-[11px]`}>{inv.status}</Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(inv.issuedAt)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(inv.paidAt)}</td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={(e) => { e.stopPropagation(); setSelectedInvoiceId(inv._id); }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Invoice Detail Modal */}
              <InvoiceDetailView
                invoiceId={selectedInvoiceId}
                open={!!selectedInvoiceId}
                onClose={() => setSelectedInvoiceId(null)}
                onRefresh={() => {}}
                role="admin"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DetailCard({ label, value, sub: subtext }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border/40 chip-pad">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="font-medium text-sm">{value}</p>
      <p className="text-xs text-muted-foreground capitalize">{subtext}</p>
    </div>
  );
}
// ── User Subscription Panel ──────────────────────────────────────────────────

function UserSubscriptionPanel({
  user,
  onClear,
}: {
  user: SearchUser;
  onClear: () => void;
}) {
  const t = useTranslations("adminSubscriptions");
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const targetRole = user.role === "employer" ? "employer" : "job_seeker";

  // ── Queries ──
  const { data: subscription, isLoading: isLoadingSub } = useUserSubscription(user._id);
  const { data: plans } = useSubscriptionPlans({ targetRole, isActive: "true" });
  const { data: history } = useSubscriptionHistory(user._id);

  // ── Mutations ──
  const assignMut = useAssignSubscription();
  const changeMut = useChangeSubscription();
  const cancelMut = useCancelSubscription();
  const renewMut = useRenewSubscription();

  const isMutating = assignMut.isPending || changeMut.isPending || cancelMut.isPending || renewMut.isPending;

  const statusCfg = subscription ? STATUS_CONFIG[subscription.status] ?? STATUS_CONFIG.active : null;
  const StatusIcon = statusCfg?.icon ?? CheckCircle;

  return (
    <div className="space-y-4">
      {/* ── User Header ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 panel-body">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
              {user.role === "employer" ? <Briefcase className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="heading-subsection font-semibold">{user.name}</h3>
              <p className="text-sm text-muted-foreground">
                {user.role === "employer" ? t("employerBadge") : t("jobSeekerBadge")}
                {user.companyName ? ` · ${user.companyName}` : ""}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Current Subscription Card ────────────────────────── */}
      {isLoadingSub ? (
        <div className="h-32 animate-pulse rounded-2xl bg-background/70" />
      ) : subscription && subscription.status === "active" ? (
        <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <h4 className="font-semibold">{t("currentSubscriptionTitle")}</h4>
            </div>
            <Badge className={`${statusCfg?.color} border`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {subscription.status}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/40 card-pad">
              <p className="text-xs text-muted-foreground mb-1">{t("detailCardPlanLabel")}</p>
              <p className="font-semibold text-lg">{subscription.planSnapshot?.name ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">
                {t("tierLabel")} {subscription.planSnapshot?.tier ?? 0} ·{" "}
                {subscription.planSnapshot?.price ?? 0} {subscription.planSnapshot?.currency ?? "AED"}{t("pricePerLabel")}{subscription.planSnapshot?.billingCycle ?? "monthly"}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 card-pad">
              <p className="text-xs text-muted-foreground mb-1">{t("detailCardPeriodLabel")}</p>
              <p className="font-medium">{formatDate(subscription.startDate)} — {formatDate(subscription.endDate)}</p>
              <p className="text-xs text-muted-foreground">
                {daysUntil(subscription.endDate) > 0
                  ? `${daysUntil(subscription.endDate)} ${t("daysRemainingLabel")}`
                  : t("statusExpired")}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 card-pad">
              <p className="text-xs text-muted-foreground mb-1">{t("detailCardAutoRenewLabel")}</p>
              <p className="font-medium">{subscription.autoRenew ? t("autoRenewYes") : t("autoRenewNo")}</p>
              <p className="text-xs text-muted-foreground">
                Assigned by {subscription.assignedByRole}
              </p>
            </div>
          </div>

          {/* ── Usage Summary ── */}
          <UsageSummary subscription={subscription} targetRole={targetRole} />

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setShowChangeForm(!showChangeForm); setShowAssignForm(false); }}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t("changePlanBtn")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => renewMut.mutate({ subscriptionId: subscription._id })}
              disabled={isMutating}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("renewBtn")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 hover:text-red-300 hover:border-red-500/30"
              onClick={() => setConfirmCancel(true)}
              disabled={isMutating}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("cancelBtn")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 ml-auto"
              onClick={() => setShowHistory(!showHistory)}
            >
              <Clock className="h-3.5 w-3.5" />
              {t("historyBtn")}
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* ── Cancel Confirm ── */}
          {confirmCancel && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 space-y-3 card-pad">
              <p className="text-sm font-medium text-red-400">{t("confirmCancellationTitle")}</p>
              <Input
                placeholder={t("cancelReasonPlaceholder")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isMutating}
                  onClick={async () => {
                    await cancelMut.mutateAsync({
                      subscriptionId: subscription._id,
                      reason: cancelReason || undefined,
                    });
                    setConfirmCancel(false);
                    setCancelReason("");
                  }}
                >
                  {cancelMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("cancelSubscriptionBtn")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
                  {t("neverMindBtn")}
                </Button>
              </div>
            </div>
          )}

          {/* ── Change Plan Form ── */}
          {showChangeForm && (
            <ChangePlanForm
              userId={user._id}
              currentPlanId={subscription.planId}
              plans={plans ?? []}
              onClose={() => setShowChangeForm(false)}
              changeMut={changeMut}
            />
          )}
        </section>
      ) : (
        /* ── No Active Subscription ── */
        <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
          <div className="text-center py-6">
            <Crown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">{t("noActiveSubscriptionMsg")}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t("noActiveSubscriptionDesc")}
            </p>
          </div>

          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            onClick={() => setShowAssignForm(!showAssignForm)}
          >
            <Crown className="h-4 w-4" />
            {t("assignSubscriptionBtn")}
          </Button>
        </section>
      )}

      {/* ── Assign Form (when no active sub) ── */}
      {showAssignForm && !subscription?.status?.includes("active") && (
        <AssignPlanForm
          userId={user._id}
          plans={plans ?? []}
          onClose={() => setShowAssignForm(false)}
          assignMut={assignMut}
        />
      )}

      {/* ── History ── */}
      {showHistory && (
        <HistoryTimeline history={history ?? []} />
      )}

      {/* ── Mutation Errors ── */}
      {(assignMut.error || changeMut.error || cancelMut.error || renewMut.error) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 card-pad">
          <p className="text-sm text-red-400">
            {(assignMut.error ?? changeMut.error ?? cancelMut.error ?? renewMut.error)?.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Usage Summary ────────────────────────────────────────────────────────────

function UsageSummary({
  subscription,
  targetRole,
}: {
  subscription: SubscriptionItem;
  targetRole: string;
}) {
  const t = useTranslations("adminSubscriptions");
  const limits =
    targetRole === "employer"
      ? subscription.planSnapshot?.employerLimits
      : subscription.planSnapshot?.jobSeekerLimits;

  if (!limits) return null;

  const snapshot = limits as Record<string, unknown>;
  const usage = subscription.usage;

  const numericItems: { label: string; used: number; max: number }[] = [];

  if (targetRole === "employer") {
    numericItems.push(
      { label: t("usageActiveJobsLabel"), used: usage.activeJobs ?? 0, max: snapshot.maxActiveJobs as number ?? 0 },
      { label: t("usageApplicationsViewedLabel"), used: usage.applicationsViewed ?? 0, max: snapshot.maxApplicationsViewPerMonth as number ?? 0 },
      { label: t("usageTeamMembersLabel"), used: 0, max: snapshot.maxTeamMembers as number ?? 0 },
    );
  } else {
    numericItems.push(
      { label: t("usageApplicationsLabel"), used: usage.applicationsSubmitted ?? 0, max: snapshot.maxApplicationsPerMonth as number ?? 0 },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("usageLabel")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {numericItems.map((item) => {
          const unlimited = item.max === -1;
          const pct = unlimited ? 10 : item.max > 0 ? Math.min(100, (item.used / item.max) * 100) : 0;
          return (
            <div key={item.label} className="rounded-xl border border-border/40 chip-pad">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{item.label}</span>
                <span>{unlimited ? `${item.used} / ${t("unlimitedSymbol")}` : `${item.used} / ${item.max}`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-sky-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Assign Plan Form ─────────────────────────────────────────────────────────

function AssignPlanForm({
  userId,
  plans,
  onClose,
  assignMut,
}: {
  userId: string;
  plans: SubscriptionPlanItem[];
  onClose: () => void;
  assignMut: ReturnType<typeof useAssignSubscription>;
}) {
  const t = useTranslations("adminSubscriptions");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [notes, setNotes] = useState("");

  const selectedPlan = plans.find((p) => p._id === selectedPlanId);

  const handleAssign = async () => {
    if (!selectedPlanId) return;
    await assignMut.mutateAsync({
      userId,
      planId: selectedPlanId,
      autoRenew,
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-4 panel-body">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-sky-500" />
          {t("assignPlanTitle")}
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Plan Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <button
            key={plan._id}
            onClick={() => setSelectedPlanId(plan._id)}
            className={`text-left rounded-xl border transition-colors ${ selectedPlanId === plan._id ? "border-sky-500 bg-sky-500/10" : "border-border/40 hover:border-sky-500/30 hover:bg-sky-500/5" } card-pad`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{plan.name}</span>
              <Badge variant="outline" className="text-xs">{t("tierOptionLabel")} {plan.tier}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>
            <p className="text-lg font-bold text-sky-500">
              {plan.price > 0 ? `${plan.price} ${plan.currency}` : t("priceFreeLabel")}
              <span className="text-xs font-normal text-muted-foreground">{t("pricePerLabel")}{plan.billingCycle}</span>
            </p>
          </button>
        ))}
      </div>

      {selectedPlan && (
        <div className="space-y-3 pt-3 border-t border-sky-500/20">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">{t("autoRenewCheckLabel")}</label>
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="rounded border-border"
            />
          </div>
          <Input
            placeholder={t("adminNotesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              disabled={assignMut.isPending}
              onClick={handleAssign}
            >
              {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              {t("assignButtonLabel")} {selectedPlan.name}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t("cancelFormBtn")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Change Plan Form ─────────────────────────────────────────────────────────

function ChangePlanForm({
  userId,
  currentPlanId,
  plans,
  onClose,
  changeMut,
}: {
  userId: string;
  currentPlanId: string;
  plans: SubscriptionPlanItem[];
  onClose: () => void;
  changeMut: ReturnType<typeof useChangeSubscription>;
}) {
  const t = useTranslations("adminSubscriptions");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const otherPlans = plans.filter((p) => p._id !== currentPlanId);
  const selectedPlan = plans.find((p) => p._id === selectedPlanId);
  const currentPlan = plans.find((p) => p._id === currentPlanId);
  const isUpgrade = selectedPlan && currentPlan ? selectedPlan.tier > currentPlan.tier : false;

  const handleChange = async () => {
    if (!selectedPlanId) return;
    await changeMut.mutateAsync({
      userId,
      newPlanId: selectedPlanId,
      reason: reason || undefined,
    });
    onClose();
  };

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-3 card-pad">
      <p className="text-sm font-semibold">{t("changePlanFormLabel")}</p>
      <div className="flex flex-wrap gap-2">
        {otherPlans.map((plan) => (
          <button
            key={plan._id}
            onClick={() => setSelectedPlanId(plan._id)}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              selectedPlanId === plan._id
                ? "border-sky-500 bg-sky-500/10 font-medium"
                : "border-border/40 hover:border-sky-500/30"
            }`}
          >
            {plan.name} ({plan.price > 0 ? `${plan.price} ${plan.currency}` : t("priceFreeLabel")})
          </button>
        ))}
      </div>

      {selectedPlan && (
        <div className="space-y-2">
          <Badge className={isUpgrade ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border border-amber-500/30"}>
            {isUpgrade ? (
              <><ArrowUpRight className="h-3 w-3 mr-1" /> {t("upgradeLabel")}</>
            ) : (
              <><ArrowDownRight className="h-3 w-3 mr-1" /> {t("downgradeLabel")}</>
            )}
          </Badge>
          <Input
            placeholder="Reason (optional)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="bg-primary hover:bg-primary/90 gap-1.5"
              size="sm"
              disabled={changeMut.isPending}
              onClick={handleChange}
            >
              {changeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isUpgrade ? t("confirmUpgradeLabel") : t("confirmDowngradeLabel")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>{t("cancelFormBtn")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History Timeline ─────────────────────────────────────────────────────────

function HistoryTimeline({ history }: { history: HistoryItem[] }) {
  const t = useTranslations("adminSubscriptions");
  if (!history.length) {
    return (
      <section className="workspace-panel-surface rounded-3xl text-center panel-body">
        <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{t("noHistoryYet")}</p>
      </section>
    );
  }

  return (
    <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
      <h4 className="font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        {t("subscriptionHistoryTitle")}
      </h4>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border/60">
        {history.map((item) => {
          const actionLabel = item.action === "assigned" ? t("actionLabelAssigned")
            : item.action === "upgraded" ? t("actionLabelUpgraded")
            : item.action === "downgraded" ? t("actionLabelDowngraded")
            : item.action === "renewed" ? t("actionLabelRenewed")
            : item.action === "cancelled" ? t("actionLabelCancelled")
            : item.action === "expired" ? t("actionLabelExpired")
            : item.action === "suspended" ? t("actionLabelSuspended")
            : item.action === "reactivated" ? t("actionLabelReactivated")
            : item.action;
          return (
            <div key={item._id} className="relative">
              <div className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-background bg-sky-500" />
              <div className="rounded-xl border border-border/40 chip-pad">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-xs">
                    {actionLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                </div>
                {item.fromPlanName && item.toPlanName && (
                  <p className="text-sm text-muted-foreground">
                    {item.fromPlanName} {t("historyTransitionSeparator")} {item.toPlanName}
                  </p>
                )}
                {!item.fromPlanName && item.toPlanName && (
                  <p className="text-sm text-muted-foreground">
                    {t("historyAssignedPrefix")} {item.toPlanName}
                  </p>
                )}
                {item.reason && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {t("historyReasonPrefix")}: {item.reason}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/50 mt-1">
                  {t("historyPerformedByPrefix")} {item.performedByRole}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Bulk Assign Section ──────────────────────────────────────────────────────

function BulkAssignSection() {
  const t = useTranslations("adminSubscriptions");
  const [expanded, setExpanded] = useState(false);
  const [targetRole, setTargetRole] = useState<"employer" | "job_seeker">("employer");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [userIdsText, setUserIdsText] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkAssignResult | null>(null);

  const { data: plans } = useSubscriptionPlans({ targetRole, isActive: "true" });
  const bulkMut = useBulkAssignSubscription();

  const userIds = useMemo(
    () => userIdsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    [userIdsText],
  );

  const handleBulkAssign = useCallback(() => {
    if (!selectedPlanId || selectedPlanId === "__none__" || userIds.length === 0) return;
    bulkMut.mutate(
      { userIds, planId: selectedPlanId, autoRenew: false, notes: "Bulk assigned from admin" },
      { onSuccess: (data) => setBulkResult(data) },
    );
  }, [selectedPlanId, userIds, bulkMut]);

  return (
    <section className="workspace-panel-surface rounded-3xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-sky-500/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="heading-label font-semibold text-muted-foreground uppercase tracking-wider">
            {t("bulkAssignTitle")}
          </h3>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Role toggle */}
          <div className="flex gap-2">
            {(["employer", "job_seeker"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={targetRole === r ? "default" : "outline"}
                onClick={() => { setTargetRole(r); setSelectedPlanId(""); }}
              >
                {r === "employer" ? t("bulkRoleLabel") : t("bulkJobSeekerLabel")}
              </Button>
            ))}
          </div>

          {/* Plan select */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("bulkPlanLabel")}</label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="h-9 w-full rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("bulkChoosePlanOption")}</SelectItem>
                {(plans ?? []).map((p: SubscriptionPlanItem) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} — {t("tierLabel")} {p.tier} ({p.price} {p.currency}{t("pricePerLabel")}{p.billingCycle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User IDs textarea */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t("bulkUserIdsLabel")}
            </label>
            <textarea
              value={userIdsText}
              onChange={(e) => setUserIdsText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border/60 bg-background text-sm font-mono resize-y chip-pad"
              placeholder={"60f1b2c3d4e5f6a7b8c9d0e1\n60f1b2c3d4e5f6a7b8c9d0e2"}
            />
            <p className="text-xs text-muted-foreground mt-1">{userIds.length} {t("bulkUserCountLabel")}</p>
          </div>

          {/* Assign button */}
          <Button
            onClick={handleBulkAssign}
            disabled={!selectedPlanId || userIds.length === 0 || bulkMut.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {bulkMut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("bulkAssigningLabel")}</>
            ) : (
              <>{t("bulkAssignButtonLabel")} {userIds.length} User(s)</>
            )}
          </Button>

          {/* Results */}
          {bulkResult && (
            <div className="rounded-xl border border-border/40 space-y-2 card-pad">
              <p className="text-sm font-medium">
                {t("bulkResultsLabel")} {bulkResult.assigned}/{bulkResult.total} {t("bulkAssignedLabel")}
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {bulkResult.results.map((r, i) => {
                  const statusLabel = r.status === "assigned" ? t("bulkStatusAssignedBadge")
                    : r.status === "skipped" ? t("bulkStatusSkippedBadge")
                    : r.status === "error" ? t("bulkStatusErrorBadge")
                    : r.status;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.status === "assigned" && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                      {r.status === "skipped" && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      {r.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                      <span className="font-mono">{r.userId.slice(0, 12)}...</span>
                      <Badge variant="outline" className="text-[11px]">{statusLabel}</Badge>
                      {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bulkMut.isError && (
            <p className="text-sm text-red-400">{t("bulkErrorLabel")} {bulkMut.error?.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
