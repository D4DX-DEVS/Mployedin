"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, Clock, Loader2, Inbox } from "lucide-react";

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
    <div className="page-container">
      <PageHeader
        title="My Commissions"
        description="Track earnings from successful placements"
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Pending", value: summary.pending, color: "text-amber-600", icon: Clock },
            { label: "Approved", value: summary.approved, color: "text-blue-600", icon: TrendingUp },
            { label: "Paid", value: summary.paid, color: "text-green-600", icon: DollarSign },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="card-base flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`text-xl font-bold ${color}`}>
                  {summary.currency} {value.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "pending", "approved", "paid"].map((s) => (
          <Button key={s} onClick={() => setFilter(s)} size="sm"
            variant={filter === s ? "default" : "ghost"}
            className="capitalize">{s}</Button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
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
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No commissions yet</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id}>
                <TableCell>
                  <p className="font-medium">{c.placementId?.jobTitle ?? "Placement"}</p>
                  {c.placementId?.candidateName && (
                    <p className="text-xs text-muted-foreground">{c.placementId.candidateName}</p>
                  )}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{c.type?.replace("_", " ")}</TableCell>
                <TableCell className={`font-bold ${statusColor(c.status)}`}>
                  {c.currency} {c.amount.toLocaleString()}
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(c.paidAt ?? c.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
