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
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Lead Pipeline</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Track employer leads from first contact through conversion and keep your next follow-up visible in either kanban or table view.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline size</p><p className="mt-1 text-lg font-semibold text-slate-950">{pagination.total} leads</p><p className="text-xs text-slate-500">Current employer opportunities in your managed desk.</p></div>
            {can("leads", "create") ? (
              <Button size="sm" onClick={openAdd} className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                + New Lead
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">New</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{newLeads}</p><p className="mt-1 text-xs text-slate-500">Fresh accounts waiting for the first touch.</p></div><div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600"><Target className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Negotiating</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{negotiatingLeads}</p><p className="mt-1 text-xs text-slate-500">Accounts moving toward a commercial decision.</p></div><div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600"><Building2 className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Converted</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{convertedLeads}</p><p className="mt-1 text-xs text-slate-500">Leads already turned into successful employer accounts.</p></div><div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600"><ArrowRight className="h-5 w-5" /></div></div></div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lost</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{lostLeads}</p><p className="mt-1 text-xs text-slate-500">Leads that have fallen out of the active funnel.</p></div><div className="rounded-2xl bg-rose-50 p-2.5 text-rose-600"><Trash2 className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter leads</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Search the funnel and switch the way you review it</h2>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            {(["kanban", "table"] as const).map((v) => (
              <Button key={v} onClick={() => setView(v)} size="sm" variant="outline" className={view === v ? "h-11 rounded-xl border-sky-200 bg-sky-50 px-4 text-sky-700 hover:bg-sky-100" : "h-11 rounded-xl border-slate-200 bg-slate-50 px-4 text-slate-600 hover:bg-white"}>
                {v === "kanban" ? "Kanban" : "Table"}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
      ) : view === "kanban" ? (
        <section className="grid grid-cols-1 gap-3 items-start sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((stage) => (
            <div key={stage} className={`rounded-[24px] border border-slate-200 p-3 space-y-2 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.25)] ${STAGE_COLORS[stage]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stage}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-slate-700">{byStage(stage).length}</span>
              </div>
              {byStage(stage).map((lead) => (
                <div key={lead._id} className="rounded-2xl border border-white/80 bg-white/95 p-3 shadow-sm space-y-2 text-sm backdrop-blur">
                  <p className="truncate font-semibold text-slate-950">{lead.companyName}</p>
                  <p className="truncate text-xs text-slate-500">{lead.contactPerson}</p>
                  {lead.country && <p className="text-xs text-slate-500">{lead.country}</p>}
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
                      <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} className="text-xs text-blue-600" aria-label={`Edit ${lead.companyName}`}>Edit</Button>
                    )}
                    {can("leads", "delete") && (
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} className="text-xs text-red-600" aria-label={`Delete ${lead.companyName}`}>Delete</Button>
                    )}
                  </div>
                </div>
              ))}
              {byStage(stage).length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400">Empty</p>
              )}
            </div>
          ))}
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Review lead details in a compact table</h2></div><div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"><ArrowRight className="h-3.5 w-3.5 text-sky-600" />{pagination.total} leads across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div></div>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
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
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300" />
                      <span className="text-sm">No leads found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.map((lead) => (
                <TableRow key={lead._id} className="hover:bg-slate-50/70">
                  <TableCell className="font-medium text-slate-950">{lead.companyName}</TableCell>
                  <TableCell>
                    <div>{lead.contactPerson}</div>
                    {lead.contactEmail && <div className="text-xs text-slate-500">{lead.contactEmail}</div>}
                  </TableCell>
                  <TableCell className="text-slate-500">{lead.country ?? "—"}</TableCell>
                  <TableCell className="text-slate-500">{lead.industry ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <select
                        disabled={updating === lead._id}
                        value={lead.status}
                        onChange={(e) => updateStatus(lead._id, e.target.value as LeadStatus)}
                        className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                      {can("leads", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(lead)} title="Edit" aria-label={`Edit ${lead.companyName}`}>
                          <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                      )}
                      {can("leads", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(lead._id)} title="Delete" aria-label={`Delete ${lead.companyName}`}>
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
