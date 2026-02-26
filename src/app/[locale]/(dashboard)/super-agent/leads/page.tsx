"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  country?: string;
  industry?: string;
  status: LeadStatus;
  agentId?: { userId?: { name?: string } };
  createdAt: string;
}

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

export default function SuperAgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/super-agent/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.items ?? []);
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Territory Lead Pipeline" description="All leads across agents in your territory" />

      {/* Stage counters */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {STAGES.map((s) => (
          <button key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`card-base text-center cursor-pointer transition-all ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
          >
            <p className="text-xs text-muted-foreground capitalize">{s}</p>
            <p className="text-2xl font-bold text-primary mt-1">{stageCounts[s]}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, contact…"
          className="h-9 rounded-lg border px-3 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
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
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{lead.companyName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.contactPerson}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.country ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {lead.agentId?.userId?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(lead.createdAt).toLocaleDateString()}
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
