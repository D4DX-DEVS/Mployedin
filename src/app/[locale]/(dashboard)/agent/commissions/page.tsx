"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Clock, DollarSign, Inbox, Loader2, Sparkles, TrendingUp } from "lucide-react";

interface Commission {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  placementId?: { jobTitle?: string; candidateName?: string };
  createdAt: string;
  paidAt?: string;
}

interface Summary {
  pending: number;
  approved: number;
  paid: number;
  currency: string;
}

export default function AgentCommissionsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/commissions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.commissions ?? []);
        setSummary(data.summary ?? null);
        pagination.updateTotal(data.total ?? data.commissions?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, pagination.page, pagination.limit]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  useEffect(() => { pagination.resetPage(); }, [filter]);

  const statusColor = (status: string) => {
    if (status === "paid") return "text-green-600";
    if (status === "approved") return "text-blue-600";
    return "text-amber-600";
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">My Commissions</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Track the earnings created by successful placements and quickly separate pending payouts from already paid commission lines.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ledger</p><p className="mt-1 text-lg font-semibold text-slate-950">{pagination.total} commission records</p><p className="text-xs text-slate-500">Financial activity tied to your placement outcomes.</p></div>
        </div>
        {summary && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Pending", value: summary.pending, color: "text-amber-600", tone: "bg-amber-50", icon: Clock },
              { label: "Approved", value: summary.approved, color: "text-blue-600", tone: "bg-sky-50", icon: TrendingUp },
              { label: "Paid", value: summary.paid, color: "text-green-600", tone: "bg-emerald-50", icon: DollarSign },
            ].map(({ label, value, color, tone, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p><p className={`mt-3 text-2xl font-semibold tracking-tight ${color}`}>{summary.currency} {value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Current {label.toLowerCase()} commission value.</p></div><div className={`rounded-2xl p-2.5 ${tone} ${color}`}><Icon className="h-5 w-5" /></div></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter ledger</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Switch between payout states without leaving the page</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {["all", "pending", "approved", "paid"].map((status) => {
            const isSelected = filter === status;
            return (
              <Button
                key={status}
                onClick={() => setFilter(status)}
                size="sm"
                variant="outline"
                className={isSelected
                  ? "h-10 rounded-xl border-sky-200 bg-sky-50 px-4 text-sky-700 hover:bg-sky-100 capitalize"
                  : "h-10 rounded-xl border-slate-200 bg-slate-50 px-4 text-slate-600 hover:bg-white capitalize"
                }
              >
                {status}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Review each commission line and its payment state</h2></div><div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"><ArrowRight className="h-3.5 w-3.5 text-sky-600" />{pagination.total} commissions across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead>Placement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : commissions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <span className="text-sm">No commissions yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id} className="hover:bg-slate-50/70">
                <TableCell>
                  <p className="font-medium text-slate-950">{c.placementId?.jobTitle ?? "Placement"}</p>
                  {c.placementId?.candidateName && (
                    <p className="text-xs text-slate-500">{c.placementId.candidateName}</p>
                  )}
                </TableCell>
                <TableCell className="capitalize text-slate-500">{c.type?.replace("_", " ")}</TableCell>
                <TableCell className={`font-bold ${statusColor(c.status)}`}>
                  {c.currency} {c.amount.toLocaleString()}
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-xs text-slate-500">
                  {new Date(c.paidAt ?? c.createdAt).toLocaleDateString()}
                </TableCell>
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
