"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, DollarSign, Search, ShieldCheck, Users } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  assignedAgent?: { name: string };
  jobCount?: number;
  totalPaid?: number;
}

export default function SuperAgentEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? data.employers?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, page, limit, updateTotal]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  const stats = useMemo(() => ({
    total: employers.length,
    active: employers.filter((e) => e.isActive).length,
    assigned: employers.filter((e) => Boolean(e.assignedAgent?.name)).length,
    revenue: employers.reduce((sum, employer) => sum + (employer.totalPaid ?? 0), 0),
  }), [employers]);

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Employer Relationships"
        description="Track employer accounts across your region, review who owns each relationship, and keep commercial coverage visible without changing the underlying account data flow."
        summaryTitle="Portfolio"
        summaryDescription="Search across employer records, compare activity, and confirm which accounts already have active agent ownership."
      />

      <SuperAgentMetricsGrid
        items={[
          {
            label: "Total Employers",
            value: stats.total,
            helper: "Employer accounts currently visible in the regional workspace.",
            icon: <Building2 className="h-5 w-5" />,
            toneClassName: "bg-sky-50 text-sky-600",
          },
          {
            label: "Active Accounts",
            value: stats.active,
            helper: "Accounts marked active and ready to work with your team.",
            icon: <ShieldCheck className="h-5 w-5" />,
            toneClassName: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Assigned",
            value: stats.assigned,
            helper: "Employer records that already have an assigned agent.",
            icon: <Users className="h-5 w-5" />,
            toneClassName: "bg-indigo-50 text-indigo-600",
          },
          {
            label: "Revenue Tracked",
            value: stats.revenue > 0 ? `AED ${stats.revenue.toLocaleString()}` : "—",
            helper: "Visible account revenue surfaced by the current employer response.",
            icon: <DollarSign className="h-5 w-5" />,
            toneClassName: "bg-amber-50 text-amber-600",
          },
        ]}
      />

      <SuperAgentSection
        eyebrow="Accounts"
        title="Review employer ownership and account health"
        description="The search box and pagination still use the same existing employer endpoint."
      >
        <div className="mb-4 relative w-full max-w-xs min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search employers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
          />
        </div>

        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contact</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Industry</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent</TableHead>
                <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-slate-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : employers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <SuperAgentEmptyState
                      icon={<Building2 className="h-7 w-7" />}
                      title="No employers found"
                      description="Broaden the search to review more employer accounts in your region."
                    />
                  </TableCell>
                </TableRow>
              ) : employers.map((em) => (
                <TableRow key={em._id} className="border-slate-100 hover:bg-sky-50/30">
                  <TableCell className="py-4 font-medium text-slate-950">{em.companyName ?? em.name}</TableCell>
                  <TableCell className="py-4 text-xs text-slate-500">{em.email}</TableCell>
                  <TableCell className="py-4 text-slate-500">{em.industry ?? "—"}</TableCell>
                  <TableCell className="py-4 text-slate-500">{em.location ?? "—"}</TableCell>
                  <TableCell className="py-4 text-slate-500">{em.assignedAgent?.name ?? "Unassigned"}</TableCell>
                  <TableCell className="py-4"><StatusBadge status={em.isActive ? "active" : "inactive"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SuperAgentDataTableShell>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
