"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, Inbox, Sparkles, UserCheck } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Placement {
  _id: string;
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  status: string;
  salary?: number;
  currency?: string;
  startDate?: string;
  createdAt: string;
}

export default function AgentPlacementsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    const res = await fetch(`/api/placements?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPlacements(data.items ?? data.placements ?? []);
      pagination.updateTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit]);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

  const completedPlacements = placements.filter((placement) => placement.status === "completed" || placement.status === "hired").length;
  const signedOffers = placements.filter((placement) => placement.status === "offer" || placement.status === "signed").length;
  const startedCount = placements.filter((placement) => Boolean(placement.startDate)).length;
  const totalCompensation = placements.reduce((sum, placement) => sum + (placement.salary ?? 0), 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Candidate", key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { fullName?: string })?.fullName ?? "" },
    { header: "Job", key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: "Employer", key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string })?.companyName ?? "" },
    { header: "Salary", key: "salary" },
    { header: "Currency", key: "currency" },
    { header: "Status", key: "status" },
    { header: "Start Date", key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-placements",
    title: "Agent Placements",
  });

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Placements</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Track each hire through to start date and keep a clear view of the compensation value tied to successful placements.</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placement book</p><p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} records</p><p className="text-xs text-muted-foreground">Confirmed placement activity across your managed roles.</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Completed</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{completedPlacements}</p><p className="mt-1 text-xs text-muted-foreground">Placements that reached a finished hiring outcome.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><UserCheck className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Offer stage</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{signedOffers}</p><p className="mt-1 text-xs text-muted-foreground">Placements still sitting around offer confirmation.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><BriefcaseBusiness className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start dates</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{startedCount}</p><p className="mt-1 text-xs text-muted-foreground">Placements with a confirmed onboarding date.</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><ArrowRight className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Salary value</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{totalCompensation.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Combined visible compensation across current results.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><CircleDollarSign className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review every active and historical placement record</h2></div><div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{pagination.total} placements across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>Candidate</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : placements.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">No placements yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id} className="hover:bg-secondary/50">
                <TableCell className="font-medium text-foreground">{p.jobSeekerId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-foreground/80">{p.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.employerId?.companyName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.salary ? `${p.currency ?? "USD"} ${p.salary.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-muted-foreground">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
