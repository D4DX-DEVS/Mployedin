"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Building2, CheckCircle2, AlertCircle, Edit2, Flame, Inbox, Loader2, MessageSquare, Search, Sparkles, Trash2, XCircle } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

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

interface LeadScoreResult {
  lead: { id: string; companyName: string };
  score: number;
  temperature: "hot" | "warm" | "cold";
  reasoning: string;
  nextAction: string;
  suggestedFollowUpDays: number;
  draftMessage: string;
  riskFactors: string[];
}

const TEMP_STYLES: Record<string, string> = {
  hot: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
  warm: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  cold: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [scoringLeadId, setScoringLeadId] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<LeadScoreResult | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const pp = pagination.paginationParams();
    pp.forEach((v, k) => params.set(k, v));
    if (statusFilter) params.set("status", statusFilter);

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

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Company", key: "companyName" },
    { header: "Contact", key: "contactPerson" },
    { header: "Email", key: "contactEmail" },
    { header: "Phone", key: "contactPhone" },
    { header: "Country", key: "country" },
    { header: "Industry", key: "industry" },
    { header: "Stage", key: "status" },
    { header: "Follow Up", key: "followUpAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: leads as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-leads",
    title: "Agent Leads",
  });

  const scoreLead = async (leadId: string) => {
    setScoringLeadId(leadId);
    try {
      const res = await fetch("/api/ai/lead-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Scoring failed" }));
        throw new Error(err.error ?? "Failed to score lead");
      }
      const data: LeadScoreResult = await res.json();
      setScoreResult(data);
      toast.success(`Lead scored: ${data.temperature} (${data.score}/100)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI scoring failed");
    } finally {
      setScoringLeadId(null);
    }
  };

  const convertLead = async (lead: Lead) => {
    if (!lead.contactEmail) {
      toast.error("Cannot convert: lead has no contact email");
      return;
    }
    const ok = await confirmDialog(
      `Convert "${lead.companyName}" into an employer account? A new account will be created for ${lead.contactEmail}.`,
    );
    if (!ok) return;

    setConvertingLeadId(lead._id);
    try {
      const res = await fetch(`/api/leads/${lead._id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Conversion failed" }));
        throw new Error(data.error ?? "Failed to convert lead");
      }
      toast.success(`"${lead.companyName}" converted to employer successfully`);
      fetchLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lead conversion failed");
    } finally {
      setConvertingLeadId(null);
    }
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Lead Pipeline</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Track employer leads from first contact through conversion and keep your next follow-up visible in table view.</p>
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
      
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter leads</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search the funnel and filter by stage</h2>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search leads"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            right={
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
            }
          />
        </div>
      </section>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
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
                <TableHead>AI</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="h-32 text-center">
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
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => scoreLead(lead._id)}
                      disabled={scoringLeadId === lead._id}
                      title="AI Score"
                      aria-label={`AI score ${lead.companyName}`}
                    >
                      {scoringLeadId === lead._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : (
                        <Flame className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </Button>
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
                      {lead.status !== "converted" && lead.status !== "lost" && lead.contactEmail && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => convertLead(lead)}
                          disabled={convertingLeadId === lead._id}
                          title="Convert to Employer"
                          aria-label={`Convert ${lead.companyName} to employer`}
                        >
                          {convertingLeadId === lead._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                          ) : (
                            <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </Button>
                      )}
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

      {/* AI Lead Score Result Dialog */}
      <Dialog open={Boolean(scoreResult)} onOpenChange={(open) => { if (!open) setScoreResult(null); }}>
        <DialogContent className="max-w-lg rounded-[24px] border-border bg-background p-0">
          {scoreResult && (
            <>
              <DialogHeader className="border-b border-border px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${TEMP_STYLES[scoreResult.temperature] ?? ""}`}>
                    <Flame className="h-3 w-3" />
                    {scoreResult.temperature} — {scoreResult.score}/100
                  </div>
                  <DialogTitle className="text-lg font-semibold text-foreground">
                    {scoreResult.lead.companyName}
                  </DialogTitle>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{scoreResult.reasoning}</p>
              </DialogHeader>
              <div className="space-y-4 px-6 py-5">
                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended Next Action</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{scoreResult.nextAction}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Follow up in <span className="font-semibold text-foreground">{scoreResult.suggestedFollowUpDays}</span> days
                  </p>
                </div>

                <div className="workspace-glass-panel rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-sky-500" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Draft Follow-up Message</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{scoreResult.draftMessage}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-8 rounded-lg text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(scoreResult.draftMessage);
                      toast.success("Message copied to clipboard");
                    }}
                  >
                    Copy message
                  </Button>
                </div>

                {scoreResult.riskFactors.length > 0 && (
                  <div className="workspace-glass-panel rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk Factors</p>
                    <ul className="mt-2 space-y-1.5">
                      {scoreResult.riskFactors.map((risk) => (
                        <li key={risk} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
