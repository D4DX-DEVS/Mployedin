"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Briefcase, Inbox, CircleCheckBig, ClipboardList, ChevronDown, Eye } from "lucide-react";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useTableExport } from "@/hooks/useTableExport";
import { usePlacements, type Placement } from "@/hooks/usePlacements";
import type { ExportColumn } from "@/lib/export";
import { formatCount, formatDate as formatIntlDate } from "@/lib/ui/intlFormat";

const PLACEMENT_STATUSES = ["active", "completed", "terminated"] as const;
const VISA_STATUSES = ["not_required", "pending", "approved", "rejected", "stamped"] as const;

export default function EmployerPlacementsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations("employerPlacements");

  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  const [expandedPlacementId, setExpandedPlacementId] = useState<string | null>(null);
  const [filter, setFilter] = useUrlFilter("status", "all", { allow: PLACEMENT_STATUSES });
  const [visaFilter, setVisaFilter] = useUrlFilter("visa", "all", { allow: VISA_STATUSES });
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "startDate", "salary"] as unknown as string[] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] as unknown as string[] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
    setPage(1);
  };

  const STATUS_OPTIONS = [
    { value: "all", label: t("filterAll") },
    { value: "active", label: t("filterActive") },
    { value: "completed", label: t("filterCompleted") },
    { value: "terminated", label: t("filterTerminated") },
  ];
  const VISA_OPTIONS = [
    { value: "all", label: t("visaAll") },
    { value: "not_required", label: t("visaNotRequired") },
    { value: "pending", label: t("visaPending") },
    { value: "approved", label: t("visaApproved") },
    { value: "rejected", label: t("visaRejected") },
    { value: "stamped", label: t("visaStamped") },
  ];

  const { data, isLoading: loading, error, refetch } = usePlacements({ page, limit, status: filter, visaStatus: visaFilter, sortBy, sortOrder });
  const placements = data?.placements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Compute stats from API-level statusCounts (accurate totals across all pages)
  // Only API-wide counts here. A "this month" tile computed from the current
  // page counted one page of results and read as a global total.
  const statusCounts = data?.statusCounts;
  const stats = useMemo(() => ({
    total,
    active: statusCounts?.active ?? 0,
    completed: statusCounts?.completed ?? 0,
  }), [statusCounts, total]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("candidate"), key: "candidateName", formatter: (v) => String(v ?? t("candidateFallback")) },
    { header: t("position"), key: "jobTitle", formatter: (v) => String(v ?? t("untitledRole")) },
    { header: t("type"), key: "type", formatter: (v) => String(v ?? "—") },
    { header: t("salary"), key: "salary", formatter: (_v, r) => { const p = r as Record<string, any>; if (!p.salary) return t("notDisclosed"); return `${p.salary.currency} ${formatCount(p.salary.amount)}`; } },
    { header: t("status"), key: "status", formatter: (v) => String(v ?? "—") },
    { header: t("startDate"), key: "startDate", formatter: (v) => v ? formatIntlDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : t("notSet") },
    { header: t("created"), key: "createdAt", formatter: (v) => v ? formatIntlDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "placements",
    title: "Placements",
  });

  function formatDate(value?: string): string {
    if (!value) return t("notSet");
    return formatIntlDate(new Date(value), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatSalary(placement: Placement): string {
    if (!placement.salary || placement.salary.amount == null) return t("notDisclosed");
    return `${placement.salary.currency} ${formatCount(placement.salary.amount)}`;
  }

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
     
  }, [filter, visaFilter, sortBy, sortOrderParam]);

  return (
    <div className="page-container">
      {/* Pattern A (compact workspace): title, context line and the three
          API-wide totals; filters and export sit in the list toolbar. */}
      <WorkspaceHeader
        title={t("workspace")}
        context={t("subtitle")}
        metrics={[
          { label: t("totalHired"), value: stats.total, icon: Users, tone: "primary" },
          { label: t("currentlyActive"), value: stats.active, icon: Briefcase, tone: "success" },
          { label: t("completed"), value: stats.completed, icon: CircleCheckBig, tone: "info" },
        ]}
      />

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <>
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={STATUS_OPTIONS}
          value={filter}
          onValueChange={setFilter}
          placeholder={t("filterAll")}
        />
        <SearchableSelect
          className={INLINE_FILTER_CONTROL}
          options={VISA_OPTIONS}
          value={visaFilter}
          onValueChange={setVisaFilter}
          placeholder={t("visaAll")}
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="flex items-center gap-1.5 border-b border-border px-4 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("placementList")}</p>
          {/* Privacy info at the point candidate data is shown, compacted to
              an icon + popover to keep the list above the fold. */}
          <CandidateDataNotice variant="candidateList" compact />
        </div>

        {/* Phones get compact expandable rows — the shared <Table> stacks every
            cell into a labelled block, which made one placement fill the screen. */}
        {/* The empty state lived only in the desktop table, so a phone with no
            placements got a blank panel and no next step. */}
        {placements.length === 0 ? (
          <div className="mx-4 mt-3 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-10 text-center sm:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-status-applied-bg text-status-applied">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("noPlacementsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("noPlacementsDesc")}</p>
            </div>
          </div>
        ) : null}

        <ul className="mt-3 space-y-1.5 px-4 sm:hidden">
          {placements.map((placement) => {
            const isOpen = expandedPlacementId === placement._id;
            return (
              <li key={placement._id} className="rounded-xl border border-border/60 bg-background/70">
                <button
                  type="button"
                  onClick={() => setExpandedPlacementId(isOpen ? null : placement._id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {placement.candidateName ?? t("candidateFallback")}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {placement.jobTitle ?? t("untitledRole")}
                    </p>
                  </div>
                  <StatusBadge status={placement.status} />
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-border/60 px-2.5 py-2 text-[11px]">
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <dt className="text-muted-foreground">{t("startDate")}</dt>
                      <dd className="text-end text-foreground">{formatDate(placement.startDate)}</dd>
                      <dt className="text-muted-foreground">{t("salary")}</dt>
                      <dd className="text-end font-medium text-foreground">{formatSalary(placement)}</dd>
                    </dl>
                    <p className="mt-1 truncate text-muted-foreground">{placement.candidateEmail ?? t("noEmail")}</p>
                    {placement.type ? (
                      <span className="mt-1.5 inline-flex rounded-full bg-secondary/75 px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                        {placement.type}
                      </span>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <Button asChild variant="outline" size="dense" className="flex-1 rounded-lg text-[11px] font-semibold">
                        <Link href={`/${locale}/employer/placements/${placement._id}`}>{t("viewDetails")}</Link>
                      </Button>
                      <Button asChild variant="outline" size="dense" className="flex-1 rounded-lg text-[11px] font-semibold">
                        <Link href={`/${locale}/employer/placements/${placement._id}/onboarding`}>
                          <ClipboardList className="me-1 h-3.5 w-3.5" />
                          {t("onboardingColumn")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[220px]">{t("candidate")}</TableHead>
                <TableHead className="min-w-[220px]">{t("position")}</TableHead>
                <TableHead>
                  <SortableTableHeader label={t("startDate")} active={sortBy === "startDate"} order={sortOrder} onClick={() => sortByColumn("startDate")} />
                </TableHead>
                <TableHead>
                  <SortableTableHeader label={t("salary")} active={sortBy === "salary"} order={sortOrder} onClick={() => sortByColumn("salary")} />
                </TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("onboardingColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={6} />
              ) : placements.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState title={t("noPlacementsTitle")} description={t("noPlacementsDesc")} icon={Inbox} />
                  </TableCell>
                </TableRow>
              ) : placements.map((placement) => (
                <TableRow key={placement._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={placement.candidateName} email={placement.candidateEmail} className="h-9 w-9" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-semibold text-foreground">{placement.candidateName ?? t("candidateFallback")}</p>
                        <p className="truncate text-xs text-muted-foreground">{placement.candidateEmail ?? t("noEmail")}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">{placement.jobTitle ?? t("untitledRole")}</p>
                      {placement.type ? (
                        <span className="inline-flex rounded-full bg-secondary/75 px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                          {placement.type}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(placement.startDate)}</TableCell>
                  <TableCell className="font-medium text-foreground">{formatSalary(placement)}</TableCell>
                  <TableCell><StatusBadge status={placement.status} /></TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      name={placement.candidateName ?? t("candidateFallback")}
                      quick={[
                        { key: "view", label: t("viewDetails"), icon: Eye, href: `/${locale}/employer/placements/${placement._id}` },
                      ]}
                      menu={[
                        { key: "onboarding", label: t("onboardingColumn"), icon: ClipboardList, href: `/${locale}/employer/placements/${placement._id}/onboarding` },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      </>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
}
