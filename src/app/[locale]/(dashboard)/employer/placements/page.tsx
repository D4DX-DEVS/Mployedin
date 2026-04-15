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
import { usePermissions } from "@/hooks/usePermissions";
import { usePlacements, type Placement } from "@/hooks/usePlacements";

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

  // Compute stats from current page (best effort)
  const stats = useMemo(() => {
    const now = new Date();
    return {
      total,
      active: placements.filter((p) => p.status === "active").length,
      completed: placements.filter((p) => p.status === "completed").length,
      thisMonth: placements.filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [placements, total]);

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
    <div className="page-container space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-6 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.35)] sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Placement workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
              Track hiring outcomes in a cleaner placement dashboard.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Keep completed hires, active placements, and recent wins visible without burying the result data inside a plain reporting table.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{stats.total} tracked placements</p>
              <p className="text-xs text-slate-500">Live placements, finished outcomes, and recent starts together.</p>
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
            <div key={label} className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-500">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter outcomes</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Focus on active, completed, or terminated placements.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
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
                  : "rounded-full border border-slate-200 bg-white px-4 text-slate-600 hover:bg-slate-50"
                }
              >
                {statusOption}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[28px] border border-red-200 bg-white p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Placement list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Unable to load placements right now</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {error instanceof Error ? error.message : "The placement workspace could not load. Try again in a moment."}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </section>
      ) : (
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Placement list</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Review the hires that have already crossed the line.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Candidate identity, job context, placement type, compensation, and status stay visible in one refined results table.
            </p>
          </div>
          <p className="text-sm text-slate-500">{placements.length} placements on this page</p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
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
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></TableCell>
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
                        <p className="text-base font-semibold text-slate-950">No placements in this view yet</p>
                        <p className="mt-1 text-sm text-slate-500">Completed hires and live placements will appear here once candidates reach the finish line.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : placements.map((placement) => (
                <TableRow key={placement._id} className="bg-white">
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{placement.candidateName ?? "Candidate"}</p>
                      <p className="text-xs text-slate-500">{placement.candidateEmail ?? "No email available"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <p className="font-medium text-slate-900">{placement.jobTitle ?? "Untitled role"}</p>
                      {placement.type ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-slate-600">
                          {placement.type}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDate(placement.startDate)}</TableCell>
                  <TableCell className="font-medium text-slate-900">{formatSalary(placement)}</TableCell>
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
