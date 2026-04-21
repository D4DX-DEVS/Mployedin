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
import { formatCurrency } from "@/lib/currency";

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
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile?.overrideRate != null) {
          setOverrideRate(data.profile.overrideRate);
        }
        if (data?.profile?.currencyCode) {
          setCurrencyCode(data.profile.currencyCode);
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
      value: totalAmount > 0 ? formatCurrency(totalAmount, currencyCode) : "—",
      helper: "Commission amount represented in the current results page.",
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Pending",
      value: commissions.filter((commission) => commission.status === "pending").length,
      helper: "Commission entries still waiting for approval review.",
      icon: <ReceiptText className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
    {
      label: "Approved",
      value: commissions.filter((commission) => commission.status === "approved").length,
      helper: "Approved entries ready to move into payout confirmation.",
      icon: <CheckCircle2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Override Rate",
      value: `${overrideRate || 0}%`,
      helper: "Current regional override rate pulled from the super-agent profile.",
      icon: <Wallet className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
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
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-secondary/50 p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="overrideRate" className="whitespace-nowrap text-sm font-medium text-foreground">
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
              className="h-11 w-28 rounded-xl bg-background/85 text-foreground shadow-none"
            />
            <Button size="sm" onClick={saveOverrideRate} disabled={savingRate} className="h-11 rounded-xl px-4">
              {savingRate ? "Saving..." : "Save"}
            </Button>
            {rateMessage ? <span className="text-xs text-muted-foreground">{rateMessage}</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["", "pending", "approved", "paid"] as const).map((s) => (
              <Button
                key={s}
                onClick={() => { setStatusFilter(s); resetPage(); }}
                aria-pressed={statusFilter === s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className={statusFilter === s ? "rounded-xl" : "rounded-xl border-border/70 bg-background/85 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"}
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
                <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                  <TableHead className="py-4 text-muted-foreground/80">Agent</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Type</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Notes</TableHead>
                  <TableHead className="py-4 text-right text-muted-foreground/80">Amount</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Status</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Date</TableHead>
                  <TableHead className="py-4 text-muted-foreground/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted/75" /></TableCell>
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
                    <TableRow key={c._id} className="border-border/50 hover:bg-accent/25">
                    <TableCell className="py-4">
                        <div className="font-medium text-foreground">{c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.agentId?.userId?.email ?? ""}</div>
                    </TableCell>
                      <TableCell className="py-4 capitalize text-muted-foreground">{(c.type ?? "placement").replace(/_/g, " ")}</TableCell>
                      <TableCell className="max-w-xs truncate py-4 text-xs text-muted-foreground">{c.notes ?? "—"}</TableCell>
                      <TableCell className="py-4 text-right font-semibold text-foreground">{formatCurrency(c.amount, c.currency ?? currencyCode)}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="py-4 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
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
                      {c.status === "paid" && <span className="text-xs text-muted-foreground">Paid ✓</span>}
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
