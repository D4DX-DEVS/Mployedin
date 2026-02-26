"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Users, Briefcase, TrendingUp, Loader2 } from "lucide-react";

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
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadPlacements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/placements?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.placements ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadPlacements(); }, [loadPlacements]);

  const stats = {
    total: placements.length,
    active: placements.filter((p) => p.status === "active").length,
    thisMonth: placements.filter((p) => {
      const d = new Date(p.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              filter === s ? "bg-primary text-white" : "bg-muted/40 hover:bg-muted/60"
            }`}>{s}</button>
        ))}
      </div>

      <div className="card-base overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : placements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No placements yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/20">
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground">Candidate</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Position</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Start Date</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Salary</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => (
                <tr key={p._id} className="border-b hover:bg-muted/10">
                  <td className="p-3">
                    <p className="font-medium">{p.candidateName ?? "Candidate"}</p>
                    <p className="text-xs text-muted-foreground">{p.candidateEmail}</p>
                  </td>
                  <td className="p-3 text-muted-foreground">{p.jobTitle ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    {p.salary ? `${p.salary.currency} ${p.salary.amount.toLocaleString()}` : "—"}
                  </td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
