"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface Commission {
  _id: string;
  agentName: string;
  agentEmail: string;
  type: "placement" | "lead_conversion" | "training";
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid";
  description: string;
  createdAt: string;
}

const MOCK_COMMISSIONS: Commission[] = [
  {
    _id: "1",
    agentName: "Mohammed Al-Rashid",
    agentEmail: "m.rashid@example.com",
    type: "placement",
    amount: 1500,
    currency: "AED",
    status: "approved",
    description: "Successful placement — Software Engineer at TechCorp Dubai",
    createdAt: new Date().toISOString(),
  },
  {
    _id: "2",
    agentName: "Sarah Johnson",
    agentEmail: "s.johnson@example.com",
    type: "lead_conversion",
    amount: 500,
    currency: "AED",
    status: "pending",
    description: "Lead conversion — Gulf Construction Ltd",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export default function SuperAgentCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    // In production: fetch from /api/super-agent/commissions
    setTimeout(() => {
      setCommissions(MOCK_COMMISSIONS);
      setLoading(false);
    }, 300);
  }, []);

  const filtered = statusFilter ? commissions.filter((c) => c.status === statusFilter) : commissions;

  const totals = {
    pending: commissions.filter((c) => c.status === "pending").reduce((a, c) => a + c.amount, 0),
    approved: commissions.filter((c) => c.status === "approved").reduce((a, c) => a + c.amount, 0),
    paid: commissions.filter((c) => c.status === "paid").reduce((a, c) => a + c.amount, 0),
  };

  const updateStatus = async (id: string, status: string) => {
    setCommissions((prev) =>
      prev.map((c) => (c._id === id ? { ...c, status: status as Commission["status"] } : c))
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader title="Commission Management" description="Review and approve agent commission payouts" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Pending", value: totals.pending, color: "text-yellow-600" },
          { label: "Approved (unpaid)", value: totals.approved, color: "text-blue-600" },
          { label: "Paid Out", value: totals.paid, color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="card-base">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>
              AED {k.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {(["", "pending", "approved", "paid"] as const).map((s) => (
          <button key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${statusFilter === s ? "bg-primary text-white border-primary" : "hover:bg-muted/40"}`}>
            {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c._id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.agentName}</div>
                    <div className="text-xs text-muted-foreground">{c.agentEmail}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {c.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{c.description}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {c.currency} {c.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "pending" && (
                      <button
                        onClick={() => updateStatus(c._id, "approved")}
                        className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 mr-1">
                        Approve
                      </button>
                    )}
                    {c.status === "approved" && (
                      <button
                        onClick={() => updateStatus(c._id, "paid")}
                        className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                        Mark Paid
                      </button>
                    )}
                    {c.status === "paid" && (
                      <span className="text-xs text-muted-foreground">Paid ✓</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No commissions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
