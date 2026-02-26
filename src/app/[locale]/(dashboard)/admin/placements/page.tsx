"use client";

import { useState, useEffect, useCallback } from "react";
import { Briefcase, Search, Filter, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface Placement {
  _id: string;
  startDate: string;
  salary: number;
  currency: string;
  visaStatus: "not_required" | "pending" | "approved" | "rejected" | "stamped";
  commissionPaid: boolean;
  jobSeeker?: { name: string; email: string };
  employer?: { companyName: string };
  job?: { title: string };
  agent?: { name: string };
  superAgent?: { name: string };
  createdAt: string;
}

const VISA_ICONS: Record<string, React.ReactNode> = {
  stamped: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  rejected: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
  not_required: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default function AdminPlacementsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (visaFilter) params.set("visaStatus", visaFilter);
      if (commissionFilter) params.set("commissionPaid", commissionFilter);

      const res = await fetch(`/api/placements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.placements ?? []);
        setTotal(data.total ?? 0);
        setTotalValue(data.totalSalaryValue ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, visaFilter, commissionFilter]);

  useEffect(() => { load(); }, [load]);

  const markCommission = async (id: string, paid: boolean) => {
    await fetch(`/api/placements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPaid: paid }),
    });
    load();
  };

  const pendingVisa = placements.filter(p => p.visaStatus === "pending").length;
  const unpaidCommissions = placements.filter(p => !p.commissionPaid).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Placement Tracking" description={`${total} placements · Total salary value: ${totalValue.toLocaleString()} AED`} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          { label: "Pending Visa", value: pendingVisa, color: "text-amber-600" },
          { label: "Unpaid Commission", value: unpaidCommissions, color: "text-red-500" },
          { label: "Total AED Value", value: `${(totalValue / 1000).toFixed(0)}K`, color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="card-base text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card-base flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search candidate or company…" className="input-field flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={visaFilter} onChange={e => { setVisaFilter(e.target.value); setPage(1); }} className="input-field">
            <option value="">All Visa Status</option>
            <option value="not_required">Not Required</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="stamped">Stamped</option>
          </select>
          <select value={commissionFilter} onChange={e => { setCommissionFilter(e.target.value); setPage(1); }} className="input-field">
            <option value="">All Commission</option>
            <option value="true">Paid</option>
            <option value="false">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card-base overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : placements.length === 0 ? (
          <p className="text-center py-12 text-sm text-muted-foreground">No placements found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {["Candidate", "Role", "Company", "Agent", "Salary", "Visa", "Commission", "Date", ""].map((h, i) => (
                  <th key={i} className="text-left pb-2 pr-3 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {placements.map((p) => (
                <tr key={p._id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{p.jobSeeker?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{p.jobSeeker?.email}</p>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{p.job?.title ?? "—"}</td>
                  <td className="py-3 pr-3">{p.employer?.companyName ?? "—"}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{p.agent?.name ?? "—"}</td>
                  <td className="py-3 pr-3 font-medium">
                    {p.salary?.toLocaleString()} <span className="text-xs text-muted-foreground">{p.currency}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1.5">
                      {VISA_ICONS[p.visaStatus]}
                      <span className="text-xs capitalize">{p.visaStatus?.replace("_", " ")}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={p.commissionPaid ? "paid" : "pending"} />
                  </td>
                  <td className="py-3 pr-3 text-xs text-muted-foreground">
                    {new Date(p.startDate).toLocaleDateString("en-AE")}
                  </td>
                  <td className="py-3">
                    {!p.commissionPaid && (
                      <button onClick={() => markCommission(p._id, true)}
                        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > limit && (
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <p className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / limit)}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-xs disabled:opacity-40">Previous</button>
              <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)} className="btn-outline text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
