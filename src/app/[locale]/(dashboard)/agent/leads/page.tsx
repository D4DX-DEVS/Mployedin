"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import Link from "next/link";

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  industry?: string;
  status: LeadStatus;
  notes?: string;
  followUpAt?: string;
  createdAt: string;
}

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

const STAGE_COLORS: Record<LeadStatus, string> = {
  new: "bg-gray-100",
  contacted: "bg-blue-50",
  interested: "bg-yellow-50",
  negotiating: "bg-orange-50",
  converted: "bg-green-50",
  lost: "bg-red-50",
};

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.items ?? []);
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdating(id);
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchLeads();
    setUpdating(null);
  };

  const byStage = (stage: LeadStatus) => leads.filter((l) => l.status === stage);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Lead Pipeline"
        description="Track and manage employer leads through the sales funnel"
        actions={
          <Link href="leads/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
            + New Lead
          </Link>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads…"
          className="h-9 rounded-lg border px-3 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          {(["kanban", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${view === v ? "bg-primary text-white border-primary" : "hover:bg-muted/50"}`}>
              {v === "kanban" ? "Kanban" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
          {STAGES.map((stage) => (
            <div key={stage} className={`rounded-xl border p-3 space-y-2 ${STAGE_COLORS[stage]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage}</span>
                <span className="text-xs bg-white rounded-full px-1.5 py-0.5 font-bold">{byStage(stage).length}</span>
              </div>
              {byStage(stage).map((lead) => (
                <div key={lead._id} className="bg-white rounded-lg p-3 shadow-sm space-y-1 text-sm">
                  <p className="font-semibold truncate">{lead.companyName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lead.contactPerson}</p>
                  {lead.country && <p className="text-xs text-muted-foreground">{lead.country}</p>}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {STAGES.filter((s) => s !== stage && s !== "lost").map((s) => (
                      <button key={s}
                        disabled={updating === lead._id}
                        onClick={() => updateStatus(lead._id, s)}
                        className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-primary/10 hover:border-primary transition-colors">
                        → {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {byStage(stage).length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-2">Empty</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Follow Up</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{lead.companyName}</td>
                  <td className="px-4 py-3">
                    <div>{lead.contactPerson}</div>
                    {lead.contactEmail && <div className="text-xs text-muted-foreground">{lead.contactEmail}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.country ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      disabled={updating === lead._id}
                      value={lead.status}
                      onChange={(e) => updateStatus(lead._id, e.target.value as LeadStatus)}
                      className="text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No leads found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
