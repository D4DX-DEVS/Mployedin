"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Briefcase, TrendingUp, Inbox, Sparkles, ArrowRight, CircleCheckBig } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { usePlacements, type Placement } from "@/hooks/usePlacements";
import type { ExportColumn } from "@/lib/export";

export default function EmployerPlacementsPage() {
  const { locale } = useParams<{ locale: string }>();
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
    { header: "Candidate", key: "candidateName", formatter: (v) => String(v ?? "Candidate") },
    { header: "Position", key: "jobTitle", formatter: (v) => String(v ?? "Untitled role") },
    { header: "Type", key: "type", formatter: (v) => String(v ?? "—") },
    { header: "Salary", key: "salary", formatter: (_v, r) => { const p = r as Record<string, any>; if (!p.salary) return "Not disclosed"; return `${p.salary.currency} ${p.salary.amount?.toLocaleString()}`; } },
    { header: "Status", key: "status", formatter: (v) => String(v ?? "—") },
    { header: "Start Date", key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "Not set" },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "placements",
    title: "Placements",
  });

  function formatDate(value?: string): string {
    if (!value) return "Not set";
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSalary(placement: Placement): string {
    if (!placement.salary) return "Not disclosed";
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
              Placement workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Track hiring outcomes in a cleaner placement dashboard.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep completed hires, active placements, and recent wins visible without burying the result data inside a plain reporting table.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{stats.total} tracked placements</p>
              <p className="text-xs text-muted-foreground">Live placements, finished outcomes, and recent starts together.</p>
            </div>
            <Button
              asChild
              className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Link href={`/${locale}/employer/analytics`}>
                Open Analytics
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total hired",
              value: stats.total,
              note: "Placements currently visible in the result set.",
              icon: Users,
              tone: "text-sky-600",
              chip: "bg-sky-50",
            },
            {
              label: "Currently active",
              value: stats.active,
              note: "Active placements shown in the current result set.",
              icon: Briefcase,
              tone: "text-emerald-600",
              chip: "bg-emerald-50",
            },
            {
              label: "Completed",
              value: stats.completed,
              note: "Completed placements visible on this page.",
              icon: CircleCheckBig,
              tone: "text-violet-600",
              chip: "bg-violet-50",
            },
            {
              label: "This month",
              value: stats.thisMonth,
              note: "This month inside the current result set.",
              icon: TrendingUp,
              tone: "text-amber-600",
              chip: "bg-amber-50",
            },
          ].map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter outcomes</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Focus on active, completed, or terminated placements.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              The placement API currently supports status filtering, so these segmented controls map directly to the backend without inventing extra reporting logic.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {["all", "active", "completed", "terminated"].map((statusOption) => (
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
                {statusOption}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <section className="workspace-panel-surface rounded-[28px] border border-red-500/20 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Placement list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Unable to load placements right now</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : "The placement workspace could not load. Try again in a moment."}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </section>
      ) : (
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placement list</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review the hires that have already crossed the line.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Candidate identity, job context, placement type, compensation, and status stay visible in one refined results table.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{placements.length} placements on this page</p>
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
                <TableHead className="min-w-[220px]">Candidate</TableHead>
                <TableHead className="min-w-[220px]">Position</TableHead>
                <TableHead>Start date</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
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
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No placements in this view yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Completed hires and live placements will appear here once candidates reach the finish line.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((placement) => (
                <TableRow key={placement._id} className="bg-transparent">
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{placement.candidateName ?? "Candidate"}</p>
                      <p className="text-xs text-muted-foreground">{placement.candidateEmail ?? "No email available"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">{placement.jobTitle ?? "Untitled role"}</p>
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
