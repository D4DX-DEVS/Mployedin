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
import { Users, Briefcase, Inbox, CircleCheckBig, ClipboardList, ChevronDown } from "lucide-react";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
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

  const { data, isLoading: loading, error, refetch } = usePlacements({ page, limit, status: filter, visaStatus: visaFilter });
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
    { header: t("type"), key: "type", formatter: (v) => String(v ?? "\u2014") },
    { header: t("salary"), key: "salary", formatter: (_v, r) => { const p = r as Record<string, any>; if (!p.salary) return t("notDisclosed"); return `${p.salary.currency} ${formatCount(p.salary.amount)}`; } },
    { header: t("status"), key: "status", formatter: (v) => String(v ?? "\u2014") },
    { header: t("startDate"), key: "startDate", formatter: (v) => v ? formatIntlDate(new Date(String(v))) : t("notSet") },
    { header: t("created"), key: "createdAt", formatter: (v) => v ? formatIntlDate(new Date(String(v))) : "\u2014" },
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
      month: "short",
      day: "numeric",
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
     
  }, [filter, visaFilter]);

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
        <section className="workspace-panel-surface rounded-3xl border border-red-500/20 panel-body">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-status-rejected">{t("placementList")}</p>
              <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("unableToLoad")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("loadError")}
              </p>
            </div>
            <Button size="lg" className="rounded-xl px-4 text-sm font-semibold" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </div>
        </section>
      ) : (
      <>
      <div className="workspace-toolbar">
        <SearchableSelect
          className="workspace-toolbar-select h-11 rounded-xl border-border bg-background sm:h-10"
          options={STATUS_OPTIONS}
          value={filter}
          onValueChange={setFilter}
          placeholder={t("filterAll")}
        />
        <SearchableSelect
          className="workspace-toolbar-select h-11 rounded-xl border-border bg-background sm:h-10"
          options={VISA_OPTIONS}
          value={visaFilter}
          onValueChange={setVisaFilter}
          placeholder={t("visaAll")}
        />
        <TableToolbar
          className="ms-auto"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        />
      </div>

      <section className="workspace-panel-surface rounded-2xl panel-body">
        <div className="flex items-center gap-1.5 border-b border-border pb-3">
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
          <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-10 text-center sm:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-status-applied-bg text-status-applied">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("noPlacementsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("noPlacementsDesc")}</p>
            </div>
          </div>
        ) : null}

        <ul className="mt-3 space-y-1.5 sm:hidden">
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

        <div className="mt-5 hidden overflow-x-auto rounded-3xl border border-border/60 sm:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[220px]">{t("candidate")}</TableHead>
                <TableHead className="min-w-[220px]">{t("position")}</TableHead>
                <TableHead>{t("startDate")}</TableHead>
                <TableHead>{t("salary")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("onboardingColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : placements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-status-applied-bg text-status-applied">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{t("noPlacementsTitle")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("noPlacementsDesc")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((placement) => (
                <TableRow key={placement._id} className="bg-transparent">
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{placement.candidateName ?? t("candidateFallback")}</p>
                      <p className="text-xs text-muted-foreground">{placement.candidateEmail ?? t("noEmail")}</p>
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
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm" className="rounded-xl">
                        <Link href={`/${locale}/employer/placements/${placement._id}`}>
                          {t("viewDetails")}
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="rounded-xl">
                        <Link href={`/${locale}/employer/placements/${placement._id}/onboarding`}>
                          <ClipboardList className="mr-2 h-4 w-4" />
                          {t("onboardingColumn")}
                        </Link>
                      </Button>
                    </div>
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
