"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  FileText, TrendingUp,
  CheckCircle2, Star, BriefcaseBusiness, Mail, Calendar,
} from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicationItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  agentName?: string;
  status: string;
  matchScore?: number;
  appliedAt: string;
  source?: string;
}

interface Filters extends Record<string, string> {
  search: string;
  status: string;
  agent: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all", agent: "all" };

const getStatusOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "all", label: t("statusOptions.all") },
  { value: "applied", label: t("statusOptions.applied") },
  { value: "shortlisted", label: t("statusOptions.shortlisted") },
  { value: "interview_scheduled", label: t("statusOptions.interviewScheduled") },
  { value: "selected", label: t("statusOptions.selected") },
  { value: "offer", label: t("statusOptions.offer") },
  { value: "hired", label: t("statusOptions.hired") },
  { value: "rejected", label: t("statusOptions.rejected") },
  { value: "withdrawn", label: t("statusOptions.withdrawn") },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentApplicationsPage() {
  const t = useTranslations("superAgentApplications");
  const tc = useTranslations("common");
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [agentOptions, setAgentOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: t("allAgentsPlaceholder") }]);
  const [stats, setStats] = useState({ total: 0, shortlisted: 0, hired: 0, conversionRate: 0 });
  const pagination = usePagination();

  const { filters, setFilter, resetFilters } = useUrlFilters(
    INITIAL_FILTERS,
    { debounceKeys: ["search"], debounceMs: 400 }
  );

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = pagination.paginationParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.agent !== "all") params.set("agent", filters.agent);

      const res = await fetch(`/api/super-agent/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
        if (data.agents) {
          setAgentOptions([
            { value: "all", label: t("allAgentsPlaceholder") },
            ...data.agents.map((a: { _id: string; name: string }) => ({ value: a._id, label: a.name })),
          ]);
        }
      } else {
        setLoadFailed(true);
      }
    } catch {
      toast.error(t("loadError"));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  // The bare `pagination` that used to close this list rebuilt the callback on
  // every render, and the effect below re-ran with it — the page refetched in a
  // loop for as long as it was open. The two values the request reads are
  // already listed individually.
  }, [filters, pagination.page, pagination.limit, t]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const statusLabel = (status: string) => getStatusOptions(t).find((o) => o.value === status)?.label ?? status;
  const exportColumns: ExportColumn<ApplicationItem>[] = [
    { header: t("tableHeaders.candidate"), key: "candidateName" },
    { header: tc("email"), key: "candidateEmail" },
    { header: t("tableHeaders.job"), key: "jobTitle", formatter: (_v, row) => [row.jobTitle, row.companyName].filter(Boolean).join(" · ") },
    { header: t("tableHeaders.agent"), key: "agentName" },
    { header: t("tableHeaders.status"), key: "status", formatter: (_v, row) => statusLabel(row.status) },
    { header: t("tableHeaders.matchScore"), key: "matchScore", formatter: (_v, row) => row.matchScore != null ? `${row.matchScore}%` : "" },
    { header: t("tableHeaders.source"), key: "source", formatter: (_v, row) => (row.source ?? "direct").replace(/_/g, " ") },
    { header: t("tableHeaders.applied"), key: "appliedAt", formatter: (_v, row) => formatListDate(row.appliedAt) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-applications",
    title: t("pageTitle"),
  });

  const metrics = [
    { label: t("metrics.totalApplications"), value: stats.total, icon: FileText },
    { label: t("metrics.shortlisted"), value: stats.shortlisted, icon: Star },
    { label: t("metrics.hired"), value: stats.hired, icon: CheckCircle2 },
    { label: t("metrics.conversionRate"), value: `${stats.conversionRate}%`, icon: TrendingUp },
  ];

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={metrics}
        compact
      />

      {/* No section heading: it repeated the page title directly under the header. */}
      <SuperAgentSection>
        <InlineFilterBar
          className="mb-4"
          onClear={(filters.search || filters.status !== "all" || filters.agent !== "all") ? () => { resetFilters(); pagination.resetPage(); } : undefined}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        >
          <InlineFilterSearch
            value={filters.search}
            onChange={(v) => { setFilter("search", v); pagination.resetPage(); }}
            placeholder={t("searchPlaceholder")}
          />
          <SearchableSelect
            options={getStatusOptions(t)}
            value={filters.status}
            onValueChange={(v) => { setFilter("status", v); pagination.resetPage(); }}
            placeholder={t("statusPlaceholder")}
            className={INLINE_FILTER_CONTROL}
          />
          <SearchableSelect
            options={agentOptions}
            value={filters.agent}
            onValueChange={(v) => { setFilter("agent", v); pagination.resetPage(); }}
            placeholder={t("allAgentsPlaceholder")}
            className={INLINE_FILTER_CONTROL}
          />
        </InlineFilterBar>

        {loadFailed && !loading ? (
          <ErrorState onRetry={() => fetchApplications()} />
        ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[180px]">{t("tableHeaders.candidate")}</TableHead>
                <TableHead className="min-w-[180px]">{t("tableHeaders.job")}</TableHead>
                <TableHead>{t("tableHeaders.matchScore")}</TableHead>
                <TableHead>{t("tableHeaders.source")}</TableHead>
                <TableHead>{t("tableHeaders.applied")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={5} />
              ) : applications.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <EmptyState title={t("emptyState.title")} description={t("emptyState.subtitle")} icon={FileText} />
                  </TableCell>
                </TableRow>
              ) : applications.map((a) => (
                <TableRow key={a._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={a.candidateName} email={a.candidateEmail} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">{a.candidateName}</p>
                        {a.candidateEmail && (
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{a.candidateEmail}</span>
                          </p>
                        )}
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid w-full min-w-0 gap-0.5">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                        <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{a.jobTitle}</span>
                      </p>
                      {a.companyName && <p className="text-xs text-muted-foreground truncate">{a.companyName}</p>}
                      {a.agentName && <p className="text-xs text-muted-foreground truncate">{a.agentName}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.matchScore != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-12 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${a.matchScore >= 80 ? "bg-emerald-500" : a.matchScore >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${a.matchScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{a.matchScore}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{(a.source ?? "direct").replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {formatListDate(a.appliedAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </SuperAgentSection>

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
