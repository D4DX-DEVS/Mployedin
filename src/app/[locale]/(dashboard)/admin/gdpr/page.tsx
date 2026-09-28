"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useConfirm } from "@/hooks/useConfirm";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Download, Trash2, Eye, FileText, UserCheck, Clock, AlertTriangle, CheckCircle2, XCircle, ShieldCheck, Users, CalendarDays,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GdprRequest {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestType: "export" | "delete" | "rectification" | "restrict";
  status: "pending" | "in_progress" | "completed" | "rejected";
  createdAt: string;
  completedAt?: string;
  notes?: string;
}

interface ConsentLog {
  _id: string;
  userId: string;
  userName: string;
  consentType: string;
  granted: boolean;
  timestamp: string;
  ipAddress?: string;
}

interface GdprStats {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  avgResponseDays: number;
  dataSubjects: number;
  activeConsents: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */


/** Mirrors GDPR_REQUEST_STATUSES; the model file cannot be imported client-side. */
const GDPR_STATUS_VALUES = ["pending", "in_progress", "completed", "rejected"] as const;

// No "Retention policies" tab: it rendered six hardcoded rows claiming
// auto-delete for applications, CVs and messages that no job performs, with a
// "last reviewed" date of whenever the page was opened.

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminGdprPage() {
  const t = useTranslations("adminGdpr");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [activeTab, setActiveTab] = useState<"requests" | "consent">("requests");
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [consentLogs, setConsentLogs] = useState<ConsentLog[]>([]);
  const [stats, setStats] = useState<GdprStats>({
    totalRequests: 0, pendingRequests: 0, completedRequests: 0,
    avgResponseDays: 0, dataSubjects: 0, activeConsents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  // In the URL so the dashboard's "pending GDPR requests" row lands filtered.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all", { allow: GDPR_STATUS_VALUES });
  const pagination = usePagination();
  // Requests sort by submitted or completed date; consent logs only by time.
  const [sortByParam, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "completedAt"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortBy = activeTab === "consent" ? "createdAt" : sortByParam;
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
    pagination.resetPage();
  };

  // i18n option maps (moved inside component)
  const REQUEST_TYPE_OPTIONS = [
    { value: "all", label: t("allTypesLabel") },
    { value: "export", label: t("dataExportLabel") },
    { value: "delete", label: t("erasureLabel") },
    { value: "rectification", label: t("rectificationLabel") },
    { value: "restrict", label: t("restrictProcessingLabel") },
  ];

  const STATUS_OPTIONS = [
    { value: "all", label: t("allStatusesLabel") },
    { value: "pending", label: t("pendingStatusLabel") },
    { value: "in_progress", label: t("inProgressStatusLabel") },
    { value: "completed", label: t("completedStatusLabel") },
    { value: "rejected", label: t("rejectedStatusLabel") },
  ];

  /* ---- Fetch data requests ---- */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sortBy", sortByParam);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/admin/gdpr?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      toast.error(t("failedLoadGdprData"));
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, sortByParam, sortOrder, pagination.page, pagination.limit, t]);

  /* ---- Fetch consent logs ---- */
  const fetchConsentLogs = useCallback(async () => {
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/gdpr/consent?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConsentLogs(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("failedLoadConsentLogs"));
    }
  }, [search, sortOrder, pagination.page, pagination.limit, t]);

  useEffect(() => {
    if (activeTab === "requests") fetchRequests();
    else if (activeTab === "consent") fetchConsentLogs();
    else setLoading(false);
  }, [activeTab, fetchRequests, fetchConsentLogs]);

  /* ---- Actions ---- */
  const handleUpdateStatus = async (id: string, status: string, subject: string) => {
    // Completed and rejected are terminal (GDPR_REQUEST_TRANSITIONS): once
    // either is saved the request can never move again, so ask first.
    if (status === "completed" || status === "rejected") {
      const confirmed = await confirm({
        title: status === "rejected" ? t("confirmRejectTitle") : t("confirmCompleteTitle"),
        message: status === "rejected"
          ? t("confirmRejectMessage", { name: subject })
          : t("confirmCompleteMessage", { name: subject }),
        confirmLabel: status === "rejected" ? t("rejectButton") : t("completeButton"),
        variant: status === "rejected" ? "destructive" : "default",
      });
      if (!confirmed) return;
    }
    try {
      const res = await fetch(`/api/admin/gdpr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(t("statusUpdatedSuccess"));
        fetchRequests();
      } else {
        toast.error(t("failedUpdateStatus"));
      }
    } catch {
      toast.error(t("errorUpdatingRequest"));
    }
  };

  // A static map, not t(`consentType_${type}`): an unknown stored type must
  // fall back to its raw name instead of throwing a missing-message error.
  const CONSENT_TYPE_LABELS: Record<string, string> = {
    terms_and_privacy: t("consentTypeTermsAndPrivacy"),
    cookies: t("consentTypeCookies"),
    marketing: t("consentTypeMarketing"),
  };

  const TABS = [
    { key: "requests" as const, label: t("dataRequestsTab"), icon: <FileText className="h-4 w-4" /> },
    { key: "consent" as const, label: t("consentLogsTab"), icon: <UserCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Shield}
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={[
          {
            label: t("totalRequestsLabel"),
            value: stats.totalRequests,
            icon: FileText,
            iconClassName: "text-sky-600",
            iconSurfaceClassName: "bg-sky-50",
          },
          {
            label: t("pendingLabel"),
            value: stats.pendingRequests,
            icon: Clock,
            iconClassName: "text-amber-600",
            iconSurfaceClassName: "bg-amber-50",
          },
          {
            label: t("completedLabel"),
            value: stats.completedRequests,
            icon: CheckCircle2,
            iconClassName: "text-emerald-600",
            iconSurfaceClassName: "bg-emerald-50",
          },
          {
            label: t("avgResponseDaysLabel"),
            value: stats.avgResponseDays,
            icon: AlertTriangle,
            iconClassName: "text-violet-600",
            iconSurfaceClassName: "bg-violet-50",
          },
        ]}
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); pagination.resetPage(); }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search.trim() || typeFilter !== "all" || statusFilter !== "all" ? () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); pagination.resetPage(); } : undefined}
        clearLabel={t("resetButton")}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        {activeTab === "requests" && (
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
            placeholder={t("statusLabel")}
            className={INLINE_FILTER_CONTROL}
          />
        )}
        {activeTab === "requests" && (
          <SearchableSelect
            options={REQUEST_TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={(v) => { setTypeFilter(v); pagination.resetPage(); }}
            placeholder={t("requestTypeLabel")}
            className={INLINE_FILTER_CONTROL}
          />
        )}
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v); pagination.resetPage(); }}
          options={activeTab === "consent"
            ? [{ value: "createdAt", label: t("timestampColumnHeader") }]
            : [
                { value: "createdAt", label: t("submittedColumnHeader") },
                { value: "completedAt", label: t("completedColumnHeader") },
              ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); pagination.resetPage(); }}
          compact
        />
      </InlineFilterBar>

      {/* Content */}
      <section className="workspace-panel-surface rounded-2xl panel-body">
        {activeTab === "requests" && (
          <>
            {loading ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("userColumnHeader")}</TableHead>
                      <TableHead>{t("requestTypeColumnHeader")}</TableHead>
                      <TableHead>{t("statusColumnHeader")}</TableHead>
                      <TableHead>{t("submittedColumnHeader")}</TableHead>
                      <TableHead>{t("completedColumnHeader")}</TableHead>
                      <TableHead className="text-right">{t("actionsColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noDataRequestsMessage")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{t("noDataRequestsSubtext")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("userColumnHeader")}</TableHead>
                      <TableHead>{t("requestTypeColumnHeader")}</TableHead>
                      <TableHead>{t("statusColumnHeader")}</TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("submittedColumnHeader")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => sortByColumn("createdAt")} />
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("completedColumnHeader")} active={sortBy === "completedAt"} order={sortOrder} onClick={() => sortByColumn("completedAt")} />
                      </TableHead>
                      <TableHead className="text-right">{t("actionsColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar name={r.userName} email={r.userEmail} className="h-9 w-9 shrink-0" colorful />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{r.userName}</p>
                              <p className="text-xs text-muted-foreground">{r.userEmail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm capitalize">
                            {r.requestType === "export" && <Download className="h-3.5 w-3.5" />}
                            {r.requestType === "delete" && <Trash2 className="h-3.5 w-3.5" />}
                            {r.requestType === "rectification" && <FileText className="h-3.5 w-3.5" />}
                            {r.requestType === "restrict" && <XCircle className="h-3.5 w-3.5" />}
                            {r.requestType.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(new Date(r.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.completedAt ? formatDate(new Date(r.completedAt), { day: "2-digit", month: "short", year: "numeric" }) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            name={r.userName}
                            menu={
                              (() => {
                                const items: RowAction[] = [];
                                if (r.status === "pending") {
                                  items.push({ key: "start", label: t("startButton"), icon: Clock, onSelect: () => handleUpdateStatus(r._id, "in_progress", r.userName) });
                                  items.push({ key: "reject", label: t("rejectButton"), icon: XCircle, onSelect: () => handleUpdateStatus(r._id, "rejected", r.userName), destructive: true });
                                }
                                if (r.status === "in_progress") {
                                  items.push({ key: "complete", label: t("completeButton"), icon: CheckCircle2, onSelect: () => handleUpdateStatus(r._id, "completed", r.userName) });
                                }
                                return items;
                              })()
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {activeTab === "consent" && (
          <>
            {consentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UserCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noConsentLogsMessage")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("consentUserColumnHeader")}</TableHead>
                      <TableHead>{t("consentTypeColumnHeader")}</TableHead>
                      <TableHead>{t("grantedColumnHeader")}</TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("timestampColumnHeader")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => sortByColumn("createdAt")} />
                      </TableHead>
                      <TableHead>{t("ipAddressColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentLogs.map((c) => (
                      <TableRow key={c._id}>
                        <TableCell className="font-medium">{c.userName}</TableCell>
                        <TableCell>{CONSENT_TYPE_LABELS[c.consentType] ?? c.consentType.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {c.granted ? (
                            <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {t("consentYesLabel")}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm text-red-600"><XCircle className="h-3.5 w-3.5" /> {t("consentNoLabel")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(new Date(c.timestamp))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Pagination */}
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
