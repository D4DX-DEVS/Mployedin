"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Building2, Users, DollarSign, Search, Loader2 } from "lucide-react";

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

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employers?search=${encodeURIComponent(search)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  const stats = {
    total: employers.length,
    active: employers.filter((e) => e.isActive).length,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Employer Relationships"
        description="Track all employer accounts within your territory"
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employers…"
          className="w-full sm:w-72 h-10 pl-9 pr-4 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/20">
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground">Company</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Contact</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Industry</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Location</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Agent</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {employers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">No employers found</td>
                </tr>
              ) : employers.map((em) => (
                <tr key={em._id} className="border-b hover:bg-muted/10 transition-colors">
                  <td className="p-3 font-medium">{em.companyName ?? em.name}</td>
                  <td className="p-3 text-muted-foreground text-xs">{em.email}</td>
                  <td className="p-3 text-muted-foreground">{em.industry ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{em.location ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{em.assignedAgent?.name ?? "Unassigned"}</td>
                  <td className="p-3">
                    <StatusBadge status={em.isActive ? "active" : "inactive"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
