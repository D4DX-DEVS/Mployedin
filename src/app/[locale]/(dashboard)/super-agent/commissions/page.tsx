"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Inbox, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  return (
    <div className="page-container">
      <PageHeader title="Commission Management" description="Review and approve agent commission payouts" />

      {/* Override Rate Settings */}
      <div className="card-base p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="overrideRate" className="text-sm font-medium whitespace-nowrap">
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
          className="w-24"
        />
        <Button size="sm" onClick={saveOverrideRate} disabled={savingRate}>
          {savingRate ? "Saving…" : "Save"}
        </Button>
        {rateMessage && (
          <span className="text-xs text-muted-foreground">{rateMessage}</span>
        )}
      </div>

      <div className="flex gap-3">
        {(["", "pending", "approved", "paid"] as const).map((s) => (
          <Button key={s}
            onClick={() => { setStatusFilter(s); resetPage(); }}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm">
            {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Agent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : commissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No commissions found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id}>
                <TableCell>
                  <div className="font-medium">{c.agentId?.fullName ?? c.agentId?.userId?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.agentId?.userId?.email ?? ""}</div>
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {(c.type ?? "placement").replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{c.notes ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">
                  {c.currency ?? "AED"} {c.amount.toLocaleString()}
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {c.status === "pending" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700"
                      onClick={() => updateStatus(c._id, "approved")}>
                      Approve
                    </Button>
                  )}
                  {c.status === "approved" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700"
                      onClick={() => updateStatus(c._id, "paid")}>
                      Mark Paid
                    </Button>
                  )}
                  {c.status === "paid" && (
                    <span className="text-xs text-muted-foreground">Paid ✓</span>
                  )}
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
