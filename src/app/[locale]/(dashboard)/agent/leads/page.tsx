"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertCircle, AlertTriangle, Building2, Calendar,
  Edit2, Eye, Flame, Gauge, GripVertical, Inbox, LayoutGrid, List,
  Loader2, Mail, MapPin, MessageSquare, Phone, Plus, Search,
  Sparkles, Target, Trash2, TrendingUp, User, XCircle,
} from "lucide-react";
import {
  DndContext, DragOverlay, closestCorners, useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";
type LeadQualification = "cold" | "warm" | "hot" | "qualified";
type ViewMode = "board" | "table";

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  industry?: string;
  score?: number;
  qualificationLevel?: LeadQualification;
  expectedRevenue?: number;
  expectedRevenueCurrency?: string;
  source?: string;
  lostReason?: string;
  exhibitionId?: string;
  autoRouted?: boolean;
  status: LeadStatus;
  notes?: string;
  followUpAt?: string;
  createdAt: string;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

const STAGE_CONFIG: Record<LeadStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode; description: string }> = {
  new: {
    label: "New",
    color: "text-sky-700 dark:text-sky-300",
    bgColor: "bg-sky-50 dark:bg-sky-500/10",
    borderColor: "border-sky-200 dark:border-sky-500/30",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Fresh leads awaiting first contact",
  },
  contacted: {
    label: "Contacted",
    color: "text-indigo-700 dark:text-indigo-300",
    bgColor: "bg-indigo-50 dark:bg-indigo-500/10",
    borderColor: "border-indigo-200 dark:border-indigo-500/30",
    icon: <Phone className="h-4 w-4" />,
    description: "First outreach completed",
  },
  interested: {
    label: "Interested",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
    borderColor: "border-amber-200 dark:border-amber-500/30",
    icon: <TrendingUp className="h-4 w-4" />,
    description: "Showing engagement signals",
  },
  negotiating: {
    label: "Negotiating",
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-50 dark:bg-purple-500/10",
    borderColor: "border-purple-200 dark:border-purple-500/30",
    icon: <Target className="h-4 w-4" />,
    description: "Deal discussions in progress",
  },
  converted: {
    label: "Won",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
    borderColor: "border-emerald-200 dark:border-emerald-500/30",
    icon: <Building2 className="h-4 w-4" />,
    description: "Successfully converted",
  },
  lost: {
    label: "Lost",
    color: "text-rose-700 dark:text-rose-300",
    bgColor: "bg-rose-50 dark:bg-rose-500/10",
    borderColor: "border-rose-200 dark:border-rose-500/30",
    icon: <XCircle className="h-4 w-4" />,
    description: "Did not convert",
  },
};

const TEMP_STYLES: Record<string, string> = {
  hot: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
  warm: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  cold: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
  qualified: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
};

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

const LEAD_FIELDS: CrudField[] = [
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "contactPerson", label: "Contact Person", type: "text", required: true },
  { name: "contactEmail", label: "Contact Email", type: "email" },
  { name: "contactPhone", label: "Contact Phone", type: "text" },
  { name: "country", label: "Country", type: "text" },
  { name: "industry", label: "Industry", type: "text" },
  { name: "expectedRevenue", label: "Expected Revenue", type: "number" },
  { name: "source", label: "Lead Source", type: "text" },
  { name: "exhibitionId", label: "Exhibition", type: "select", options: [] },
  { name: "status", label: "Stage", type: "select", options: STAGES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
  { name: "lostReason", label: "Lost Reason", type: "text" },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "followUpAt", label: "Follow-up Date", type: "date" },
];

/* ─── Lead Card (Kanban) ────────────────────────────────────────────────── */

function DraggableLeadCard({
  lead,
  onEdit,
  onScore,
  onConvert,
  onStatusChange,
  scoring,
  converting,
  exhibitions,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  scoring: boolean;
  converting: boolean;
  exhibitions: { _id: string; eventName: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead._id,
    data: { lead },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <LeadCard
        lead={lead}
        onEdit={onEdit}
        onScore={onScore}
        onConvert={onConvert}
        onStatusChange={onStatusChange}
        scoring={scoring}
        converting={converting}
        exhibitions={exhibitions}
        dragListeners={listeners}
      />
    </div>
  );
}

function LeadCard({
  lead,
  onEdit,
  onScore,
  onConvert,
  onStatusChange,
  scoring,
  converting,
  exhibitions,
  dragListeners,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  scoring: boolean;
  converting: boolean;
  exhibitions: { _id: string; eventName: string }[];
  dragListeners?: Record<string, unknown>;
}) {
  const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
  const exhibition = lead.exhibitionId ? exhibitions.find((e) => e._id === lead.exhibitionId) : null;
  const stageIdx = STAGES.indexOf(lead.status);
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;

  return (
    <div
      className="group relative cursor-pointer rounded-2xl border border-border/60 bg-background p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:border-border hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
      onClick={() => onEdit(lead)}
    >
      {/* Drag handle */}
      {dragListeners && (
        <div
          {...dragListeners}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab rounded p-1 text-muted-foreground/30 opacity-0 transition group-hover:opacity-100 hover:text-muted-foreground active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {/* Top: Company + Score */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground">{lead.companyName}</h4>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.contactPerson}</span>
          </div>
        </div>
        {lead.score != null && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${TEMP_STYLES[lead.qualificationLevel ?? "cold"] ?? TEMP_STYLES.cold}`}>
            <Gauge className="h-2.5 w-2.5" />
            {lead.score}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {lead.country && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />{lead.country}
          </span>
        )}
        {lead.industry && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" />{lead.industry}
          </span>
        )}
        {lead.contactEmail && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3" /><span className="max-w-[100px] truncate">{lead.contactEmail}</span>
          </span>
        )}
      </div>

      {/* Bottom row */}
      <div className="mt-3 flex items-center gap-2">
        {lead.followUpAt && (
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
            isOverdue
              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
              : "bg-muted text-muted-foreground"
          }`}>
            <Calendar className="h-3 w-3" />
            {new Date(lead.followUpAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {isOverdue && <span className="font-bold"> overdue</span>}
          </span>
        )}
        {exhibition && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/10">
            {exhibition.eventName}
          </span>
        )}
        {lead.expectedRevenue != null && lead.expectedRevenue > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            {lead.expectedRevenueCurrency ?? "AED"} {lead.expectedRevenue.toLocaleString()}
          </span>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute -bottom-px left-0 right-0 hidden items-center justify-between rounded-b-2xl border-t border-border/40 bg-muted/80 px-3 py-2 backdrop-blur-sm group-hover:flex dark:bg-muted/40" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onScore(lead._id)}
            disabled={scoring}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-500/15"
            title="AI Score"
          >
            {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
          </button>
          {lead.status !== "converted" && lead.status !== "lost" && lead.contactEmail && (
            <button
              onClick={() => onConvert(lead)}
              disabled={converting}
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-500/15"
              title="Convert to Employer"
            >
              {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {nextStage && (
          <button
            onClick={() => onStatusChange(lead._id, nextStage)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/20"
            title={`Move to ${STAGE_CONFIG[nextStage].label}`}
          >
            Move to {STAGE_CONFIG[nextStage].label}
            <TrendingUp className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Kanban Column ─────────────────────────────────────────────────────── */

function DroppableKanbanColumn({
  stage,
  leads,
  onEdit,
  onScore,
  onConvert,
  onStatusChange,
  onAdd,
  scoringLeadId,
  convertingLeadId,
  exhibitions,
  canCreate,
}: {
  stage: LeadStatus;
  leads: Lead[];
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onAdd: () => void;
  scoringLeadId: string | null;
  convertingLeadId: string | null;
  exhibitions: { _id: string; eventName: string }[];
  canCreate: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage}` });
  const config = STAGE_CONFIG[stage];
  const totalRevenue = leads.reduce((sum, l) => sum + (l.expectedRevenue ?? 0), 0);

  return (
    <div className={`flex h-full w-[300px] min-w-[300px] flex-col rounded-2xl border bg-muted/30 transition-colors dark:bg-muted/10 ${isOver ? "border-primary/50 bg-primary/5 dark:bg-primary/10" : "border-border/50"}`}>
      {/* Column Header */}
      <div className={`flex items-center gap-3 rounded-t-2xl border-b px-4 py-3 ${config.bgColor} ${config.borderColor}`}>
        <span className={config.color}>{config.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${config.color}`}>{config.label}</h3>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${config.bgColor} ${config.color} border ${config.borderColor}`}>
              {leads.length}
            </span>
          </div>
          {totalRevenue > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
              AED {totalRevenue.toLocaleString()} pipeline
            </p>
          )}
        </div>
        {stage === "new" && canCreate && (
          <button
            onClick={onAdd}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
            title="Add new lead"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 340px)" }}>
        {leads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className={`rounded-full p-3 ${config.bgColor}`}>
              <Inbox className={`h-5 w-5 ${config.color}`} />
            </div>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        ) : (
          leads.map((lead) => (
            <DraggableLeadCard
              key={lead._id}
              lead={lead}
              onEdit={onEdit}
              onScore={onScore}
              onConvert={onConvert}
              onStatusChange={onStatusChange}
              scoring={scoringLeadId === lead._id}
              converting={convertingLeadId === lead._id}
              exhibitions={exhibitions}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function AgentLeadsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [exhibitionFilter, setExhibitionFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [scoringLeadId, setScoringLeadId] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<LeadScoreResult | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [exhibitions, setExhibitions] = useState<{ _id: string; eventName: string }[]>([]);
  const [duplicates, setDuplicates] = useState<{ _id: string; companyName: string; contactEmail?: string; contactPhone?: string; matchType: string; confidence: string; status: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DnD sensors — require 8px drag distance to avoid accidental drags
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const lead = (event.active.data.current as { lead: Lead })?.lead;
    if (lead) setActiveDragLead(lead);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragLead(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("column-")) return;
    const newStatus = overId.replace("column-", "") as LeadStatus;
    const leadId = String(active.id);
    const lead = leads.find((l) => l._id === leadId);
    if (!lead || lead.status === newStatus) return;
    // Optimistic update
    setLeads((prev) => prev.map((l) => l._id === leadId ? { ...l, status: newStatus } : l));
    // Persist to API (fire-and-forget, fetchLeads will re-sync)
    fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).then((res) => {
      if (!res.ok) toast.error("Failed to move lead");
    }).catch(() => toast.error("Failed to move lead"));
  }, [leads]);

  useEffect(() => {
    fetch("/api/exhibitions?limit=200")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setExhibitions(d.items ?? []))
      .catch(() => {});
  }, []);

  const leadFields = useMemo<CrudField[]>(() => {
    const exOpts = [{ value: "", label: "\u2014 None \u2014" }, ...exhibitions.map((e) => ({ value: e._id, label: e.eventName }))];
    return LEAD_FIELDS.map((f) => f.name === "exhibitionId" ? { ...f, options: exOpts } : f);
  }, [exhibitions]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (viewMode === "board") {
      params.set("limit", "200");
      params.set("page", "1");
    } else {
      const pp = pagination.paginationParams();
      pp.forEach((v, k) => params.set(k, v));
    }
    if (statusFilter) params.set("status", statusFilter);
    if (exhibitionFilter) params.set("exhibitionId", exhibitionFilter);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.items ?? []);
    pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    setLoading(false);
  }, [search, statusFilter, exhibitionFilter, pagination.page, pagination.limit, viewMode]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { pagination.resetPage(); }, [search, statusFilter, exhibitionFilter]);

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
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "string" && v.trim() === "") continue; // omit blank optional fields
      payload[k] = v;
    }
    if (payload.expectedRevenue) payload.expectedRevenue = Number(payload.expectedRevenue);
    else delete payload.expectedRevenue;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const detail = Array.isArray(err?.details) && err.details.length
        ? `${err.details[0].path}: ${err.details[0].message}`
        : null;
      throw new Error(detail ?? err?.error ?? "Failed to save lead");
    }
    setEditLead(null);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Delete this lead?");
    if (!ok) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  };

  const openEdit = (lead: Lead) => { setEditLead(lead); setDuplicates([]); setModalOpen(true); };
  const openAdd = () => { setEditLead(null); setDuplicates([]); setModalOpen(true); };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Company", key: "companyName" },
    { header: "Contact", key: "contactPerson" },
    { header: "Email", key: "contactEmail" },
    { header: "Phone", key: "contactPhone" },
    { header: "Country", key: "country" },
    { header: "Industry", key: "industry" },
    { header: "Stage", key: "status" },
    { header: "Score", key: "score" },
    { header: "Qualification", key: "qualificationLevel" },
    { header: "Expected Revenue", key: "expectedRevenue" },
    { header: "Source", key: "source" },
    { header: "Exhibition", key: "exhibitionId", formatter: (v) => v ? exhibitions.find((e) => e._id === String(v))?.eventName ?? "" : "" },
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

  // Group leads by stage for Kanban view
  const leadsByStage = useMemo(() => {
    const grouped: Record<LeadStatus, Lead[]> = { new: [], contacted: [], interested: [], negotiating: [], converted: [], lost: [] };
    for (const lead of leads) {
      if (grouped[lead.status]) grouped[lead.status].push(lead);
    }
    return grouped;
  }, [leads]);

  const stageCounts = useMemo(() => {
    return STAGES.reduce((acc, s) => {
      acc[s] = leadsByStage[s].length;
      return acc;
    }, {} as Record<LeadStatus, number>);
  }, [leadsByStage]);

  const totalPipelineValue = useMemo(() => {
    return leads
      .filter((l) => !["converted", "lost"].includes(l.status))
      .reduce((sum, l) => sum + (l.expectedRevenue ?? 0), 0);
  }, [leads]);

  return (
    <div className="page-container agent-legacy-surface space-y-5">
      {ConfirmDialogNode}

      {/* ──── Hero Header ──── */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Target className="h-3.5 w-3.5" />Lead Pipeline
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Employer Lead Management
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Visual pipeline to track employer leads from first contact through conversion. Hover cards to advance stages.
            </p>
          </div>

          {/* KPI chips */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Open</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {leads.filter((l) => !["converted", "lost"].includes(l.status)).length}
              </p>
              {totalPipelineValue > 0 && (
                <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  AED {totalPipelineValue.toLocaleString()}
                </p>
              )}
            </div>
            <div className="workspace-glass-panel rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Won</p>
              <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{stageCounts.converted}</p>
            </div>
            <div className="workspace-glass-panel rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="mt-1 text-xl font-bold text-foreground">{pagination.total}</p>
            </div>
            {can("leads", "create") && (
              <Button onClick={openAdd} className="h-11 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700">
                <Plus className="mr-1.5 h-4 w-4" />New Lead
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ──── Toolbar ──── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1">
            <button
              onClick={() => setViewMode("board")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                viewMode === "board"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Board
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                viewMode === "table"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />Table
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1 max-w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="h-10 w-full rounded-xl border border-border bg-background/70 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              value={exhibitionFilter}
              onChange={(e) => setExhibitionFilter(e.target.value)}
              className="h-10 max-w-[180px] truncate rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">All exhibitions</option>
              {exhibitions.map((e) => (
                <option key={e._id} value={e._id}>{e.eventName}</option>
              ))}
            </select>
          </div>

          {/* Export */}
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </div>

        {/* Stage pill filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STAGES.map((s) => {
            const config = STAGE_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  statusFilter === s
                    ? `${config.bgColor} ${config.borderColor} ${config.color}`
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {config.icon}
                <span>{config.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusFilter === s ? "bg-background/50" : "bg-muted"}`}>
                  {stageCounts[s]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ──── Content Area ──── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading pipeline...</span>
        </div>
      ) : viewMode === "board" ? (
        /* ──── KANBAN BOARD with Drag & Drop ──── */
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="overflow-x-auto pb-4">
            <div className="flex gap-4" style={{ minWidth: "fit-content" }}>
              {STAGES.filter((s) => !statusFilter || s === statusFilter).map((stage) => (
                <DroppableKanbanColumn
                  key={stage}
                  stage={stage}
                  leads={leadsByStage[stage]}
                  onEdit={openEdit}
                  onScore={scoreLead}
                  onConvert={convertLead}
                  onStatusChange={updateStatus}
                  onAdd={openAdd}
                  scoringLeadId={scoringLeadId}
                  convertingLeadId={convertingLeadId}
                  exhibitions={exhibitions}
                  canCreate={can("leads", "create")}
                />
              ))}
            </div>
          </section>
          <DragOverlay>
            {activeDragLead ? (
              <div className="w-[280px] rotate-2 rounded-2xl border border-primary/50 bg-background p-4 shadow-xl">
                <h4 className="truncate text-sm font-semibold text-foreground">{activeDragLead.companyName}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{activeDragLead.contactPerson}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ──── TABLE VIEW ──── */
        <>
          <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="rounded-2xl bg-muted/50 p-4">
                  <Inbox className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No leads in your pipeline yet</p>
                <p className="text-xs text-muted-foreground/70">Create your first lead to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-[200px] pl-5 text-[11px] font-semibold uppercase tracking-wider">Company</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Contact</TableHead>
                      <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider md:table-cell">Location</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Stage</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Score</TableHead>
                      <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider sm:table-cell">Follow-up</TableHead>
                      <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => {
                      const config = STAGE_CONFIG[lead.status];
                      const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
                      const stageIdx = STAGES.indexOf(lead.status);
                      return (
                        <TableRow
                          key={lead._id}
                          className="group border-border/30 transition-colors hover:bg-muted/20"
                        >
                          {/* Company */}
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="h-8 w-1 shrink-0 rounded-full"
                                style={{ backgroundColor: config.color.includes('sky') ? '#0ea5e9' : config.color.includes('indigo') ? '#6366f1' : config.color.includes('amber') ? '#f59e0b' : config.color.includes('purple') ? '#a855f7' : config.color.includes('emerald') ? '#10b981' : '#f43f5e' }}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{lead.companyName}</p>
                                {lead.industry && (
                                  <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {lead.industry}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Contact */}
                          <TableCell>
                            <p className="text-sm font-medium text-foreground">{lead.contactPerson}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              {lead.contactEmail && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Mail className="h-3 w-3 shrink-0" />{lead.contactEmail}
                                </span>
                              )}
                              {lead.contactPhone && (
                                <span className="hidden items-center gap-1 xl:inline-flex">
                                  <Phone className="h-3 w-3 shrink-0" />{lead.contactPhone}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Location */}
                          <TableCell className="hidden md:table-cell">
                            {lead.country ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />{lead.country}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Stage */}
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.bgColor} ${config.borderColor} ${config.color}`}>
                              {config.icon}
                              {config.label}
                            </span>
                          </TableCell>

                          {/* Score */}
                          <TableCell>
                            {lead.score != null ? (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${TEMP_STYLES[lead.qualificationLevel ?? "cold"] ?? TEMP_STYLES.cold}`}>
                                <Gauge className="h-3 w-3" />{lead.score}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Follow-up */}
                          <TableCell className="hidden sm:table-cell">
                            {lead.followUpAt ? (
                              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                isOverdue
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                <Calendar className="h-3 w-3" />
                                {new Date(lead.followUpAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                {isOverdue && <AlertCircle className="h-3 w-3" />}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="pr-5 text-right">
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                onClick={() => router.push(`leads/${lead._id}`)}
                                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => scoreLead(lead._id)}
                                disabled={scoringLeadId === lead._id}
                                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                                title="AI Score"
                              >
                                {scoringLeadId === lead._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                              </button>
                              {lead.status !== "converted" && lead.status !== "lost" && lead.contactEmail && (
                                <button
                                  onClick={() => convertLead(lead)}
                                  disabled={convertingLeadId === lead._id}
                                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                                  title="Convert"
                                >
                                  {convertingLeadId === lead._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                                </button>
                              )}
                              {can("leads", "update") && (
                                <button
                                  onClick={() => openEdit(lead)}
                                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              )}
                              {can("leads", "delete") && (
                                <button
                                  onClick={() => handleDelete(lead._id)}
                                  className="hidden rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 group-hover:inline-flex dark:hover:bg-rose-500/10"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
          />
        </>
      )}

      {/* ──── Detail Dialog ──── */}
      <Dialog open={!!detailLead} onOpenChange={() => setDetailLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              {detailLead?.companyName}
            </DialogTitle>
          </DialogHeader>
          {detailLead && (() => {
            const dConfig = STAGE_CONFIG[detailLead.status];
            const dStageIdx = STAGES.indexOf(detailLead.status);
            const exhibition = detailLead.exhibitionId ? exhibitions.find((e) => e._id === detailLead.exhibitionId) : null;
            return (
              <div className="space-y-5">
                {/* Contact info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</span>
                    <p className="mt-1 font-medium text-foreground">{detailLead.contactPerson}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</span>
                    <p className="mt-1 text-foreground">{detailLead.contactEmail || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</span>
                    <p className="mt-1 text-foreground">{detailLead.contactPhone || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location</span>
                    <p className="mt-1 text-foreground">{detailLead.country || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Industry</span>
                    <p className="mt-1 text-foreground">{detailLead.industry || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</span>
                    <p className="mt-1 text-foreground">{detailLead.source || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</span>
                    <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      {detailLead.expectedRevenue ? `${detailLead.expectedRevenueCurrency ?? "AED"} ${detailLead.expectedRevenue.toLocaleString()}` : "\u2014"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exhibition</span>
                    <p className="mt-1 text-foreground">{exhibition?.eventName || "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Follow-up</span>
                    <p className="mt-1 text-foreground">{detailLead.followUpAt ? new Date(detailLead.followUpAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "\u2014"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Created</span>
                    <p className="mt-1 text-foreground">{new Date(detailLead.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>

                {/* Notes */}
                {detailLead.notes && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
                    <p className="mt-1 rounded-lg bg-muted/50 p-3 text-sm text-foreground">{detailLead.notes}</p>
                  </div>
                )}

                {/* Pipeline progression */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Progress</span>
                  <div className="mt-2 flex items-center gap-1">
                    {STAGES.filter((s) => s !== "lost").map((s, i) => {
                      const sConfig = STAGE_CONFIG[s];
                      const sIdx = STAGES.indexOf(s);
                      const isActive = s === detailLead.status;
                      const isPast = sIdx < dStageIdx;
                      return (
                        <div key={s} className="flex items-center">
                          <button
                            onClick={() => { if (!isActive) { updateStatus(detailLead._id, s); setDetailLead({ ...detailLead, status: s }); } }}
                            disabled={isActive || updating === detailLead._id}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                              isActive
                                ? `${sConfig.bgColor} ${sConfig.borderColor} ${sConfig.color} border shadow-sm`
                                : isPast
                                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : "border border-border/50 text-muted-foreground/50 hover:border-border hover:text-muted-foreground"
                            }`}
                            title={isActive ? `Current: ${sConfig.label}` : `Move to ${sConfig.label}`}
                          >
                            {sConfig.icon}
                            {sConfig.label}
                          </button>
                          {i < 4 && (
                            <div className={`mx-1 h-px w-4 ${isPast ? "bg-emerald-300 dark:bg-emerald-500/50" : "bg-border/40"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Score */}
                {detailLead.score != null && (
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI Score</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${TEMP_STYLES[detailLead.qualificationLevel ?? "cold"] ?? TEMP_STYLES.cold}`}>
                      <Gauge className="h-3.5 w-3.5" />{detailLead.score}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">{detailLead.qualificationLevel ?? "cold"}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ──── CrudModal ──── */}
      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditLead(null); }}
        title={editLead ? "Edit Lead" : "New Lead"}
        fields={leadFields}
        initialValues={editLead ? {
          companyName: editLead.companyName,
          contactPerson: editLead.contactPerson,
          contactEmail: editLead.contactEmail ?? "",
          contactPhone: editLead.contactPhone ?? "",
          country: editLead.country ?? "",
          industry: editLead.industry ?? "",
          expectedRevenue: editLead.expectedRevenue != null ? String(editLead.expectedRevenue) : "",
          source: editLead.source ?? "",
          exhibitionId: editLead.exhibitionId ?? "",
          status: editLead.status,
          lostReason: editLead.lostReason ?? "",
          notes: editLead.notes ?? "",
          followUpAt: editLead.followUpAt?.slice(0, 10) ?? "",
        } : undefined}
        onSubmit={handleSave}
        onValuesChange={(vals) => {
          if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
          dupTimerRef.current = setTimeout(async () => {
            const params = new URLSearchParams();
            if (vals.companyName) params.set("companyName", vals.companyName);
            if (vals.contactEmail) params.set("contactEmail", vals.contactEmail);
            if (vals.contactPhone) params.set("contactPhone", vals.contactPhone);
            if (editLead) params.set("excludeId", editLead._id);
            if (!params.toString()) { setDuplicates([]); return; }
            try {
              const res = await fetch(`/api/leads/check-duplicates?${params}`);
              if (res.ok) { const d = await res.json(); setDuplicates(d.duplicates ?? []); }
            } catch { /* ignore */ }
          }, 500);
        }}
        warningNode={duplicates.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Potential duplicates found</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {duplicates.map((d) => (
                  <li key={d._id}>
                    <span className="font-medium">{d.companyName}</span>
                    {d.contactEmail && <span className="text-amber-600 dark:text-amber-400"> &middot; {d.contactEmail}</span>}
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase dark:bg-amber-500/20">
                      {d.matchType} match &middot; {d.confidence}
                    </span>
                    <span className="ml-1 text-amber-500">({d.status})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">You can still save \u2014 this is a warning only.</p>
            </div>
          </div>
        ) : undefined}
      />

      {/* ──── AI Score Dialog ──── */}
      <Dialog open={Boolean(scoreResult)} onOpenChange={(open) => { if (!open) setScoreResult(null); }}>
        <DialogContent className="max-w-lg rounded-[24px] border-border bg-background p-0">
          {scoreResult && (
            <>
              <DialogHeader className="border-b border-border px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${TEMP_STYLES[scoreResult.temperature] ?? ""}`}>
                    <Flame className="h-3 w-3" />
                    {scoreResult.temperature} \u2014 {scoreResult.score}/100
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
