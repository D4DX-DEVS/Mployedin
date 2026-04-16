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

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Placements</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Track each hire through to start date and keep a clear view of the compensation value tied to successful placements.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Placement book</p><p className="mt-1 text-lg font-semibold text-slate-950">{pagination.total} records</p><p className="text-xs text-slate-500">Confirmed placement activity across your managed roles.</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{completedPlacements}</p><p className="mt-1 text-xs text-slate-500">Placements that reached a finished hiring outcome.</p></div><div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600"><UserCheck className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Offer stage</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{signedOffers}</p><p className="mt-1 text-xs text-slate-500">Placements still sitting around offer confirmation.</p></div><div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600"><BriefcaseBusiness className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start dates</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{startedCount}</p><p className="mt-1 text-xs text-slate-500">Placements with a confirmed onboarding date.</p></div><div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600"><ArrowRight className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Salary value</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{totalCompensation.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Combined visible compensation across current results.</p></div><div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600"><CircleDollarSign className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Review every active and historical placement record</h2></div><div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"><ArrowRight className="h-3.5 w-3.5 text-sky-600" />{pagination.total} placements across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
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
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <span className="text-sm">No placements yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id} className="hover:bg-slate-50/70">
                <TableCell className="font-medium text-slate-950">{p.jobSeekerId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-slate-700">{p.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-slate-500">{p.employerId?.companyName ?? "—"}</TableCell>
                <TableCell className="text-slate-500">
                  {p.salary ? `${p.currency ?? "USD"} ${p.salary.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-slate-500">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</TableCell>
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
