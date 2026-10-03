"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ScrollText } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { API, SectionCard, errorKindLabel, skipReasonLabel, sourceLabel, statusLabel, statusTone, type Translator, type WaLog } from "./shared";

const STATUSES = ["sent", "delivered", "read", "failed", "skipped", "mock"] as const;
const SOURCES = ["orchestrator", "broadcast", "schedule", "test", "auto_reply"] as const;
/** The size select offers 10, 25, 50 and 100; a default outside that list would leave it blank. */
const DEFAULT_LIMIT = 25;

interface LogsResponse {
  logs?: WaLog[];
  pagination?: { total: number; totalPages: number };
}

/**
 * What the Detail column says about a row. Only classified values are shown: `errorMessage` is Meta's own
 * wording (or a network error's), English only, and may carry detail an admin should not see rendered.
 * The numeric `errorCode` is kept as a short reference for support.
 */
function detailOf(log: WaLog, t: Translator): string {
  if (log.status === "skipped") return skipReasonLabel(log.skipReason ?? "unknown", t);
  const parts: string[] = [];
  if (log.errorKind) parts.push(errorKindLabel(log.errorKind, t));
  // A string, so ICU does not group the digits: support looks the code up as Meta wrote it.
  if (typeof log.errorCode === "number") parts.push(`(${t("logErrorCode", { code: String(log.errorCode) })})`);
  if (parts.length > 0) return parts.join(" ");
  // A failure with no kind did not come from a classified Meta answer (a network error, say).
  return log.status === "failed" ? t("logDetailNoKind") : "—";
}

/** `showNotConnected`: offer the "Not sent (not connected)" filter (see showNotConnectedStatus). */
export function LogsTab({ showNotConnected }: { showNotConnected: boolean }) {
  const t = useTranslations("adminWhatsApp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [logs, setLogs] = useState<WaLog[]>([]);
  const [loading, setLoading] = useState(true);
  // Unknown is not empty: a failed load shows an error state, never "No messages yet."
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status !== "all") params.set("status", status);
    if (source !== "all") params.set("source", source);
    fetch(`${API.logs}?${params.toString()}`)
      .then(async (res) => {
        const data = res.ok ? ((await res.json()) as LogsResponse) : null;
        if (!data || !Array.isArray(data.logs) || !data.pagination) throw new Error("logs");
        if (cancelled) return;
        // Rows expire after 90 days and filters narrow the set, so the page being shown can stop existing: go to the last real one.
        if (page > data.pagination.totalPages) {
          setPage(data.pagination.totalPages);
          return;
        }
        setLogs(data.logs);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, limit, status, source, reloadKey]);

  const filtered = status !== "all" || source !== "all";
  const empty = !loading && !failed && logs.length === 0;
  // The filter keeps `mock` as its query value; a filter already set to it stays offered so the Select never goes blank.
  const statuses = showNotConnected || status === "mock" ? STATUSES : STATUSES.filter((s) => s !== "mock");

  const changeStatus = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  const changeSource = (value: string) => {
    setSource(value);
    setPage(1);
  };
  const clearFilters = () => {
    setStatus("all");
    setSource("all");
    setPage(1);
  };

  return (
    <SectionCard title={t("logsTitle")} icon={ScrollText}>
      <div className="panel-body flex flex-wrap items-center gap-2">
        <p className="basis-full text-sm text-muted-foreground">{t("logsDesc")}</p>
        <Select value={status} onValueChange={changeStatus}>
          <SelectTrigger className="w-44" aria-label={t("filterStatus")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{statusLabel(s, t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={changeSource}>
          <SelectTrigger className="w-44" aria-label={t("filterSource")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSources")}</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s, t)}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered && (
          <Button type="button" size="dense" variant="ghost" onClick={clearFilters}>{tc("clear")}</Button>
        )}
      </div>
      <div className="border-t border-border/40">
        {failed ? (
          <div className="p-4"><ErrorState description={t("logsError")} onRetry={() => setReloadKey((k) => k + 1)} /></div>
        ) : empty ? (
          <div className="p-4"><EmptyState icon={ScrollText} title={filtered ? t("noLogsFiltered") : t("noLogs")} /></div>
        ) : (
          <Table className="responsive-card-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colTime")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colTo")}</TableHead>
                <TableHead>{t("colKind")}</TableHead>
                <TableHead>{t("colTemplate")}</TableHead>
                <TableHead>{t("colSource")}</TableHead>
                <TableHead>{t("colDetail")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={7} />
              ) : (
                logs.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.sentAt, undefined, locale)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${statusTone(log.status)}`}>
                        {log.status === "failed" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                        {statusLabel(log.status, t)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{log.to}</TableCell>
                    <TableCell>{log.kind === "template" ? t("kindTemplate") : t("kindText")}</TableCell>
                    <TableCell className="break-all font-mono text-xs" dir="ltr">{log.templateName ?? "—"}</TableCell>
                    <TableCell>{sourceLabel(log.source, t)}</TableCell>
                    <TableCell className="max-w-[260px]">{detailOf(log, t)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
      {!failed && !empty && (
        <PaginationControls
          className="border-t border-border/40 p-3"
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      )}
    </SectionCard>
  );
}
