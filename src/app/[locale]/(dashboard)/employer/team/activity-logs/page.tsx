"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Activity,
  Clock,
  Filter,
  Calendar,
  Users,
  LogIn,
  Briefcase,
  CalendarCheck,
  FileText,
  UserPlus,
  Settings,
  MessageSquare,
  DollarSign,
  Shield,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PageHero } from "@/components/shared/PageHero";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

/* ─── Types ─── */
interface TeamMember {
  _id: string;
  name: string;
  email: string;
  companyRole: string;
}

interface AuditLogEntry {
  _id: string;
  actorId: { _id?: string; name?: string; email?: string; role?: string } | null;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: { before?: unknown; after?: unknown };
  ipAddress: string;
  country?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

/* ─── Constants ─── */
const ACTION_ICONS: Record<string, React.ReactNode> = {
  "login": <LogIn className="h-4 w-4" />,
  "job": <Briefcase className="h-4 w-4" />,
  "interview": <CalendarCheck className="h-4 w-4" />,
  "application": <FileText className="h-4 w-4" />,
  "team": <UserPlus className="h-4 w-4" />,
  "offer": <DollarSign className="h-4 w-4" />,
  "scorecard": <Shield className="h-4 w-4" />,
  "message": <MessageSquare className="h-4 w-4" />,
  "employer": <Settings className="h-4 w-4" />,
  "placement": <Users className="h-4 w-4" />,
};

const ACTION_COLORS: Record<string, string> = {
  "login.success": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "login.failed": "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "job.create": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "job.update": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "job.delete": "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "interview.create": "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  "interview.update": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "application.update": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "offer.create": "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "team.invite": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "team.update_member": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "team.remove_member": "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "scorecard.create": "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

function getResourceOptions(t: ReturnType<typeof useTranslations>) {
  return [
    { value: "all", label: t("allResources") },
    { value: "auth", label: t("authentication") },
    { value: "jobs", label: t("jobsResource") },
    { value: "applications", label: t("applicationsResource") },
    { value: "interviews", label: t("interviewsResource") },
    { value: "offers", label: t("offersResource") },
    { value: "placements", label: t("placementsResource") },
    { value: "scorecards", label: t("scorecardsResource") },
    { value: "employers", label: t("companySettings") },
    { value: "messages", label: t("messagesResource") },
  ];
}

function getActionIcon(action: string): React.ReactNode {
  const prefix = action.split(".")[0];
  return ACTION_ICONS[prefix] ?? <Activity className="h-4 w-4" />;
}

function getActionColor(action: string): string {
  return ACTION_COLORS[action] ?? "bg-muted text-muted-foreground";
}

function formatAction(action: string): string {
  return action
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" → ");
}

/* ─── Component ─── */
export default function TeamActivityLogsPage() {
  const t = useTranslations("employerActivityLogs");
  const { locale } = useParams<{ locale: string }>();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMember, setSelectedMember] = useState("all");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } =
    usePagination(25);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("timestamp"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleString() : "\u2014" },
    { header: t("actor"), key: "actorId", formatter: (_v, r) => (r as Record<string, any>).actorId?.name ?? "System" },
    { header: t("email"), key: "actorId", formatter: (_v, r) => (r as Record<string, any>).actorId?.email ?? "\u2014" },
    { header: t("action"), key: "action", formatter: (v) => String(v ?? "\u2014") },
    { header: t("resource"), key: "resource", formatter: (v) => String(v ?? "\u2014") },
    { header: t("ipAddress"), key: "ipAddress", formatter: (v) => String(v ?? "\u2014") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: logs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "activity-logs",
    title: t("exportTitle"),
  });

  useEffect(() => {
    document.title = t("docTitle");
  }, [t]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (selectedMember && selectedMember !== "all") params.set("memberId", selectedMember);
      if (action) params.set("action", action);
      if (resource && resource !== "all") params.set("resource", resource);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`/api/employers/team/activity-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setMembers(data.members);
        updateTotal(data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMember, action, resource, fromDate, toDate, page, limit, updateTotal]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const resourceOptions = getResourceOptions(t);

  const memberOptions = [
    { value: "all", label: t("allMembers") },
    ...members.map((m) => ({
      value: m._id,
      label: `${m.name} (${m.companyRole.replace("_", " ")})`,
    })),
  ];

  return (
    <div className="page-container employer-legacy-surface">
      {/* Header */}
      <PageHero
        title={t("title")}
        description={t("description", { activities: total.toLocaleString(), members: members.length })}
        icon={Activity}
        actions={
          <Link href={`/${locale}/employer/team`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("backToTeam")}
            </Button>
          </Link>
        }
      />

      {/* Stats Summary */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: t("teamMembers"),
              value: members.length,
              icon: Users,
              color: "text-primary",
              bg: "bg-white border-border dark:bg-card dark:border-border",
            },
            {
              label: t("totalActivities"),
              value: total,
              icon: Activity,
              color: "text-emerald-600",
              bg: "bg-white border-border dark:bg-card dark:border-border",
            },
            {
              label: t("today"),
              value: logs.filter(
                (l) =>
                  new Date(l.createdAt).toDateString() === new Date().toDateString()
              ).length,
              icon: Calendar,
              color: "text-blue-600",
              bg: "bg-white border-border dark:bg-card dark:border-border",
            },
            {
              label: t("loginEvents"),
              value: logs.filter((l) => l.action.startsWith("login")).length,
              icon: LogIn,
              color: "text-amber-600",
              bg: "bg-white border-border dark:bg-card dark:border-border",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`card-base p-4 flex sm:flex-col gap-3 sm:gap-2 border ${s.bg}`}
            >
              <div
                className="p-2 rounded-xl border bg-background/80 shrink-0 self-start sm:self-auto w-fit"
                style={{ borderColor: "inherit" }}
              >
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex sm:flex-col items-center sm:items-start justify-between sm:justify-start gap-1 flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {s.label}
                </p>
                <p
                  className={`text-xl font-bold ${s.color} leading-none tabular-nums shrink-0`}
                >
                  {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export Toolbar */}
      <TableToolbar
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("teamMember")}</label>
          <SearchableSelect
            className="w-52"
            options={memberOptions}
            value={selectedMember}
            onValueChange={(v) => {
              setSelectedMember(v);
              resetPage();
            }}
            placeholder={t("allMembers")}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("resource")}</label>
          <SearchableSelect
            className="w-44"
            options={resourceOptions}
            value={resource}
            onValueChange={(v) => {
              setResource(v);
              resetPage();
            }}
            placeholder={t("allResources")}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("action")}</label>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="e.g. job.create"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                resetPage();
              }}
              className="ps-10 w-48"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("from")}</label>
          <DateTimePicker
            mode="date"
            value={fromDate}
            onChange={(v) => {
              setFromDate(v);
              resetPage();
            }}
            placeholder={t("from")}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("to")}</label>
          <DateTimePicker
            mode="date"
            value={toDate}
            onChange={(v) => {
              setToDate(v);
              resetPage();
            }}
            placeholder={t("to")}
          />
        </div>

        {(selectedMember !== "all" || action || resource !== "all" || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedMember("all");
              setAction("");
              setResource("all");
              setFromDate("");
              setToDate("");
              resetPage();
            }}
            className="text-muted-foreground"
          >
            <Filter className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Activity Log */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="card-base text-center py-16">
          <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground">{t("noLogs")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("noLogsDesc")}
          </p>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="hidden md:block rounded-xl border overflow-x-auto bg-background">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="text-start px-4 py-3">{t("timestamp")}</th>
                  <th className="text-start px-4 py-3">{t("teamMember")}</th>
                  <th className="text-start px-4 py-3">{t("action")}</th>
                  <th className="text-start px-4 py-3">{t("resource")}</th>
                  <th className="text-start px-4 py-3">Details</th>
                  <th className="text-start px-4 py-3">{t("ipAddress")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {logs.map((log) => {
                  const dt = new Date(log.createdAt);
                  const dateStr = dt.toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const timeStr = dt.toLocaleTimeString(locale === "ar" ? "ar" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={log._id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{dateStr}</span>
                          <span className="opacity-60">{timeStr}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {log.actorId ? (
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {(log.actorId.name ?? log.actorId.email ?? "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {log.actorId.name ?? "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {log.actorId.email}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">System</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                            {getActionIcon(log.action)}
                            {formatAction(log.action)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {log.resource}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-48 truncate">
                        {log.meta
                          ? Object.entries(log.meta)
                              .filter(([k]) => !["__v", "password", "token"].includes(k))
                              .slice(0, 3)
                              .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                              .join(", ")
                          : log.resourceId
                            ? `ID: ${log.resourceId.slice(-8)}`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {log.ipAddress !== "unknown" ? log.ipAddress : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Card List ── */}
          <div className="md:hidden space-y-2">
            {logs.map((log) => {
              const dt = new Date(log.createdAt);
              const dateStr = dt.toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={log._id} className="card-base p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {log.actorId && (
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                          {(log.actorId.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {log.actorId?.name ?? "System"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {dateStr}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}
                    >
                      {getActionIcon(log.action)}
                      {formatAction(log.action)}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {log.resource}
                    </Badge>
                  </div>
                  {log.meta && (
                    <p className="text-xs text-muted-foreground truncate">
                      {Object.entries(log.meta)
                        .filter(([k]) => !["__v", "password", "token"].includes(k))
                        .slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </div>
  );
}
