"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  History,
  User,
  Globe,
  Calendar,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogIn,
  LogOut,
  FilePlus,
  FileEdit,
  Trash2,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/ui/intlFormat";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  actorName: string;
  actorRole: string;
  actorEmail?: string;
  action: string;
  method: string | null;
  path: string | null;
  ipAddress?: string;
  country?: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; icon: typeof History }> = {
  create: { label: "Created", color: "bg-status-selected-bg text-status-selected border-status-selected/20", icon: FilePlus },
  update: { label: "Updated", color: "bg-status-applied-bg text-status-applied border-status-applied/20", icon: FileEdit },
  delete: { label: "Deleted", color: "bg-status-rejected-bg text-status-rejected border-status-rejected/20", icon: Trash2 },
  start: { label: "Session Started", color: "bg-status-interview-bg text-status-interview border-status-interview/20", icon: LogIn },
  exit: { label: "Session Ended", color: "bg-secondary/75 text-muted-foreground border-border", icon: LogOut },
  write: { label: "Modified", color: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20", icon: FileText },
};

const ROLE_META: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-status-interview-bg text-status-interview" },
  super_agent: { label: "Super Agent", color: "bg-status-applied-bg text-status-applied" },
  agent: { label: "Agent", color: "bg-status-shortlisted-bg text-status-shortlisted" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getResourceFromPath(path: string | null): string {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  // Walk backwards to find the meaningful segment (skip ObjectIds)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!/^[0-9a-f]{24}$/i.test(parts[i])) {
      return parts[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return parts[parts.length - 1] ?? "";
}

function getDetailedDescription(entry: ActivityEntry, t: (key: string, values?: Record<string, string>) => string): string {
  const resource = getResourceFromPath(entry.path);
  switch (entry.action) {
    case "start":
      return t("descStart");
    case "exit":
      return t("descExit");
    case "create":
      return resource ? t("descCreate", { resource: resource.toLowerCase() }) : t("descCreateGeneric");
    case "update":
      return resource ? t("descUpdate", { resource: resource.toLowerCase() }) : t("descUpdateGeneric");
    case "delete":
      return resource ? t("descDelete", { resource: resource.toLowerCase() }) : t("descDeleteGeneric");
    default:
      return resource ? t("descDefault", { resource: resource.toLowerCase() }) : t("descDefaultGeneric");
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ActivityHistoryPage() {
  const t = useTranslations("employerActivity");
  const tc = useTranslations("employerCommon");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, limit: 15, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
  });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (page: number, action?: string, role?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (action && action !== "all") params.set("action", action);
      if (role && role !== "all") params.set("role", role);
      const res = await fetch(`/api/employers/activity-history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.items);
        setPagination(data.pagination);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(1, actionFilter, roleFilter);
  }, [actionFilter, roleFilter, fetchData]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchData(page, actionFilter, roleFilter);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(pagination.page, actionFilter, roleFilter);
    setRefreshing(false);
  };

  // Generate page numbers for pagination
  const getPageNumbers = (): (number | "...")[] => {
    const { page, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="page-container">
      {/* Hero + Filters Combined */}
      <DashboardPageHeader
        icon={History}
        title={t("title")}
        description={t("description")}
        compact
        compactOnMobile
        // Phones: the lone "Total Entries" strip cost a full row for a number
        // the pagination footer already reports.
        metricsClassName="max-sm:hidden"
        metrics={[
          { label: t("totalEntries"), value: pagination.total, icon: History },
        ]}
      >
          {/* Phones: both selects + Refresh share one row (labels hidden, the
              select values already say All Actions / All Roles). */}
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border/50 pt-3 sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
              <label className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                {t("actionType")}
              </label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-[150px] rounded-xl h-9 text-sm" aria-label={t("actionType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allActions")}</SelectItem>
                  <SelectItem value="start">Session Start</SelectItem>
                  <SelectItem value="exit">Session End</SelectItem>
                  <SelectItem value="create">{t("created")}</SelectItem>
                  <SelectItem value="update">{t("updated")}</SelectItem>
                  <SelectItem value="delete">{t("deleted")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
              <label className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                {t("role")}
              </label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[150px] rounded-xl h-9 text-sm" aria-label={t("role")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allRoles")}</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_agent">Super Agent</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl ml-auto h-9 shrink-0"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={t("refresh")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>
          </div>
      </DashboardPageHeader>

      {/* Activity List */}
      <section className="space-y-3">
        {error ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-20 text-center">
            <p className="text-sm font-semibold text-destructive">{tc("somethingWentWrong")}</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={handleRefresh}>
              {tc("tryAgain")}
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="workspace-panel-surface h-[92px] animate-pulse rounded-3xl"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border py-20 text-center">
            <History className="h-14 w-14 text-muted-foreground/30 mb-5" />
            <h3 className="heading-subsection font-semibold text-foreground">{t("noActivity")}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">{t("noActivityDescription")}</p>
          </div>
        ) : (
          entries.map((entry) => {
            const actionMeta = ACTION_META[entry.action] ?? ACTION_META.write;
            const roleMeta = ROLE_META[entry.actorRole] ?? { label: entry.actorRole, color: "bg-secondary/75 text-foreground/85" };
            const actionLabel = ACTION_META[entry.action] ? t(entry.action) : t("write");
            const roleLabelKey: Record<string, string> = { admin: "roleAdmin", super_agent: "roleSuperAgent", agent: "roleAgent" };
            const roleLabel = roleLabelKey[entry.actorRole] ? t(roleLabelKey[entry.actorRole]) : entry.actorRole;
            const ActionIcon = actionMeta.icon;

            return (
              <div
                key={entry.id}
                className="workspace-panel-surface flex items-start gap-4 rounded-3xl transition-all hover:shadow-[0_6px_20px_-6px_rgba(15,23,42,0.1)] panel-body"
              >
                {/* Action Icon */}
                <div className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  roleMeta.color,
                )}>
                  <ActionIcon className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{entry.actorName}</span>
                    <Badge variant="outline" className="text-[11px] font-medium rounded-lg px-2 py-0.5">
                      {roleLabel}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[11px] font-medium rounded-lg px-2 py-0.5", actionMeta.color)}>
                      {actionLabel}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {getDetailedDescription(entry, t)}
                  </p>

                  <div className="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      {formatDate(new Date(entry.createdAt), {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {entry.country && (
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        {entry.country}
                      </span>
                    )}
                    {entry.path && entry.action !== "start" && entry.action !== "exit" && (
                      <span className="flex items-center gap-1.5 font-mono text-[11px] bg-secondary/75 rounded px-1.5 py-0.5">
                        <ArrowUpRight className="h-3 w-3 shrink-0" />
                        {entry.method} {getResourceFromPath(entry.path)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-3xl border border-border bg-card/90 px-5 py-3.5 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">
            {t("showingRange", {
              from: String((pagination.page - 1) * pagination.limit + 1),
              to: String(Math.min(pagination.page * pagination.limit, pagination.total)),
              total: String(pagination.total),
            })}
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="dense"
              className="rounded-xl w-8 p-0"
              disabled={!pagination.hasPrev}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {getPageNumbers().map((pageNum, idx) =>
              pageNum === "..." ? (
                <span key={`dots-${idx}`} className="px-1.5 text-sm text-muted-foreground">…</span>
              ) : (
                <Button
                  key={pageNum}
                  variant={pageNum === pagination.page ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "rounded-xl h-8 w-8 p-0 text-sm",
                    pageNum === pagination.page && "pointer-events-none"
                  )}
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            )}

            <Button
              variant="outline"
              size="dense"
              className="rounded-xl w-8 p-0"
              disabled={!pagination.hasNext}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
