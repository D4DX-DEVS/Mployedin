"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, Shield, Clock, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

interface AuditLogEntry {
  _id: string;
  actorId: { name?: string; email?: string; role?: string } | null;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: { before?: unknown; after?: unknown };
  ipAddress: string;
  country?: string;
  userAgent?: string;
  createdAt: string;
}

const RESOURCE_COLOR: Record<string, string> = {
  users: "bg-blue-100 text-blue-700",
  jobs: "bg-emerald-100 text-emerald-700",
  applications: "bg-purple-100 text-purple-700",
  interviews: "bg-amber-100 text-amber-700",
  settings: "bg-red-100 text-red-700",
};

export default function AuditLogsPage() {
  const t = useTranslations("adminAuditLogs");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState("all");
  const [action, setAction] = useState("");
  const [country, setCountry] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  useEffect(() => { document.title = `${t("auditLogs")} · MPLOYEDIN`; }, [t]);

  const resourceOptions = [
    { value: "all", label: t("allResources") },
    { value: "users", label: t("resourceUsers") },
    { value: "jobs", label: t("resourceJobs") },
    { value: "applications", label: t("resourceApplications") },
    { value: "interviews", label: t("resourceInterviews") },
    { value: "placements", label: t("resourcePlacements") },
    { value: "offers", label: t("resourceOffers") },
    { value: "commissions", label: t("resourceCommissions") },
    { value: "employers", label: t("resourceEmployers") },
    { value: "job_seekers", label: t("resourceJobSeekers") },
    { value: "agents", label: t("resourceAgents") },
    { value: "super_agents", label: t("resourceSuperAgents") },
    { value: "leads", label: t("resourceLeads") },
    { value: "saved_jobs", label: t("resourceSavedJobs") },
    { value: "messages", label: t("resourceMessages") },
    { value: "conversation_threads", label: t("resourceConversationThreads") },
    { value: "settings", label: t("resourceSettings") },
  ];

  const exportColumns: ExportColumn<AuditLogEntry>[] = [
    { header: t("timestamp"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
    { header: t("actor"), key: "actorId" as keyof AuditLogEntry, formatter: (_v, r) => (r as unknown as AuditLogEntry).actorId?.name ?? t("system") },
    { header: t("email"), key: "actorId" as keyof AuditLogEntry, formatter: (_v, r) => (r as unknown as AuditLogEntry).actorId?.email ?? "—" },
    { header: t("action"), key: "action" },
    { header: t("resource"), key: "resource" },
    { header: t("ipAddress"), key: "ipAddress" },
    { header: t("country"), key: "country", formatter: (v) => String(v ?? "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: logs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "audit-logs",
    title: t("auditLogs"),
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (resource && resource !== "all") params.set("resource", resource);
      if (action) params.set("action", action);
      if (country) params.set("country", country);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        updateTotal(data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [resource, action, country, fromDate, toDate, page, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="page-container space-y-4">
      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {t("adminWorkspace")}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{t("auditLogs")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {total.toLocaleString()} {t("logEntriesDescription")}
        </p>
      </section>

      <TableToolbar
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        hasActiveFilters={resource !== "all" || !!action || !!country || !!fromDate || !!toDate}
        filterContent={
          <div className="flex gap-3 flex-wrap items-center">
            <SearchableSelect
              className="h-11 w-44 rounded-xl border-border bg-card"
              options={resourceOptions}
              value={resource}
              onValueChange={(v) => { setResource(v); resetPage(); }}
              placeholder={t("allResources")}
            />
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("filterByAction")}
                value={action}
                onChange={(e) => { setAction(e.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card ps-10 w-56 text-sm shadow-none"
              />
            </div>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("countryCodeExample")}
                value={country}
                onChange={(e) => { setCountry(e.target.value.toUpperCase()); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card ps-10 w-44 text-sm shadow-none uppercase"
                maxLength={2}
              />
            </div>
            <DateTimePicker
              mode="date"
              value={fromDate}
              onChange={(v) => { setFromDate(v); resetPage(); }}
              placeholder={t("from")}
              className="h-11 w-40 rounded-xl border-border bg-card text-sm"
            />
            <DateTimePicker
              mode="date"
              value={toDate}
              onChange={(v) => { setToDate(v); resetPage(); }}
              placeholder={t("to")}
              className="h-11 w-40 rounded-xl border-border bg-card text-sm"
            />
          </div>
        }
      />

      {/* Logs table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="card-base text-center py-16">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("noAuditLogEntriesFound")}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-start px-4 py-3">{t("timestamp")}</th>
                <th className="text-start px-4 py-3">{t("actor")}</th>
                <th className="text-start px-4 py-3">{t("action")}</th>
                <th className="text-start px-4 py-3">{t("resource")}</th>
                <th className="text-start px-4 py-3">{t("ipAddress")}</th>
                <th className="text-start px-4 py-3">{t("country")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => {
                const dt = new Date(log.createdAt);
                const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <tr key={log._id} className="hover:bg-muted/20 transition-colors font-mono text-xs">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr} {timeStr}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.actorId ? (
                        <div>
                          <p className="font-medium text-foreground">{log.actorId.name ?? t("unknown")}</p>
                          <p className="text-muted-foreground">{log.actorId.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("system")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.action}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${RESOURCE_COLOR[log.resource] ?? "bg-muted text-muted-foreground"} border-0 text-xs`}>
                        {log.resource}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.ipAddress}</td>
                    <td className="px-4 py-3">
                      {log.country ? (
                        <span className="inline-flex items-center gap-1">
                          <img
                            src={`/flags/${log.country.toLowerCase()}.svg`}
                            alt={log.country}
                            className="w-4 h-3 object-cover rounded-sm"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          <span className="text-foreground">{log.country}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
