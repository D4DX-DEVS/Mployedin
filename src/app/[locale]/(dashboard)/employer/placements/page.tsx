"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Briefcase, TrendingUp, Inbox, CircleCheckBig, ClipboardList } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import { usePlacements, type Placement } from "@/hooks/usePlacements";
import type { ExportColumn } from "@/lib/export";

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
  const [filter, setFilter] = useState("all");
  const [visaFilter, setVisaFilter] = useState("all");

  const { data, isLoading: loading, error, refetch } = usePlacements({ page, limit, status: filter, visaStatus: visaFilter });
  const placements = data?.placements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Compute stats from API-level statusCounts (accurate totals across all pages)
  const statusCounts = data?.statusCounts;
  const stats = useMemo(() => {
    return {
      total,
      active: statusCounts?.active ?? 0,
      completed: statusCounts?.completed ?? 0,
      thisMonth: placements.filter((p) => {
        const now = new Date();
        const d = new Date(p.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [statusCounts, total, placements]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("candidate"), key: "candidateName", formatter: (v) => String(v ?? t("candidateFallback")) },
    { header: t("position"), key: "jobTitle", formatter: (v) => String(v ?? t("untitledRole")) },
    { header: t("type"), key: "type", formatter: (v) => String(v ?? "\u2014") },
    { header: t("salary"), key: "salary", formatter: (_v, r) => { const p = r as Record<string, any>; if (!p.salary) return t("notDisclosed"); return `${p.salary.currency} ${p.salary.amount?.toLocaleString()}`; } },
    { header: t("status"), key: "status", formatter: (v) => String(v ?? "\u2014") },
    { header: t("startDate"), key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : t("notSet") },
    { header: t("created"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "\u2014" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "placements",
    title: "Placements",
  });

  function formatDate(value?: string): string {
    if (!value) return t("notSet");
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSalary(placement: Placement): string {
    if (!placement.salary || placement.salary.amount == null) return t("notDisclosed");
    return `${placement.salary.currency} ${placement.salary.amount.toLocaleString()}`;
  }

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, visaFilter]);

  return (
    <div className="page-container space-y-3 sm:space-y-6">
      <DashboardPageHeader
        icon={ClipboardList}
        eyebrow={t("totalHired")}
        title={t("totalHired")}
        metrics={[
          { label: t("totalHired"), value: stats.total, note: t("totalHiredNote"), icon: Users },
          { label: t("currentlyActive"), value: stats.active, note: t("currentlyActiveNote"), icon: Briefcase },
          { label: t("completed"), value: stats.completed, note: t("completedNote"), icon: CircleCheckBig },
          { label: t("thisMonth"), value: stats.thisMonth, note: t("thisMonthNote"), icon: TrendingUp },
        ]}
      />

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterOutcomes")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filterTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("filterDescription")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "active", "completed", "terminated"] as const).map((statusOption) => {
              const labelMap = { all: "filterAll", active: "filterActive", completed: "filterCompleted", terminated: "filterTerminated" } as const;
              return (
              <Button
                key={statusOption}
                onClick={() => setFilter(statusOption)}
                variant="ghost"
                size="sm"
                className={filter === statusOption
                  ? "rounded-full bg-primary px-4 text-white hover:bg-primary/90"
                  : "rounded-full border border-border bg-background/80 px-4 text-muted-foreground hover:bg-background"
                }
              >
                {t(labelMap[statusOption])}
              </Button>
              );
            })}
          </div>
        </div>
        {/* Visa status filter (GCC) */}
        <div className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterVisaTitle")}</p>
          <div className="flex flex-wrap gap-2">
            {(["all", "not_required", "pending", "approved", "rejected", "stamped"] as const).map((visaOption) => {
              const visaLabelMap = { all: "visaAll", not_required: "visaNotRequired", pending: "visaPending", approved: "visaApproved", rejected: "visaRejected", stamped: "visaStamped" } as const;
              return (
                <Button
                  key={visaOption}
                  onClick={() => setVisaFilter(visaOption)}
                  variant="ghost"
                  size="sm"
                  className={visaFilter === visaOption
                    ? "rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700 hover:text-white"
                    : "rounded-full border border-border bg-background/80 px-4 text-muted-foreground hover:bg-background"
                  }
                >
                  {t(visaLabelMap[visaOption])}
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? (
        <section className="workspace-panel-surface rounded-[28px] border border-red-500/20 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-status-rejected">{t("placementList")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("unableToLoad")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : t("loadError")}
              </p>
            </div>
            <Button className="h-11 rounded-xl px-4 text-sm font-semibold" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </div>
        </section>
      ) : (
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("placementList")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("tableTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("tableDescription")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{t("placementsOnPage", { count: placements.length })}</p>
        </div>

        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />

        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[220px]">{t("candidate")}</TableHead>
                <TableHead className="min-w-[220px]">{t("position")}</TableHead>
                <TableHead>{t("startDate")}</TableHead>
                <TableHead>{t("salary")}</TableHead>
                <TableHead className="text-right">{t("onboardingColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : placements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center">
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
                      <StatusBadge status={placement.status} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">{placement.jobTitle ?? t("untitledRole")}</p>
                      {placement.type ? (
                        <span className="inline-flex rounded-full bg-secondary/75 px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground dark:bg-secondary/75 dark:text-muted-foreground">
                          {placement.type}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(placement.startDate)}</TableCell>
                  <TableCell className="font-medium text-foreground">{formatSalary(placement)}</TableCell>
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
