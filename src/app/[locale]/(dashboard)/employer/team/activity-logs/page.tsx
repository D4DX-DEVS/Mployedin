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
  Download,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { PageHero } from "@/components/shared/PageHero";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { formatCount, formatDateTime } from "@/lib/ui/intlFormat";

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
  "login.success": "bg-status-selected-bg text-emerald-700",
  "login.failed": "bg-status-rejected-bg text-status-rejected",
  "job.create": "bg-status-applied-bg text-status-applied",
  "job.update": "bg-status-shortlisted-bg text-status-shortlisted",
  "job.delete": "bg-status-rejected-bg text-status-rejected",
  "interview.create": "bg-status-interview-bg text-status-interview",
  "interview.update": "bg-status-shortlisted-bg text-status-shortlisted",
  "application.update": "bg-status-interview-bg text-indigo-700",
  "offer.create": "bg-teal-100 text-teal-700",
  "team.invite": "bg-status-applied-bg text-status-applied",
  "team.update_member": "bg-status-shortlisted-bg text-status-shortlisted",
  "team.remove_member": "bg-status-rejected-bg text-status-rejected",
  "scorecard.create": "bg-status-interview-bg text-status-interview",
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
  const tc = useTranslations("employerCommon");
  const { locale } = useParams<{ locale: string }>();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [selectedMember, setSelectedMember] = useState("all");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } =
    usePagination(25);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("timestamp"), key: "createdAt", formatter: (v) => v ? formatDateTime(new Date(String(v))) : "\u2014" },
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
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
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
    <div className="page-container">
      {/* Header */}
      <PageHero
        title={t("title")}
        description={t("description", { activities: formatCount(total), members: members.length })}
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
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {[
            {
              label: t("teamMembers"),
              value: members.length,
              icon: Users,
              color: "text-primary",
              bg: "bg-card border-border",
            },
            {
              label: t("totalActivities"),
              value: total,
              icon: Activity,
              color: "text-status-selected",
              bg: "bg-card border-border",
            },
            {
              label: t("today"),
              value: logs.filter(
                (l) =>
                  new Date(l.createdAt).toDateString() === new Date().toDateString()
              ).length,
              icon: Calendar,
              color: "text-status-applied",
              bg: "bg-card border-border",
            },
            {
              label: t("loginEvents"),
              value: logs.filter((l) => l.action.startsWith("login")).length,
              icon: LogIn,
              color: "text-status-shortlisted",
              bg: "bg-card border-border",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`card-base flex items-center gap-2.5 border p-2 sm:gap-3 sm:p-3 ${s.bg}`}
            >
              {/* Icon beside the figure, not stacked above it. Hidden on phones
                  so all four cards fit across a 390px row — at ~93px each there
                  is only room for the label and the number. */}
              <div className="hidden shrink-0 rounded-xl border border-border bg-background/80 chip-pad sm:block">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[11px] font-medium leading-tight text-muted-foreground sm:truncate sm:text-xs">
                  {s.label}
                </p>
                <p
                  className={`mt-1 text-base font-bold sm:text-xl ${s.color} leading-none tabular-nums`}
                >
                  {typeof s.value === "number" ? formatCount(s.value) : s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

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
          <label htmlFor="action-search" className="text-xs font-medium text-muted-foreground">{t("action")}</label>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="action-search"
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

        <div className="ms-auto flex items-end gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                {t("export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{t("exportData")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportCsv}>
                <FileDown className="h-4 w-4" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                <FileText className="h-4 w-4" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Activity Log */}
      {error ? (
        <div className="card-base text-center py-16">
          <p className="text-sm font-semibold text-destructive">{tc("somethingWentWrong")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchLogs}>
            {tc("tryAgain")}
          </Button>
        </div>
      ) : loading ? (
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
          <div className="hidden md:block rounded-xl border overflow-x-auto bg-background" tabIndex={0}>
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
                <div key={log._id} className="card-base space-y-2 panel-body">
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
