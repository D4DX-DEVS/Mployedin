"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ArrowRight, Building2, Edit2, Inbox, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

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
  new: "workspace-subtle-surface",
  contacted: "border-[hsl(var(--status-applied))]/20 bg-[hsl(var(--status-applied-bg))]/85",
  interested: "border-[hsl(var(--status-shortlisted))]/20 bg-[hsl(var(--status-shortlisted-bg))]/85",
  negotiating: "border-[hsl(var(--status-interview))]/20 bg-[hsl(var(--status-interview-bg))]/85",
  converted: "border-[hsl(var(--status-selected))]/20 bg-[hsl(var(--status-selected-bg))]/85",
  lost: "border-[hsl(var(--status-rejected))]/20 bg-[hsl(var(--status-rejected-bg))]/85",
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
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
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
    const ok = await confirmDialog("Delete this lead?");
    if (!ok) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  };

  const openEdit = (lead: Lead) => { setEditLead(lead); setModalOpen(true); };
  const openAdd = () => { setEditLead(null); setModalOpen(true); };

  const byStage = (stage: LeadStatus) => leads.filter((l) => l.status === stage);
  const newLeads = byStage("new").length;
  const negotiatingLeads = byStage("negotiating").length;
  const convertedLeads = byStage("converted").length;
  const lostLeads = byStage("lost").length;

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Lead Pipeline</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Track employer leads from first contact through conversion and keep your next follow-up visible in either kanban or table view.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline size</p><p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} leads</p><p className="text-xs text-muted-foreground">Current employer opportunities in your managed desk.</p></div>
            {can("leads", "create") ? (
              <Button size="sm" onClick={openAdd} className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                + New Lead
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">New</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{newLeads}</p><p className="mt-1 text-xs text-muted-foreground">Fresh accounts waiting for the first touch.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><Target className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Negotiating</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{negotiatingLeads}</p><p className="mt-1 text-xs text-muted-foreground">Accounts moving toward a commercial decision.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Converted</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{convertedLeads}</p><p className="mt-1 text-xs text-muted-foreground">Leads already turned into successful employer accounts.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><ArrowRight className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Lost</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{lostLeads}</p><p className="mt-1 text-xs text-muted-foreground">Leads that have fallen out of the active funnel.</p></div><div className="workspace-tone-rose rounded-2xl p-2.5"><Trash2 className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter leads</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search the funnel and switch the way you review it</h2>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            {(["kanban", "table"] as const).map((v) => (
              <Button key={v} onClick={() => setView(v)} size="sm" variant="outline" aria-pressed={view === v} className={view === v ? "workspace-tone-sky h-11 rounded-xl border-transparent px-4 hover:opacity-90" : "workspace-muted-pill h-11 rounded-xl px-4 hover:bg-card"}>
                {v === "kanban" ? "Kanban" : "Table"}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : view === "kanban" ? (
        <section className="grid grid-cols-1 gap-3 items-start sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((stage) => (
            <div key={stage} className={`rounded-[24px] border border-border p-3 space-y-2 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.25)] ${STAGE_COLORS[stage]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage}</span>
                <span className="workspace-muted-pill rounded-full px-1.5 py-0.5 text-xs font-bold">{byStage(stage).length}</span>
              </div>
              {byStage(stage).map((lead) => (
                <div key={lead._id} className="workspace-panel-surface rounded-2xl p-3 shadow-sm space-y-2 text-sm">
                  <p className="truncate font-semibold text-foreground">{lead.companyName}</p>
                  <p className="truncate text-xs text-muted-foreground">{lead.contactPerson}</p>
                  {lead.country && <p className="text-xs text-muted-foreground">{lead.country}</p>}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {STAGES.filter((s) => s !== stage && s !== "lost").map((s) => (
                      <Button key={s} variant="outline" size="xs"
                        disabled={updating === lead._id}
                        onClick={() => updateStatus(lead._id, s)}
                        className="h-auto rounded-lg px-1.5 py-0.5 text-[10px]">
                        → {s}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {can("leads", "update") && (
                      <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} className="text-xs text-primary" aria-label={`Edit ${lead.companyName}`}>Edit</Button>
                    )}
                    {can("leads", "delete") && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} className="text-xs text-destructive" aria-label={`Delete ${lead.companyName}`}>Delete</Button>
                    )}
                  </div>
                </div>
              ))}
              {byStage(stage).length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">Empty</p>
              )}
            </div>
          ))}
        </section>
      ) : (
        <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review lead details in a compact table</h2></div><div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{pagination.total} leads across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
          <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
          <Table>
            <TableHeader>
              <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
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
                      <Inbox className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm">No leads found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.map((lead) => (
                <TableRow key={lead._id} className="hover:bg-secondary/50">
                  <TableCell className="font-medium text-foreground">{lead.companyName}</TableCell>
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
                        className="rounded-lg border border-border bg-background/70 px-1.5 py-1 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                      {can("leads", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} title="Edit" aria-label={`Edit ${lead.companyName}`}>
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("leads", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} title="Delete" aria-label={`Delete ${lead.companyName}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>
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
