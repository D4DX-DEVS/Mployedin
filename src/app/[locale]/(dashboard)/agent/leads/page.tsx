"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Edit2, Trash2, Search, Inbox } from "lucide-react";

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
  new: "bg-muted/50",
  contacted: "bg-blue-50",
  interested: "bg-yellow-50",
  negotiating: "bg-orange-50",
  converted: "bg-green-50",
  lost: "bg-red-50",
};

const LEAD_FIELDS: CrudField[] = [
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "contactPerson", label: "Contact Person", type: "text", required: true },
  { name: "contactEmail", label: "Contact Email", type: "email" },
  { name: "contactPhone", label: "Contact Phone", type: "text" },
  { name: "country", label: "Country", type: "text" },
  { name: "industry", label: "Industry", type: "text" },
  { name: "status", label: "Stage", type: "select", options: STAGES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "followUpAt", label: "Follow-up Date", type: "date" },
];

export default function AgentLeadsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.items ?? []);
    pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    setLoading(false);
  }, [search, statusFilter, pagination.page, pagination.limit]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  useEffect(() => { pagination.resetPage(); }, [search, statusFilter]);

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

  const handleSave = async (values: Record<string, string>) => {
    const url = editLead ? `/api/leads/${editLead._id}` : "/api/leads";
    const method = editLead ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!res.ok) throw new Error("Failed to save lead");
    setEditLead(null);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  };

  const openEdit = (lead: Lead) => { setEditLead(lead); setModalOpen(true); };
  const openAdd = () => { setEditLead(null); setModalOpen(true); };

  const byStage = (stage: LeadStatus) => leads.filter((l) => l.status === stage);

  return (
    <div className="page-container">
      <PageHeader
        title="Lead Pipeline"
        description="Track and manage employer leads through the sales funnel"
        actions={
          can("leads", "create") ? (
            <Button size="sm" onClick={openAdd}>
              + New Lead
            </Button>
          ) : null
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
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
            <Button key={v} onClick={() => setView(v)} size="sm"
              variant={view === v ? "default" : "outline"}>
              {v === "kanban" ? "Kanban" : "Table"}
            </Button>
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
                <span className="text-xs bg-card rounded-full px-1.5 py-0.5 font-bold">{byStage(stage).length}</span>
              </div>
              {byStage(stage).map((lead) => (
                <div key={lead._id} className="bg-card rounded-lg p-3 shadow-sm space-y-1 text-sm">
                  <p className="font-semibold truncate">{lead.companyName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lead.contactPerson}</p>
                  {lead.country && <p className="text-xs text-muted-foreground">{lead.country}</p>}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {STAGES.filter((s) => s !== stage && s !== "lost").map((s) => (
                      <Button key={s} variant="outline" size="xs"
                        disabled={updating === lead._id}
                        onClick={() => updateStatus(lead._id, s)}
                        className="text-[10px] h-auto px-1.5 py-0.5">
                        → {s}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {can("leads", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} className="text-xs text-blue-600">Edit</Button>
                    )}
                    {can("leads", "delete") && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} className="text-xs text-red-600">Delete</Button>
                    )}
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
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Follow Up</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-8 w-8 opacity-40" />
                      <span className="text-sm">No leads found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.map((lead) => (
                <TableRow key={lead._id}>
                  <TableCell className="font-medium">{lead.companyName}</TableCell>
                  <TableCell>
                    <div>{lead.contactPerson}</div>
                    {lead.contactEmail && <div className="text-xs text-muted-foreground">{lead.contactEmail}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.country ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.industry ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
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
                      {can("leads", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} title="Edit">
                          <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                      )}
                      {can("leads", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditLead(null); }}
        title={editLead ? "Edit Lead" : "New Lead"}
        fields={LEAD_FIELDS}
        initialValues={editLead ? {
          companyName: editLead.companyName,
          contactPerson: editLead.contactPerson,
          contactEmail: editLead.contactEmail ?? "",
          contactPhone: editLead.contactPhone ?? "",
          country: editLead.country ?? "",
          industry: editLead.industry ?? "",
          status: editLead.status,
          notes: editLead.notes ?? "",
          followUpAt: editLead.followUpAt?.slice(0, 10) ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
