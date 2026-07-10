"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, RotateCcw, Download, Trash2, Eye, FileText,
  UserCheck, Clock, AlertTriangle, CheckCircle2, XCircle,
  ShieldCheck, Database, Users, CalendarDays,
} from "lucide-react";

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

interface RetentionPolicy {
  _id: string;
  dataCategory: string;
  retentionPeriod: number;
  unit: "days" | "months" | "years";
  autoDelete: boolean;
  lastReview: string;
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


const DEFAULT_RETENTION: RetentionPolicy[] = [
  { _id: "1", dataCategory: "User Accounts", retentionPeriod: 3, unit: "years", autoDelete: false, lastReview: new Date().toISOString() },
  { _id: "2", dataCategory: "Application Data", retentionPeriod: 2, unit: "years", autoDelete: true, lastReview: new Date().toISOString() },
  { _id: "3", dataCategory: "Interview Records", retentionPeriod: 1, unit: "years", autoDelete: true, lastReview: new Date().toISOString() },
  { _id: "4", dataCategory: "Audit Logs", retentionPeriod: 5, unit: "years", autoDelete: false, lastReview: new Date().toISOString() },
  { _id: "5", dataCategory: "Messages/DMs", retentionPeriod: 1, unit: "years", autoDelete: true, lastReview: new Date().toISOString() },
  { _id: "6", dataCategory: "CV/Resume Files", retentionPeriod: 2, unit: "years", autoDelete: true, lastReview: new Date().toISOString() },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminGdprPage() {
  const t = useTranslations("adminGdpr");
  const [activeTab, setActiveTab] = useState<"requests" | "consent" | "retention">("requests");
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [consentLogs, setConsentLogs] = useState<ConsentLog[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>(DEFAULT_RETENTION);
  const [stats, setStats] = useState<GdprStats>({
    totalRequests: 0, pendingRequests: 0, completedRequests: 0,
    avgResponseDays: 0, dataSubjects: 0, activeConsents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const pagination = usePagination();

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
  }, [search, typeFilter, statusFilter, pagination.page, pagination.limit, t]);

  /* ---- Fetch consent logs ---- */
  const fetchConsentLogs = useCallback(async () => {
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/gdpr/consent?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConsentLogs(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("failedLoadConsentLogs"));
    }
  }, [search, pagination.page, pagination.limit, t]);

  useEffect(() => {
    if (activeTab === "requests") fetchRequests();
    else if (activeTab === "consent") fetchConsentLogs();
    else setLoading(false);
  }, [activeTab, fetchRequests, fetchConsentLogs]);

  /* ---- Actions ---- */
  const handleUpdateStatus = async (id: string, status: string) => {
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

  const TABS = [
    { key: "requests" as const, label: t("dataRequestsTab"), icon: <FileText className="h-4 w-4" /> },
    { key: "consent" as const, label: t("consentLogsTab"), icon: <UserCheck className="h-4 w-4" /> },
    { key: "retention" as const, label: t("retentionPoliciesTab"), icon: <Database className="h-4 w-4" /> },
  ];

  const metricsItems = [
    { label: t("totalRequestsLabel"), value: stats.totalRequests, icon: <FileText className="h-5 w-5" />, tone: "workspace-tone-sky" },
    { label: t("pendingLabel"), value: stats.pendingRequests, icon: <Clock className="h-5 w-5" />, tone: "workspace-tone-amber" },
    { label: t("completedLabel"), value: stats.completedRequests, icon: <CheckCircle2 className="h-5 w-5" />, tone: "workspace-tone-emerald" },
    { label: t("avgResponseDaysLabel"), value: stats.avgResponseDays, icon: <AlertTriangle className="h-5 w-5" />, tone: "workspace-tone-violet" },
  ];

  return (
    <div className="page-container">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      {activeTab !== "retention" && (
        <TableToolbar
          title={t("gdprDataTitle")}
          description={activeTab === "requests" ? t("filterDataPrivacyDesc") : t("filterConsentLogsDesc")}
          search={search}
          onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
          searchPlaceholder={t("searchPlaceholder")}
          hasActiveFilters={typeFilter !== "all" || statusFilter !== "all"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); pagination.resetPage(); }}>
              <RotateCcw className="mr-1 h-4 w-4" /> {t("resetButton")}
            </Button>
          }
          filterContent={activeTab === "requests" ? (
            <div className="flex flex-wrap items-center gap-3">
              <SearchableSelect
                options={REQUEST_TYPE_OPTIONS}
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); pagination.resetPage(); }}
                placeholder={t("requestTypeLabel")}
                className="h-11 w-44 rounded-xl border-border bg-card"
              />
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
                placeholder={t("statusLabel")}
                className="h-11 w-36 rounded-xl border-border bg-card"
              />
            </div>
          ) : undefined}
        />
      )}

      {/* Content */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
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
                      <TableHead>{t("submittedColumnHeader")}</TableHead>
                      <TableHead>{t("completedColumnHeader")}</TableHead>
                      <TableHead className="text-right">{t("actionsColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>
                          <p className="font-medium text-foreground">{r.userName}</p>
                          <p className="text-xs text-muted-foreground">{r.userEmail}</p>
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
                        <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.completedAt ? new Date(r.completedAt).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === "pending" && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(r._id, "in_progress")}>
                                  <Clock className="mr-1 h-3.5 w-3.5" /> {t("startButton")}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(r._id, "rejected")}>
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> {t("rejectButton")}
                                </Button>
                              </>
                            )}
                            {r.status === "in_progress" && (
                              <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(r._id, "completed")}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {t("completeButton")}
                              </Button>
                            )}
                          </div>
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
                      <TableHead>{t("timestampColumnHeader")}</TableHead>
                      <TableHead>{t("ipAddressColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentLogs.map((c) => (
                      <TableRow key={c._id}>
                        <TableCell className="font-medium">{c.userName}</TableCell>
                        <TableCell className="capitalize">{c.consentType.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {c.granted ? (
                            <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {t("consentYesLabel")}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm text-red-600"><XCircle className="h-3.5 w-3.5" /> {t("consentNoLabel")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(c.timestamp).toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {activeTab === "retention" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("retentionDescription")}</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dataCategoryColumnHeader")}</TableHead>
                    <TableHead>{t("retentionPeriodColumnHeader")}</TableHead>
                    <TableHead>{t("autoDeleteColumnHeader")}</TableHead>
                    <TableHead>{t("lastReviewedColumnHeader")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retentionPolicies.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-medium">{p.dataCategory}</TableCell>
                      <TableCell>{p.retentionPeriod} {p.unit}</TableCell>
                      <TableCell>
                        {p.autoDelete ? (
                          <span className="text-sm text-emerald-600">{t("autoDeleteEnabled")}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("autoDeleteManual")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(p.lastReview).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      {/* Pagination */}
      {activeTab !== "retention" && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}
    </div>
  );
}
