"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DollarSign, TrendingUp, Clock, Loader2 } from "lucide-react";

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
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/commissions?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.commissions ?? []);
        setSummary(data.summary ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  const statusColor = (status: string) => {
    if (status === "paid") return "text-green-600";
    if (status === "approved") return "text-blue-600";
    return "text-amber-600";
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="My Commissions"
        description="Track earnings from successful placements"
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
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
        ) : commissions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No commissions yet. Complete placements to earn commissions!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/20">
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground">Placement</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Type</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Amount</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c._id} className="border-b hover:bg-muted/10 transition-colors">
                  <td className="p-3">
                    <p className="font-medium">{c.placementId?.jobTitle ?? "Placement"}</p>
                    {c.placementId?.candidateName && (
                      <p className="text-xs text-muted-foreground">{c.placementId.candidateName}</p>
                    )}
                  </td>
                  <td className="p-3 capitalize text-muted-foreground">{c.type?.replace("_", " ")}</td>
                  <td className={`p-3 font-bold ${statusColor(c.status)}`}>
                    {c.currency} {c.amount.toLocaleString()}
                  </td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(c.paidAt ?? c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
