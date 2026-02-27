"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Briefcase, TrendingUp, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";

interface Placement {
  _id: string;
  jobTitle?: string;
  candidateName?: string;
  candidateEmail?: string;
  startDate?: string;
  salary?: { amount: number; currency: string };
  status: string;
  type: string;
  createdAt: string;
}

export default function EmployerPlacementsPage() {
  const pagination = usePagination();
  const { can } = usePermissions();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState({ total: 0, active: 0, thisMonth: 0 });

  const loadPlacements = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.placements ?? data.items ?? [];
        setPlacements(items);
        pagination.updateTotal(data.total ?? items.length);
        // Compute stats from current page (best effort)
        const now = new Date();
        setStats({
          total: data.total ?? items.length,
          active: items.filter((p: Placement) => p.status === "active").length,
          thisMonth: items.filter((p: Placement) => {
            const d = new Date(p.createdAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [filter, pagination.page, pagination.limit]);

  useEffect(() => { loadPlacements(); }, [loadPlacements]);

  useEffect(() => { pagination.resetPage(); }, [filter]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Placements"
        description="Track candidates placed through your job listings"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Hired", value: stats.total, icon: Users, color: "text-primary" },
          { label: "Currently Active", value: stats.active, icon: Briefcase, color: "text-green-600" },
          { label: "This Month", value: stats.thisMonth, icon: TrendingUp, color: "text-amber-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-base flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {["all", "active", "completed", "terminated"].map((s) => (
          <Button key={s} onClick={() => setFilter(s)}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            className="capitalize">{s}</Button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Candidate</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : placements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No placements yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id}>
                <TableCell>
                  <p className="font-medium">{p.candidateName ?? "Candidate"}</p>
                  <p className="text-xs text-muted-foreground">{p.candidateEmail}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.jobTitle ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  {p.salary ? `${p.salary.currency} ${p.salary.amount.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
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
