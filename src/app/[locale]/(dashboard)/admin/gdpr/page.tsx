"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
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

const REQUEST_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "export", label: "Data Export" },
  { value: "delete", label: "Erasure" },
  { value: "rectification", label: "Rectification" },
  { value: "restrict", label: "Restrict Processing" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

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
      toast.error("Failed to load GDPR data");
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, pagination.page, pagination.limit]);

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
      toast.error("Failed to load consent logs");
    }
  }, [search, pagination.page, pagination.limit]);

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
        toast.success("Request status updated");
        fetchRequests();
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Error updating request");
    }
  };

  const TABS = [
    { key: "requests" as const, label: "Data Requests", icon: <FileText className="h-4 w-4" /> },
    { key: "consent" as const, label: "Consent Logs", icon: <UserCheck className="h-4 w-4" /> },
    { key: "retention" as const, label: "Retention Policies", icon: <Database className="h-4 w-4" /> },
  ];

  const metricsItems = [
    { label: "Total Requests", value: stats.totalRequests, icon: <FileText className="h-5 w-5" />, tone: "workspace-tone-sky" },
    { label: "Pending", value: stats.pendingRequests, icon: <Clock className="h-5 w-5" />, tone: "workspace-tone-amber" },
    { label: "Completed", value: stats.completedRequests, icon: <CheckCircle2 className="h-5 w-5" />, tone: "workspace-tone-emerald" },
    { label: "Avg Response (days)", value: stats.avgResponseDays, icon: <AlertTriangle className="h-5 w-5" />, tone: "workspace-tone-violet" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">GDPR & Privacy</h1>
            <p className="text-sm text-muted-foreground">Manage data subject requests, consent logs, and retention policies</p>
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
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); pagination.resetPage(); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
          title="GDPR Data"
          description={activeTab === "requests" ? "Filter data privacy requests" : "Filter consent logs"}
          search={search}
          onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
          searchPlaceholder="Search by name or email..."
          hasActiveFilters={typeFilter !== "all" || statusFilter !== "all"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); pagination.resetPage(); }}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reset
            </Button>
          }
          filterContent={activeTab === "requests" ? (
            <div className="flex flex-wrap items-center gap-3">
              <SearchableSelect
                options={REQUEST_TYPE_OPTIONS}
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); pagination.resetPage(); }}
                placeholder="Request Type"
                className="h-11 w-44 rounded-xl border-border bg-card"
              />
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
                placeholder="Status"
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
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">No data requests found</p>
                <p className="mt-1 text-xs text-muted-foreground/70">All clear — no pending privacy requests</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Request Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                                  <Clock className="mr-1 h-3.5 w-3.5" /> Start
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(r._id, "rejected")}>
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                                </Button>
                              </>
                            )}
                            {r.status === "in_progress" && (
                              <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus(r._id, "completed")}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
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
                <p className="mt-4 text-sm font-medium text-muted-foreground">No consent logs yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Consent Type</TableHead>
                      <TableHead>Granted</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentLogs.map((c) => (
                      <TableRow key={c._id}>
                        <TableCell className="font-medium">{c.userName}</TableCell>
                        <TableCell className="capitalize">{c.consentType.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {c.granted ? (
                            <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Yes</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm text-red-600"><XCircle className="h-3.5 w-3.5" /> No</span>
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
              <p className="text-sm text-muted-foreground">Configure how long different data categories are retained before automated cleanup.</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Category</TableHead>
                    <TableHead>Retention Period</TableHead>
                    <TableHead>Auto-Delete</TableHead>
                    <TableHead>Last Reviewed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retentionPolicies.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-medium">{p.dataCategory}</TableCell>
                      <TableCell>{p.retentionPeriod} {p.unit}</TableCell>
                      <TableCell>
                        {p.autoDelete ? (
                          <span className="text-sm text-emerald-600">Enabled</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Manual</span>
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
