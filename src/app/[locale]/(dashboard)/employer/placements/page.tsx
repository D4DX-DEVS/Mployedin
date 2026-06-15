"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Briefcase, TrendingUp, Inbox, Sparkles, ArrowRight, CircleCheckBig, ClipboardList } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { usePlacements, type Placement } from "@/hooks/usePlacements";
import type { ExportColumn } from "@/lib/export";

export default function EmployerPlacementsPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("employerPlacements");
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filter, setFilter] = useState("all");

  const { data, isLoading: loading, error, refetch } = usePlacements({ page, limit, status: filter });
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

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [filter]);

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("workspace")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currentResults")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{t("trackedPlacements", { count: stats.total })}</p>
              <p className="text-xs text-muted-foreground">{t("trackedPlacementsDesc")}</p>
            </div>
            <Button
              asChild
              className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Link href={`/${locale}/employer/analytics`}>
                {t("openAnalytics")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              labelKey: "totalHired" as const,
              value: stats.total,
              noteKey: "totalHiredNote" as const,
              icon: Users,
              tone: "text-sky-600",
              chip: "bg-sky-50",
            },
            {
              labelKey: "currentlyActive" as const,
              value: stats.active,
              noteKey: "currentlyActiveNote" as const,
              icon: Briefcase,
              tone: "text-emerald-600",
              chip: "bg-emerald-50",
            },
            {
              labelKey: "completed" as const,
              value: stats.completed,
              noteKey: "completedNote" as const,
              icon: CircleCheckBig,
              tone: "text-violet-600",
              chip: "bg-violet-50",
            },
            {
              labelKey: "thisMonth" as const,
              value: stats.thisMonth,
              noteKey: "thisMonthNote" as const,
              icon: TrendingUp,
              tone: "text-amber-600",
              chip: "bg-amber-50",
            },
          ].map(({ labelKey, value, noteKey, icon: Icon, tone, chip }) => (
            <div key={labelKey} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(labelKey)}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{t(noteKey)}</p>
            </div>
          ))}
        </div>
      </section>

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
                  ? "rounded-full bg-sky-600 px-4 text-white hover:bg-sky-700 hover:text-white"
                  : "rounded-full border border-border bg-background/80 px-4 text-muted-foreground hover:bg-background"
                }
              >
                {t(labelMap[statusOption])}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">{t("placementList")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("unableToLoad")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : t("loadError")}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </div>
        </section>
      ) : (
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
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
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
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
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                          {placement.type}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(placement.startDate)}</TableCell>
                  <TableCell className="font-medium text-foreground">{formatSalary(placement)}</TableCell>
                  <TableCell><StatusBadge status={placement.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm" className="rounded-xl">
                      <Link href={`/${locale}/employer/placements/${placement._id}/onboarding`}>
                        <ClipboardList className="mr-2 h-4 w-4" />
                        {t("onboardingColumn")}
                      </Link>
                    </Button>
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
