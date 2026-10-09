"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { toast } from "sonner";
import { Search, Clock, CornerDownRight } from "lucide-react";
import { formatActionCode } from "@/lib/admin/actionLabels";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { formatCount, formatDateTime, formatListDate, formatTime } from "@/lib/ui/intlFormat";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";

interface AuditLogEntry {
  _id: string;
  actorId: { name?: string; email?: string; role?: string } | null;
  // Set when the actor performed this inside someone else's account (tenant view
  // or admin impersonation). Without it the row is indistinguishable from the
  // same action taken in the actor's own account.
  onBehalfOfId?: { name?: string; email?: string; role?: string } | null;
  onBehalfOfRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  /** Actor-supplied context — currently the target's name/email and role move. */
  meta?: Record<string, unknown>;
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

/** Fields whose values are too long or too sensitive to print in a table cell. */
const CHANGE_VALUE_BLOCKLIST = new Set(["customPermissions", "passwordHash", "registrationNo", "taxId"]);

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length}` : "…";
  return String(value).replace("_", " ");
}

export default function AuditLogsPage() {
  const t = useTranslations("adminAuditLogs");
  const locale = useLocale();

  /**
   * The table used to show only "user.update" on "users" — the row proved that
   * *something* happened to *someone* and nothing more. `changes.before` was
   * recorded for some actions and never rendered at all, so an admin could not
   * tell a role conversion from a name edit, let alone what the role had been.
   */
  const describeChange = useCallback((log: AuditLogEntry) => {
    const from = log.meta?.fromRole;
    const to = log.meta?.toRole;
    if (from && to) {
      return (
        <span className="text-foreground">
          {t("changeArrow", { from: formatChangeValue(from), to: formatChangeValue(to) })}
        </span>
      );
    }

    const after = log.changes?.after;
    if (!after || typeof after !== "object") return null;
    const before = log.changes?.before ?? {};
    const fields = Object.keys(after).filter((k) => !CHANGE_VALUE_BLOCKLIST.has(k));
    if (fields.length === 0) return null;

    return (
      <div className="space-y-0.5">
        {fields.slice(0, 3).map((field) => (
          <p key={field} className="text-xs">
            <span className="text-muted-foreground">{field}: </span>
            <span className="text-foreground">
              {t("changeArrow", {
                from: formatChangeValue((before as Record<string, unknown>)[field]),
                to: formatChangeValue(after[field]),
              })}
            </span>
          </p>
        ))}
        {fields.length > 3 && <p className="text-xs text-muted-foreground">+{fields.length - 3}</p>}
      </div>
    );
  }, [t]);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Actor search and role filter arrived with the merge of the separate
     activity-timeline page, which read this same collection through a second
     endpoint with a different — and non-overlapping — filter set. */
  const [actorSearch, setActorSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [actorRole, setActorRole] = useUrlFilter("actorRole", "all");
  const [resource, setResource] = useState("all");
  // In the URL so the dashboard's Authentication check can open failed sign-ins.
  const [action, setAction] = useUrlFilter("action", "", { debounceMs: 400 });
  const [country, setCountry] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const changeSortOrder = (next: "asc" | "desc") => { setSortOrder(next); resetPage(); };

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
    { value: "messages", label: t("resourceMessages") },
    { value: "conversation_threads", label: t("resourceConversationThreads") },
    { value: "settings", label: t("resourceSettings") },
  ];

  const exportColumns: ExportColumn<AuditLogEntry>[] = [
    { header: t("timestamp"), key: "createdAt", formatter: (v) => v ? formatDateTime(new Date(String(v))) : "—" },
    { header: t("actor"), key: "actorId" as keyof AuditLogEntry, formatter: (_v, r) => (r as unknown as AuditLogEntry).actorId?.name ?? t("system") },
    { header: t("email"), key: "actorId" as keyof AuditLogEntry, formatter: (_v, r) => (r as unknown as AuditLogEntry).actorId?.email ?? "—" },
    { header: t("onBehalfOf"), key: "onBehalfOfId" as keyof AuditLogEntry, formatter: (_v, r) => (r as unknown as AuditLogEntry).onBehalfOfId?.email ?? "—" },
    { header: t("action"), key: "action" },
    { header: t("resource"), key: "resource" },
    // Kept in step with the table columns, so an exported log is as readable as
    // the screen it came from.
    {
      header: t("target"),
      key: "resourceId" as keyof AuditLogEntry,
      formatter: (_v, r) => {
        const row = r as unknown as AuditLogEntry;
        return String(row.meta?.targetEmail ?? row.meta?.targetName ?? row.resourceId ?? "—");
      },
    },
    {
      header: t("changeDetail"),
      key: "changes" as keyof AuditLogEntry,
      formatter: (_v, r) => {
        const row = r as unknown as AuditLogEntry;
        if (row.meta?.fromRole && row.meta?.toRole) {
          return `${String(row.meta.fromRole)} -> ${String(row.meta.toRole)}`;
        }
        const after = row.changes?.after;
        if (!after) return "—";
        return Object.keys(after).filter((k) => !CHANGE_VALUE_BLOCKLIST.has(k)).join(", ") || "—";
      },
    },
    { header: t("ipAddress"), key: "ipAddress" },
    { header: t("country"), key: "country", formatter: (v) => String(v ?? "—") },
  ];
  // BUG-004: export the full filtered result set, not just the visible page.
  const fetchAllLogs = useCallback(async () => {
    const base = new URLSearchParams();
    if (actorSearch.trim()) base.set("search", actorSearch.trim());
    if (actorRole && actorRole !== "all") base.set("actorRole", actorRole);
    if (resource && resource !== "all") base.set("resource", resource);
    if (action) base.set("action", action);
    if (country) base.set("country", country);
    if (fromDate) base.set("from", fromDate);
    if (toDate) base.set("to", toDate);
    base.set("sortOrder", sortOrder);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/admin/audit-logs?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.logs ?? []) as Record<string, unknown>[]),
        total: Number((json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [actorSearch, actorRole, resource, action, country, fromDate, toDate, sortOrder]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: logs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "audit-logs",
    title: t("auditLogs"),
    fetchAll: fetchAllLogs,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actorSearch.trim()) params.set("search", actorSearch.trim());
      if (actorRole && actorRole !== "all") params.set("actorRole", actorRole);
      if (resource && resource !== "all") params.set("resource", resource);
      if (action) params.set("action", action);
      if (country) params.set("country", country);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        updateTotal(data.pagination.total);
      } else {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || t("failedToLoadAuditLogs");
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch {
      const errMsg = t("failedToLoadAuditLogs");
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [actorSearch, actorRole, resource, action, country, fromDate, toDate, sortOrder, page, limit, t]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="page-container">
      <PageHero
        compact
        compactOnMobile
        title={t("auditLogs")}
        description={`${formatCount(total)} ${t("logEntriesDescription")}`}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={
          (resource !== "all" || !!action || !!country || !!fromDate || !!toDate || !!actorSearch || actorRole !== "all")
            ? () => {
              setActorSearch("");
              setActorRole("all");
              setResource("all");
              setAction("");
              setCountry("");
              setFromDate("");
              setToDate("");
              resetPage();
            }
            : undefined
        }
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        moreActiveCount={
          (action ? 1 : 0) + (country ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0)
        }
        more={(
          <>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label={t("filterByAction")}
                placeholder={t("filterByAction")}
                value={action}
                onChange={(e) => { setAction(e.target.value); resetPage(); }}
                className={INLINE_FILTER_CONTROL + " ps-10"}
              />
            </div>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label={t("country")}
                placeholder={t("countryCodeExample")}
                value={country}
                onChange={(e) => { setCountry(e.target.value.toUpperCase()); resetPage(); }}
                className={INLINE_FILTER_CONTROL + " ps-10 uppercase"}
                maxLength={2}
              />
            </div>
            <DateTimePicker
              mode="date"
              value={fromDate}
              onChange={(v) => { setFromDate(v); resetPage(); }}
              placeholder={t("from")}
              className={INLINE_FILTER_CONTROL}
            />
            <DateTimePicker
              mode="date"
              value={toDate}
              onChange={(v) => { setToDate(v); resetPage(); }}
              placeholder={t("to")}
              className={INLINE_FILTER_CONTROL}
            />
          </>
        )}
      >
        <InlineFilterSearch
          value={actorSearch}
          onChange={(value) => { setActorSearch(value); resetPage(); }}
          placeholder={t("filterByActor")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allRoles") },
            { value: "admin", label: t("roleAdmin") },
            { value: "super_agent", label: t("roleSuperAgent") },
            { value: "agent", label: t("roleAgent") },
            { value: "employer", label: t("roleEmployer") },
            { value: "job_seeker", label: t("roleJobSeeker") },
            { value: "system", label: t("roleSystem") },
          ]}
          value={actorRole}
          onValueChange={(v) => { setActorRole(v); resetPage(); }}
          placeholder={t("allRoles")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={resourceOptions}
          value={resource}
          onValueChange={(v) => { setResource(v); resetPage(); }}
          placeholder={t("allResources")}
        />
        <TableSortControl
          value="createdAt"
          onValueChange={() => undefined}
          options={[{ value: "createdAt", label: t("timestamp") }]}
          order={sortOrder}
          onOrderChange={changeSortOrder}
          compact
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {error ? (
          <div className="p-6">
            <ErrorState onRetry={fetchLogs} />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>
                  <SortableTableHeader label={t("timestamp")} active order={sortOrder} onClick={() => changeSortOrder(sortOrder === "asc" ? "desc" : "asc")} />
                </TableHead>
                <TableHead>{t("actor")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("resource")}</TableHead>
                <TableHead>{t("target")}</TableHead>
                <TableHead>{t("changeDetail")}</TableHead>
                <TableHead>{t("ipAddress")}</TableHead>
                <TableHead>{t("country")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={10} cols={8} />
              ) : logs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-12">
                    <EmptyState title={t("noAuditLogEntriesFound")} />
                  </TableCell>
                </TableRow>
              ) : logs.map((log) => (
                <TableRow key={log._id} className="font-mono text-xs">
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatListDate(log.createdAt, locale)} {formatTime(log.createdAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" }, locale)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.actorId ? (
                      <div>
                        <p className="font-medium text-foreground">{log.actorId.name ?? t("unknown")}</p>
                        <p className="text-muted-foreground">{log.actorId.email}</p>
                        {log.onBehalfOfId && (
                          <p className="text-amber-600">
                            <CornerDownRight className="me-1 inline h-3.5 w-3.5 align-[-2px] rtl:-scale-x-100" aria-hidden="true" />{t("onBehalfOf")} {log.onBehalfOfId.name ?? log.onBehalfOfId.email ?? log.onBehalfOfRole}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t("system")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-foreground">{formatActionCode(log.action)}</TableCell>
                  <TableCell>
                    <Badge className={`${RESOURCE_COLOR[log.resource] ?? "bg-muted text-muted-foreground"} border-0 text-xs`}>
                      {log.resource}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.meta?.targetEmail || log.meta?.targetName ? (
                      <div className="min-w-0">
                        {log.meta.targetName ? <p className="text-foreground truncate">{String(log.meta.targetName)}</p> : null}
                        {log.meta.targetEmail ? <p className="text-muted-foreground truncate">{String(log.meta.targetEmail)}</p> : null}
                      </div>
                    ) : log.resourceId ? (
                      <span className="text-muted-foreground font-mono text-[11px]">{log.resourceId}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("noChangeRecorded")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {describeChange(log) ?? <span className="text-muted-foreground">{t("noChangeRecorded")}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{log.ipAddress}</TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </section>

      {/* Pagination */}
      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
