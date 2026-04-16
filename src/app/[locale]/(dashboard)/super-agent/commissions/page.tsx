"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Coins, ReceiptText, Settings2, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

interface Commission {
  _id: string;
  agentId?: { fullName?: string; userId?: { name?: string; email?: string } };
  type?: string;
  amount: number;
  currency?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export default function SuperAgentCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Override rate settings
  const [overrideRate, setOverrideRate] = useState<number>(0);
  const [savingRate, setSavingRate] = useState(false);
  const [rateMessage, setRateMessage] = useState("");

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile?.overrideRate != null) {
          setOverrideRate(data.profile.overrideRate);
        }
      })
      .catch(() => {});
  }, []);

  const saveOverrideRate = async () => {
    setSavingRate(true);
    setRateMessage("");
    try {
      const res = await fetch("/api/super-agent/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideRate }),
      });
      if (res.ok) {
        setRateMessage("Saved ✓");
        setTimeout(() => setRateMessage(""), 2000);
      } else {
        setRateMessage("Failed to save");
      }
    } catch {
      setRateMessage("Network error");
    } finally {
      setSavingRate(false);
    }
  };

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/commissions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCommissions(data.items ?? data.commissions ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [statusFilter, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/commissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchCommissions();
  };

  const totalAmount = commissions.reduce((sum, commission) => sum + (commission.amount ?? 0), 0);

  const kpis = [
    {
      label: "Visible Payouts",
      value: totalAmount > 0 ? `AED ${totalAmount.toLocaleString()}` : "—",
      helper: "Commission amount represented in the current results page.",
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "bg-sky-50 text-sky-600",
    },
    {
      label: "Pending",
      value: commissions.filter((commission) => commission.status === "pending").length,
      helper: "Commission entries still waiting for approval review.",
      icon: <ReceiptText className="h-5 w-5" />,
      toneClassName: "bg-amber-50 text-amber-600",
    },
    {
      label: "Approved",
      value: commissions.filter((commission) => commission.status === "approved").length,
      helper: "Approved entries ready to move into payout confirmation.",
      icon: <CheckCircle2 className="h-5 w-5" />,
      toneClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Override Rate",
      value: `${overrideRate || 0}%`,
      helper: "Current regional override rate pulled from the super-agent profile.",
      icon: <Wallet className="h-5 w-5" />,
      toneClassName: "bg-indigo-50 text-indigo-600",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Commission Management"
        description="Review payout records, approve commissions, and maintain the regional override rate from the same modern oversight workspace."
        summaryTitle="Finance lane"
        summaryDescription="Status filters, approval actions, and profile-rate updates still hit the same existing endpoints."
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Controls"
        title="Configure the regional override and filter payout status"
        description="Adjust the commission override rate and move between payout states without changing the current backend behavior."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-500" />
              <Label htmlFor="overrideRate" className="whitespace-nowrap text-sm font-medium text-slate-700">
                Commission Override Rate (%)
              </Label>
            </div>
            <Input
              id="overrideRate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={overrideRate}
              onChange={(e) => setOverrideRate(Number(e.target.value))}
              className="h-11 w-28 rounded-xl border-slate-200 bg-white text-sm shadow-none"
            />
            <Button size="sm" onClick={saveOverrideRate} disabled={savingRate} className="h-11 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800">
              {savingRate ? "Saving..." : "Save"}
            </Button>
            {rateMessage ? <span className="text-xs text-slate-500">{rateMessage}</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["", "pending", "approved", "paid"] as const).map((s) => (
              <Button
                key={s}
                onClick={() => { setStatusFilter(s); resetPage(); }}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={statusFilter === s ? "bg-slate-950 text-white hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-50"}
              >
                {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <SuperAgentDataTableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Type</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</TableHead>
                  <TableHead className="py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amount</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-100">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <SuperAgentEmptyState
                        icon={<Coins className="h-7 w-7" />}
                        title="No commissions found"
                        description="Change the status filter or wait for payout records to appear."
                      />
                    </TableCell>
                  </TableRow>
                ) : commissions.map((c) => (
                  <TableRow key={c._id} className="border-slate-100 hover:bg-sky-50/30">
                    <TableCell className="py-4">
                      <div className="font-medium text-slate-950">{c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—"}</div>
                      <div className="text-xs text-slate-500">{c.agentId?.userId?.email ?? ""}</div>
                    </TableCell>
                    <TableCell className="py-4 capitalize text-slate-500">{(c.type ?? "placement").replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-xs truncate py-4 text-xs text-slate-500">{c.notes ?? "—"}</TableCell>
                    <TableCell className="py-4 text-right font-semibold text-slate-900">{c.currency ?? "AED"} {c.amount.toLocaleString()}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="py-4 text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="py-4">
                      {c.status === "pending" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={() => updateStatus(c._id, "approved")}>
                          Approve
                        </Button>
                      )}
                      {c.status === "approved" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700" onClick={() => updateStatus(c._id, "paid")}>
                          Mark Paid
                        </Button>
                      )}
                      {c.status === "paid" && <span className="text-xs text-slate-500">Paid ✓</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SuperAgentDataTableShell>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
