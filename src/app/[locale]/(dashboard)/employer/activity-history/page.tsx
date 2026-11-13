"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  History,
  Globe,
  Calendar,
  ArrowUpRight,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/ui/intlFormat";
import { StackedLabelled } from "@/components/shared/LabelledControl";

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

const ROLE_LABEL_KEY: Record<string, string> = { admin: "roleAdmin", super_agent: "roleSuperAgent", agent: "roleAgent" };

const ROLE_META: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-status-interview-bg text-status-interview" },
  super_agent: { label: "Super Agent", color: "bg-status-applied-bg text-status-applied" },
  agent: { label: "Agent", color: "bg-status-shortlisted-bg text-status-shortlisted" },
};

/** The API caps a page at 50 events. */
const ACTIVITY_PAGE_SIZES = [15, 25, 50] as const;

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

function formatWhen(iso: string): string {
  return formatDate(new Date(iso), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

  const [limit, setLimit] = useState(15);

  const fetchData = useCallback(async (page: number, action: string, role: string, pageSize: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
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
    fetchData(1, actionFilter, roleFilter, limit);
  }, [actionFilter, roleFilter, limit, fetchData]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchData(page, actionFilter, roleFilter, limit);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(pagination.page, actionFilter, roleFilter, limit);
    setRefreshing(false);
  };

  return (
    <div className="page-container">
      {/* Pattern A (compact workspace): title + context; the filters sit in
          a toolbar row beneath, like every other list page. The entry count
          stays in the pagination footer, which already reports it. */}
      <WorkspaceHeader title={t("title")} context={t("description")} />

      {/* Phones: both selects + Refresh share one row (labels hidden, the
          select values already say All Actions / All Roles). */}
      <div className="workspace-toolbar">
        <StackedLabelled label={t("actionType")} className="min-w-0 flex-1 sm:flex-none">
          {(id) => (
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger id={id} className="w-full sm:w-[150px] h-11 rounded-xl text-sm sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allActions")}</SelectItem>
                <SelectItem value="start">{t("start")}</SelectItem>
                <SelectItem value="exit">{t("exit")}</SelectItem>
                <SelectItem value="create">{t("created")}</SelectItem>
                <SelectItem value="update">{t("updated")}</SelectItem>
                <SelectItem value="delete">{t("deleted")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </StackedLabelled>

        <StackedLabelled label={t("role")} className="min-w-0 flex-1 sm:flex-none">
          {(id) => (
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger id={id} className="w-full sm:w-[150px] h-11 rounded-xl text-sm sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allRoles")}</SelectItem>
                <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                <SelectItem value="super_agent">{t("roleSuperAgent")}</SelectItem>
                <SelectItem value="agent">{t("roleAgent")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </StackedLabelled>

        <Button
          variant="outline"
          className="ms-auto h-11 shrink-0 gap-1.5 self-end rounded-xl px-3 sm:h-10"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 max-sm:hidden", refreshing && "animate-spin")} aria-hidden="true" />
          {t("refresh")}
        </Button>
      </div>

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
          <>
          {/* From tablets up: one row per event — who, what, when. As full-width
              cards each event was four-fifths empty and fifteen of them ran to
              2,400px on a desktop. */}
          <div className="workspace-panel-surface hidden overflow-hidden rounded-2xl md:block">
            <Table data-mobile-table="scroll">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("colWho")}</TableHead>
                  <TableHead>{t("colWhat")}</TableHead>
                  <TableHead>{t("colWhen")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("colWhere")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const actionMeta = ACTION_META[entry.action] ?? ACTION_META.write;
                  const actionLabel = ACTION_META[entry.action] ? t(entry.action) : t("write");
                  const roleLabel = ROLE_LABEL_KEY[entry.actorRole] ? t(ROLE_LABEL_KEY[entry.actorRole]) : entry.actorRole;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{entry.actorName}</p>
                        <p className="text-xs text-muted-foreground">{roleLabel}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-medium", actionMeta.color)}>
                            {actionLabel}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{getDetailedDescription(entry, t)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatWhen(entry.createdAt)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{entry.country || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
          {entries.map((entry) => {
            const actionMeta = ACTION_META[entry.action] ?? ACTION_META.write;
            const roleMeta = ROLE_META[entry.actorRole] ?? { label: entry.actorRole, color: "bg-secondary/75 text-foreground/85" };
            const actionLabel = ACTION_META[entry.action] ? t(entry.action) : t("write");
            const roleLabel = ROLE_LABEL_KEY[entry.actorRole] ? t(ROLE_LABEL_KEY[entry.actorRole]) : entry.actorRole;
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
                      {formatWhen(entry.createdAt)}
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
          })}
          </div>
          </>
        )}
      </section>

      {/* The shared page bar; this page drew its page numbers in a style of its own. */}
      {!error && pagination.total > 0 ? (
        <PaginationControls
          page={pagination.page}
          totalPages={Math.max(1, pagination.totalPages)}
          total={pagination.total}
          limit={limit}
          sizeOptions={ACTIVITY_PAGE_SIZES}
          onPageChange={handlePageChange}
          onLimitChange={setLimit}
        />
      ) : null}
    </div>
  );
}
