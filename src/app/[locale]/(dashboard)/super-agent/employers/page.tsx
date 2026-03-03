"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Users, DollarSign, Search, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

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
  }, [search, page, limit]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  const stats = {
    total: employers.length,
    active: employers.filter((e) => e.isActive).length,
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Employer Relationships"
        description="Track all employer accounts within your region"
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card-base flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Employers</p>
          </div>
        </div>
        <div className="card-base flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active Accounts</p>
          </div>
        </div>
        <div className="card-base flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">—</p>
            <p className="text-xs text-muted-foreground">Revenue Generated</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input placeholder="Search employers…" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="pl-9 h-9" />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : employers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No employers found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : employers.map((em) => (
              <TableRow key={em._id}>
                <TableCell className="font-medium">{em.companyName ?? em.name}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{em.email}</TableCell>
                <TableCell className="text-muted-foreground">{em.industry ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{em.location ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{em.assignedAgent?.name ?? "Unassigned"}</TableCell>
                <TableCell>
                  <StatusBadge status={em.isActive ? "active" : "inactive"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
