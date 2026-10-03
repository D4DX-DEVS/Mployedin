"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useQueryFlag } from "@/hooks/useQueryFlag";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertCircle, AlertTriangle, Building2, Calendar, Check, Copy,
  Flame, Gauge, Inbox, LayoutGrid, List,
  Mail, MapPin, MessageSquare, PanelRightOpen, Pencil, Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext, DragOverlay, closestCorners, useSensor, useSensors,
  MouseSensor, TouchSensor, KeyboardSensor,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions, InlinePicker, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { HIRING_RANGES, knownStageDetails, missingStageFields } from "@/lib/leads/stageRules";
import {
  HIRING_RANGE_KEYS, STAGES, TEMP_STYLES, getStageConfig,
  type Lead, type LeadStatus,
} from "./_components/leadShared";
import { DraggableLeadCard } from "./_components/LeadCard";
import type { LeadActionHandlers, LeadActionState } from "./_components/LeadActionsMenu";
import { LeadWorkspace, type WorkspaceTab } from "./_components/LeadWorkspace";
import { MoveStageDialog } from "./_components/MoveStageDialog";
import { FollowUpDialog } from "./_components/FollowUpDialog";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ViewMode = "board" | "table";

/* ─── Constants ─────────────────────────────────────────────────────────── */

/* The board pages every stage together: page 2 shows each column's next
   `limit` cards, under the same pagination bar as the table. The board used to
   pull `limit=200` in one request, and later hid a "Load more" button at the
   bottom of each column's own scroll, where nobody found it (owner,
   2026-10-02: "this page need a pagination"). */
type StageBucket = { items: Lead[]; total: number };
const emptyStageBuckets = (): Record<LeadStatus, StageBucket> =>
  STAGES.reduce((acc, st) => {
    acc[st] = { items: [], total: 0 };
    return acc;
  }, {} as Record<LeadStatus, StageBucket>);

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

function getLeadFields(t: ReturnType<typeof useTranslations>, { isEdit }: { isEdit: boolean }): CrudField[] {
  return [
    { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
    { name: "contactPerson", label: t("fieldContactPerson"), type: "text", required: true },
    { name: "contactEmail", label: t("fieldContactEmail"), type: "email" },
    { name: "contactPhone", label: t("fieldContactPhone"), type: "phone" },
    { name: "country", label: t("fieldCountry"), type: "text" },
    { name: "industry", label: t("fieldIndustry"), type: "text" },
    { name: "expectedRevenue", label: t("fieldExpectedRevenue"), type: "number" },
    {
      name: "expectedHiring",
      label: t("moveFieldExpectedHiring"),
      type: "select",
      options: [{ value: "", label: t("noneOption") }, ...HIRING_RANGES.map((range) => ({ value: range, label: t(HIRING_RANGE_KEYS[range]) }))],
    },
    { name: "requirement", label: t("moveFieldRequirement"), type: "text", placeholder: t("requirementPlaceholder") },
    { name: "source", label: t("fieldLeadSource"), type: "text" },
    { name: "exhibitionId", label: t("fieldExhibition"), type: "select", options: [] },
    { name: "notes", label: t("fieldNotes"), type: "textarea" },
    // Stage and lost reason are no longer form fields: a stage changes only
    // through the Move dialog, which asks for that stage's details. A follow-up
    // is managed in the workspace with its time and type; only a new lead's
    // form offers a first date, so editing cannot flatten a set time to midnight.
    ...(isEdit ? [] : [{ name: "followUpAt", label: t("fieldFollowUpDate"), type: "date" as const }]),
  ];
}

// Thirteen fields scrolled past the footer in one column, so the form is two
// steps: who the lead is, then where the deal stands.
const LEAD_FORM_STEPS = [
  { labelKey: "formStepCompany", fields: ["companyName", "contactPerson", "contactEmail", "contactPhone", "country", "industry"] },
  { labelKey: "formStepDeal", fields: ["expectedRevenue", "expectedHiring", "requirement", "source", "exhibitionId", "notes", "followUpAt"] },
] as const;

/* ─── Kanban Column ─────────────────────────────────────────────────────── */

function DroppableKanbanColumn({
  stage,
  leads,
  total,
  onAdd,
  actions,
  actionState,
  exhibitionName,
  canCreate,
  t,
  locale,
  stageConfig,
}: {
  stage: LeadStatus;
  leads: Lead[];
  total: number;
  onAdd: () => void;
  actions: LeadActionHandlers;
  actionState: LeadActionState;
  exhibitionName: (id?: string) => string | undefined;
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  stageConfig: ReturnType<typeof getStageConfig>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage}` });
  const config = stageConfig[stage];
  const totalRevenue = leads.reduce((sum, l) => sum + (l.expectedRevenue ?? 0), 0);
  // A summed figure is only meaningful when every valued lead shares one
  // currency; with a mix, a single-currency total would be wrong.
  const revenueCurrencies = [...new Set(leads.filter((l) => (l.expectedRevenue ?? 0) > 0).map((l) => l.expectedRevenueCurrency ?? "AED"))];
  const pipelineCurrency = revenueCurrencies.length === 1 ? revenueCurrencies[0] : null;

  return (
    /* The droppable is the whole column, not just the card list — a card
       released over the header used to snap back with nothing happening. */
    <div
      ref={setNodeRef}
      className={`flex h-full w-full min-w-0 flex-col rounded-xl border bg-muted/30 transition-colors sm:w-auto sm:min-w-[140px] sm:flex-1 sm:basis-0 ${isOver ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border/50"}`}
    >
      {/* Column Header */}
      <div className={`rounded-t-xl border-b px-2.5 py-1.5 ${config.bgColor} ${config.borderColor}`}>
        <div className="flex items-center gap-1.5">
          <span className={`shrink-0 ${config.color} [&_svg]:h-3.5 [&_svg]:w-3.5`}>{config.icon}</span>
          <h3 className={`min-w-0 truncate text-xs font-semibold ${config.color}`} title={config.label}>{config.label}</h3>
          {/* The stage's own server-side total, not how many cards are loaded. */}
          <span className={`shrink-0 rounded-full border px-1.5 text-[10px] font-bold leading-4 ${config.bgColor} ${config.color} ${config.borderColor}`}>
            {total}
          </span>
          {stage === "new" && canCreate && (
            <button
              onClick={onAdd}
              className="tap-target-box ms-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
              title={t("addNewLead")}
              aria-label={t("addNewLead")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {totalRevenue > 0 && pipelineCurrency && (
          <p className="truncate text-[10px] font-medium leading-tight text-muted-foreground">
            {pipelineCurrency} {formatCount(totalRevenue)}
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5" style={{ maxHeight: "calc(100vh - 236px)" }}>
        {leads.length === 0 ? (
          <div className={`flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-5 text-center transition-colors ${isOver ? "border-primary/60 bg-primary/5" : "border-transparent"}`}>
            <div className={`rounded-full p-2 ${config.bgColor}`}>
              <Inbox className={`h-4 w-4 ${config.color}`} />
            </div>
            {/* A stage with leads that simply ran out before this page. */}
            <p className="px-2 text-[11px] leading-tight text-muted-foreground">
              {total > 0 ? t("boardColumnPageEmpty") : config.description}
            </p>
          </div>
        ) : (
          leads.map((lead) => (
            <DraggableLeadCard
              key={lead._id}
              lead={lead}
              stage={config}
              exhibitionName={exhibitionName(lead.exhibitionId)}
              actions={actions}
              state={actionState}
              t={t}
              locale={locale}
            />
          ))
        )}

      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function AgentLeadsPage() {
  const t = useTranslations("agentLeads");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const tc = useTranslations("common");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const { setTotal, setTotalPages, setPage, resetPage } = pagination;
  // Only the newest list request may answer. Six column requests per page
  // plus a fetch per search keystroke race; a slow old one landing last would
  // show page 2's cards under "page 3" (or call setPage from a stale page).
  const listRequestRef = useRef(0);
  // handleDragEnd is declared before refreshData; it resyncs through this.
  const quietResyncRef = useRef<() => void>(() => {});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Filters live in the query string so "leads due today" and "leads in
  // negotiation" are addresses the dashboard queue, nav badges and ⌘K can link.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [exhibitionFilter, setExhibitionFilter] = useUrlFilter("exhibitionId", "all");
  const [followUpFilter, setFollowUpFilter] = useUrlFilter("followUp", "all");
  const [updating, setUpdating] = useState<string | null>(null);
  // `?new=1` gives the create dialog an address, so the Create menu, the
  // command palette and /agent/leads/new all open this one form.
  const [modalOpen, setModalOpen] = useQueryFlag("new");
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [scoringLeadId, setScoringLeadId] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<LeadScoreResult | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  /**
   * The sign-in details a conversion just produced.
   *
   * The password is returned by the API exactly once and is never stored in
   * readable form, so this dialog is the only chance to copy it. The same
   * details are emailed to the employer at the same moment.
   */
  const [credentials, setCredentials] = useState<{ company: string; email: string; password: string; emailSent: boolean } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyValue = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };
  const [exhibitions, setExhibitions] = useState<{ _id: string; eventName: string }[]>([]);
  const [duplicates, setDuplicates] = useState<{ _id: string; companyName: string; contactEmail?: string; contactPhone?: string; matchType: string; confidence: string; status: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);
  // The board keeps one bucket per stage, each paged on its own; the table keeps
  // using `leads` with the shared page controls.
  const [stageBuckets, setStageBuckets] = useState<Record<LeadStatus, StageBucket>>(emptyStageBuckets);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The Lead Workspace has an address (`?lead=<id>`), so a notification, the
  // dashboard or a shared link can open one lead over the board.
  const [workspaceLeadId, setWorkspaceLeadId] = useUrlFilter("lead", "");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [focusNoteComposer, setFocusNoteComposer] = useState(false);
  // Bumped after a page-owned dialog changes a lead, so the workspace re-reads it.
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [moveRequest, setMoveRequest] = useState<{ lead: Lead; target?: LeadStatus; lock: boolean } | null>(null);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);

  const STAGE_CONFIG = useMemo(() => getStageConfig(t), [t]);

  // One PointerSensor could not serve both inputs: the distance constraint it
  // needs on a mouse makes every touch-scroll of a column start a drag. Split
  // them — mouse drags after 6px, touch after a 220ms press, keyboard on
  // space/enter + arrows.
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
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
    // The dragged card travels on the event itself. Reading it out of `leads`
    // was wrong once the board switched to per-stage buckets: that array is
    // only filled for the table, so every drop silently did nothing.
    const lead = (active.data.current as { lead?: Lead } | undefined)?.lead;
    if (!lead) return;
    // A release over another card resolves to that card's column, so a drop
    // does not have to land on empty column space to count.
    const allLoaded = STAGES.flatMap((st) => stageBuckets[st]?.items ?? []);
    const newStatus = overId.startsWith("column-")
      ? (overId.replace("column-", "") as LeadStatus)
      : allLoaded.find((l) => l._id === overId)?.status;
    if (!newStatus || lead.status === newStatus) return;
    // A drop that needs details (Won, Lost, or a forward stage the lead has no
    // facts for yet) opens the Move dialog on that stage instead of moving.
    if (newStatus === "converted" || newStatus === "lost" || missingStageFields(lead.status, newStatus, {}, knownStageDetails(lead)).length > 0) {
      setMoveRequest({ lead, target: newStatus, lock: true });
      return;
    }
    const leadId = lead._id;
    const from = lead.status;
    // Optimistic update — the card jumps columns now, and each stage's total
    // follows it so the header counts do not drift from what is on screen.
    setLeads((prev) => prev.map((l) => l._id === leadId ? { ...l, status: newStatus } : l));
    setStageBuckets((prev) => ({
      ...prev,
      [from]: {
        ...prev[from],
        items: prev[from].items.filter((l) => l._id !== leadId),
        total: Math.max(0, prev[from].total - 1),
      },
      [newStatus]: {
        ...prev[newStatus],
        items: [{ ...lead, status: newStatus }, ...prev[newStatus].items],
        total: prev[newStatus].total + 1,
      },
    }));
    const revert = () => {
      setLeads((prev) => prev.map((l) => l._id === leadId ? { ...l, status: from } : l));
      setStageBuckets((prev) => ({
        ...prev,
        [newStatus]: {
          ...prev[newStatus],
          items: prev[newStatus].items.filter((l) => l._id !== leadId),
          total: Math.max(0, prev[newStatus].total - 1),
        },
        [from]: {
          ...prev[from],
          items: [lead, ...prev[from].items.filter((l) => l._id !== leadId)],
          total: prev[from].total + 1,
        },
      }));
    };
    // Persist to API (fire-and-forget, fetchLeads will re-sync)
    fetch(`/api/leads/${leadId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).then((res) => {
      if (!res.ok) {
        toast.error(t("failedToMoveLead"));
        revert(); // the optimistic move was a lie
        return;
      }
      toast.success(t("leadMovedToStage", { stage: STAGE_CONFIG[newStatus].label }));
      // The optimistic card can leave a column one over the page size and the
      // page count stale; re-read the page quietly.
      quietResyncRef.current();
    }).catch(() => {
      toast.error(t("failedToMoveLead"));
      revert();
    });
  }, [stageBuckets, t, STAGE_CONFIG]);

  useEffect(() => {
    fetch("/api/exhibitions?limit=200")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setExhibitions(d.items ?? []))
      .catch(() => {});
  }, []);

  const leadFields = useMemo<CrudField[]>(() => {
    const baseFields = getLeadFields(t, { isEdit: Boolean(editLead) });
    const exOpts = [{ value: "", label: t("noneOption") }, ...exhibitions.map((e) => ({ value: e._id, label: e.eventName }))];
    return baseFields.map((f) => f.name === "exhibitionId" ? { ...f, options: exOpts } : f);
  }, [exhibitions, t, editLead]);

  const leadSteps = useMemo(
    () => LEAD_FORM_STEPS.map((step) => ({ label: t(step.labelKey), fields: [...step.fields] })),
    [t],
  );

  // Filters every request carries, whichever view is asking.
  const sharedParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (exhibitionFilter !== "all") params.set("exhibitionId", exhibitionFilter);
    if (followUpFilter !== "all") params.set("followUp", followUpFilter);
    return params;
  }, [search, exhibitionFilter, followUpFilter]);

  const visibleStages = useMemo(
    () => STAGES.filter((st) => statusFilter === "all" || st === statusFilter),
    [statusFilter],
  );

  const fetchStage = useCallback(async (stage: LeadStatus) => {
    const params = sharedParams();
    params.set("status", stage);
    params.set("limit", String(pagination.limit));
    params.set("page", String(pagination.page));
    try {
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) return { items: [] as Lead[], total: 0, success: false };
      const data = await res.json();
      return { items: (data.items ?? []) as Lead[], total: (data.total ?? 0) as number, success: true };
    } catch {
      return { items: [] as Lead[], total: 0, success: false };
    }
  }, [sharedParams, pagination.page, pagination.limit]);

  // `quiet` re-reads after a change without the skeleton: the agent stays on
  // the cards they were looking at instead of watching the board blink.
  const fetchBoard = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const request = ++listRequestRef.current;
    if (!quiet) setLoading(true);
    setError("");
    const results = await Promise.all(visibleStages.map((st) => fetchStage(st)));
    if (request !== listRequestRef.current) return;
    if (results.some((r) => !r.success)) {
      // A failed background refresh keeps the board it already shows.
      if (!quiet) setError(t("failedToLoadLeads"));
      setLoading(false);
      return;
    }
    setStageBuckets(() => {
      const next = emptyStageBuckets();
      visibleStages.forEach((st, i) => {
        next[st] = { items: results[i].items, total: results[i].total };
      });
      return next;
    });
    // As many pages as the longest stage needs.
    const pages = Math.max(1, ...results.map((r) => Math.ceil(r.total / pagination.limit)));
    setTotal(results.reduce((sum, r) => sum + r.total, 0));
    setTotalPages(pages);
    // A move or delete can empty the last page; step back to one that exists.
    if (pagination.page > pages) setPage(pages);
    setLoading(false);
  }, [visibleStages, fetchStage, t, pagination.limit, pagination.page, setTotal, setTotalPages, setPage]);

  const fetchLeads = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const request = ++listRequestRef.current;
    const current = () => request === listRequestRef.current;
    if (!quiet) setLoading(true);
    setError("");
    const params = sharedParams();
    const pp = pagination.paginationParams();
    pp.forEach((v, k) => params.set(k, v));
    if (statusFilter !== "all") params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/leads?${params}`);
      if (!current()) return;
      if (!res.ok) {
        setError(t("failedToLoadLeads"));
        setLeads([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!current()) return;
      setLeads(data.items ?? []);
      pagination.updateTotal(data.total ?? data.items?.length ?? 0);
      setError("");
    } catch {
      if (!current()) return;
      setError(t("failedToLoadLeads"));
      setLeads([]);
    } finally {
      if (current()) setLoading(false);
    }
  }, [sharedParams, statusFilter, pagination.page, pagination.limit, t]);

  const refreshData = useCallback((options?: { quiet?: boolean }) => {
    return viewMode === "board" ? fetchBoard(options) : fetchLeads(options);
  }, [viewMode, fetchBoard, fetchLeads]);

  useEffect(() => {
    if (viewMode === "board") { fetchBoard(); } else { fetchLeads(); }
  }, [viewMode, fetchBoard, fetchLeads]);
  // Back to page 1 when a filter actually changes. Running this on load as
  // well dropped a ?page= from the URL, so back/forward never restored it.
  const filterKey = [search, statusFilter, exhibitionFilter, followUpFilter].join("|");
  const lastFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKeyRef.current === filterKey) return;
    lastFilterKeyRef.current = filterKey;
    resetPage();
  }, [filterKey, resetPage]);

  /** After any change to a lead: re-read the board or table, and the open workspace. */
  const afterLeadChange = useCallback(() => {
    void refreshData({ quiet: true });
    setWorkspaceVersion((v) => v + 1);
  }, [refreshData]);
  useEffect(() => { quietResyncRef.current = () => { void refreshData({ quiet: true }); }; }, [refreshData]);

  /** The table's stage picker: moves at once when the stage needs nothing new,
   *  otherwise asks for it in the Move dialog — the same rule as a drop. */
  const requestStageChange = async (lead: Lead, status: LeadStatus) => {
    if (status === "converted" || status === "lost" || missingStageFields(lead.status, status, {}, knownStageDetails(lead)).length > 0) {
      setMoveRequest({ lead, target: status, lock: true });
      return;
    }
    setUpdating(lead._id);
    try {
      const res = await fetch(`/api/leads/${lead._id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error(t("failedToMoveLead"));
        return;
      }
      toast.success(t("leadMovedToStage", { stage: STAGE_CONFIG[status].label }));
      afterLeadChange();
    } catch {
      toast.error(t("failedToMoveLead"));
    } finally {
      setUpdating(null);
    }
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
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: leadFields, conflict: tf("emailInUse") });
    }
    setEditLead(null);
    afterLeadChange();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("confirmDeleteLead"));
    if (!ok) return;
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    // Was unchecked: a 403 from the permission guard left the row on screen with
    // no message, reading as a delete that silently did nothing.
    if (!res.ok) {
      toast.error(t("failedToDeleteLead"));
      return;
    }
    if (workspaceLeadId === id) setWorkspaceLeadId("");
    refreshData();
  };

  const openEdit = (lead: Lead) => { setEditLead(lead); setDuplicates([]); setModalOpen(true); };
  const openAdd = () => { setEditLead(null); setDuplicates([]); setModalOpen(true); };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportHeaderCompany"), key: "companyName" },
    { header: t("exportHeaderContact"), key: "contactPerson" },
    { header: tc("email"), key: "contactEmail" },
    { header: tc("phone"), key: "contactPhone" },
    { header: tc("country"), key: "country" },
    { header: t("exportHeaderIndustry"), key: "industry" },
    { header: t("exportHeaderStage"), key: "status" },
    { header: t("exportHeaderScore"), key: "score" },
    { header: t("exportHeaderQualification"), key: "qualificationLevel" },
    { header: t("exportHeaderExpectedRevenue"), key: "expectedRevenue" },
    { header: t("exportHeaderSource"), key: "source" },
    { header: t("exportHeaderExhibition"), key: "exhibitionId", formatter: (v) => v ? exhibitions.find((e) => e._id === String(v))?.eventName ?? "" : "" },
    { header: t("exportHeaderFollowUp"), key: "followUpAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : "" },
    { header: t("exportHeaderCreated"), key: "createdAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: leads as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: t("exportFilename"),
    title: t("pageTitle"),
  });

  // On the board there is no single `leads` page to hand the exporter — each
  // column holds its own slice — so an export re-reads the whole filtered set
  // rather than shipping only the cards that happen to be loaded.
  const exportBoard = useCallback(async (kind: "csv" | "excel" | "pdf") => {
    const params = sharedParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", "1");
    params.set("limit", "500");
    const res = await fetch(`/api/leads?${params}`);
    if (!res.ok) { toast.error(t("exportFailed")); return; }
    const data = await res.json();
    const rows = (data.items ?? []) as unknown as Record<string, unknown>[];
    const cols = exportColumns as unknown as ExportColumn<Record<string, unknown>>[];
    const name = t("exportFilename");
    const mod = await import("@/lib/export");
    if (kind === "csv") mod.exportCSV(rows, cols, `${name}.csv`);
    else if (kind === "excel") await mod.exportExcel(rows, cols, `${name}.xls`, t("pageTitle"));
    else await mod.exportPdf(rows, cols, `${name}.pdf`, t("pageTitle"));
  }, [sharedParams, statusFilter, exportColumns, t]);

  const scoreLead = async (leadId: string) => {
    setScoringLeadId(leadId);
    try {
      const res = await fetch("/api/ai/lead-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("scoringFailed") }));
        throw new Error(err.error ?? t("failedToScoreLead"));
      }
      const data: LeadScoreResult = await res.json();
      setScoreResult(data);
      toast.success(t("leadScored", { temperature: data.temperature, score: data.score }));
    } catch {
      toast.error(t("aiScoringFailed"));
    } finally {
      setScoringLeadId(null);
    }
  };

  const convertLead = async (lead: Lead, { skipConfirm = false }: { skipConfirm?: boolean } = {}) => {
    if (!lead.contactEmail) {
      toast.error(t("cannotConvertNoEmail"));
      return;
    }
    if (!skipConfirm) {
      const ok = await confirmDialog(
        t("confirmConvertLead", { company: lead.companyName, email: lead.contactEmail }),
      );
      if (!ok) return;
    }
    setConvertingLeadId(lead._id);
    try {
      const res = await fetch(`/api/leads/${lead._id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({ error: t("conversionFailed") }));
      if (!res.ok) {
        throw new Error(data.error ?? t("failedToConvertLead"));
      }
      toast.success(t("leadConvertedSuccess", { company: lead.companyName }));
      if (data.credentials?.password) {
        setCredentials({
          company: lead.companyName,
          email: data.credentials.email,
          password: data.credentials.password,
          emailSent: data.credentials.emailSent !== false,
        });
      }
      afterLeadChange();
    } catch {
      toast.error(t("leadConversionFailed"));
    } finally {
      setConvertingLeadId(null);
    }
  };

  const exhibitionName = useCallback(
    (id?: string) => (id ? exhibitions.find((e) => e._id === id)?.eventName : undefined),
    [exhibitions],
  );

  /** Marking a lead Won offers its employer account straight away (owner's
   *  call, 2026-10-02); "Cancel" leaves Create employer account on the lead. */
  const offerEmployerAccount = async (lead: Lead) => {
    if (!can("leads", "update")) return;
    if (!lead.contactEmail) {
      toast.info(t("wonAddEmailForAccount"));
      return;
    }
    const ok = await confirmDialog({
      title: t("createAccountPromptTitle"),
      message: t("createAccountPromptMessage", { company: lead.companyName, email: lead.contactEmail }),
      confirmLabel: t("createAccountNow"),
      // Creating an account is the good outcome, not a destructive one.
      variant: "default",
    });
    if (ok) await convertLead(lead, { skipConfirm: true });
  };

  const onLeadMoved = (lead: Lead) => {
    toast.success(t("leadMovedToStage", { stage: STAGE_CONFIG[lead.status].label }));
    afterLeadChange();
    if (lead.status === "converted" && !lead.convertedToEmployerId) void offerEmployerAccount(lead);
  };

  const openWorkspace = (lead: Lead, tab: WorkspaceTab = "overview") => {
    setWorkspaceTab(tab);
    setFocusNoteComposer(false);
    setWorkspaceLeadId(lead._id);
  };

  const leadActions: LeadActionHandlers = {
    open: openWorkspace,
    edit: openEdit,
    move: (lead, target, lockTarget = false) => setMoveRequest({ lead, target, lock: lockTarget }),
    followUp: setFollowUpLead,
    addNote: (lead) => { openWorkspace(lead, "notes"); setFocusNoteComposer(true); },
    score: (lead) => { void scoreLead(lead._id); },
    createAccount: (lead) => { void convertLead(lead); },
    remove: (lead) => { void handleDelete(lead._id); },
  };
  const actionState: LeadActionState = {
    canUpdate: can("leads", "update"),
    canDelete: can("leads", "delete"),
    scoringId: scoringLeadId,
    convertingId: convertingLeadId,
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <WorkspaceHeader
        title={t("pageTitle")}
        context={t("heroDescription")}
        actions={can("leads", "create") ? (
          <Button onClick={openAdd} aria-label={t("newLead")} className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("newLead")}</span>
          </Button>
        ) : null}
      />

      {/* ──── View Toggle ──── */}
      <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1 mb-3">
        <button
          onClick={() => { if (viewMode !== "board") { setViewMode("board"); pagination.resetPage(); } }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition min-h-11 px-3 ${ viewMode === "board" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground" }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />{t("viewBoard")}
        </button>
        <button
          onClick={() => { if (viewMode !== "table") { setViewMode("table"); pagination.resetPage(); } }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition min-h-11 px-3 ${ viewMode === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground" }`}
        >
          <List className="h-3.5 w-3.5" />{t("viewTable")}
        </button>
      </div>

      {/* ──── Filters (InlineFilterBar) ──── */}
      {/* Both views: the board's stage fetches read the same search, stage,
          exhibition and follow-up filters as the table. */}
      <InlineFilterBar className="workspace-panel-surface rounded-2xl border-b-0 mb-3"
        onExportCsv={viewMode === "board" ? () => void exportBoard("csv") : handleExportCsv}
        onExportExcel={viewMode === "board" ? () => void exportBoard("excel") : handleExportExcel}
        onExportPdf={viewMode === "board" ? () => void exportBoard("pdf") : handleExportPdf}
        onClear={search || statusFilter !== "all" || exhibitionFilter !== "all" || followUpFilter !== "all" ? () => {
          setSearch("");
          setStatusFilter("all");
          setExhibitionFilter("all");
          setFollowUpFilter("all");
        } : undefined}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}>
          <SelectTrigger aria-label={t("tableHeaderStage")} className={INLINE_FILTER_CONTROL}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStages")}</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={exhibitionFilter} onValueChange={(v) => { setExhibitionFilter(v); pagination.resetPage(); }}>
          <SelectTrigger aria-label={t("allExhibitions")} className={`${INLINE_FILTER_CONTROL} truncate`} title={exhibitions.find((e) => e._id === exhibitionFilter)?.eventName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allExhibitions")}</SelectItem>
            {exhibitions.map((e) => (
              <SelectItem key={e._id} value={e._id}>{e.eventName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setFollowUpFilter(followUpFilter === "due" ? "all" : "due")}
          aria-pressed={followUpFilter === "due"}
          title={t("dueFollowUpsHint")}
          className={`inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition sm:h-9 ${
            followUpFilter === "due"
              ? "border-status-rejected/30 bg-status-rejected-bg text-status-rejected"
              : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("dueFollowUps")}
        </button>
      </InlineFilterBar>

      {/* ──── Content Area ──── */}
      {loading && viewMode === "board" ? (
        <section className="flex gap-2.5 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className="w-[252px] shrink-0 space-y-1.5">
              <Skeleton className="h-7 w-full rounded-xl" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </section>
      ) : error && viewMode === "board" ? (
        <section className="workspace-panel-surface rounded-2xl p-6">
          <ErrorState onRetry={() => void fetchBoard()} />
        </section>
      ) : viewMode === "board" ? (
        /* ──── KANBAN BOARD with Drag & Drop ──── */
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Phones stack the stages; sideways scrolling hid every column but
              the first and fought the page's own vertical scroll. */}
          {/* Six columns divide the row rather than running off it — the board
              only falls back to sideways scrolling when they hit their 168px
              floor. Phones keep stacking them. */}
          <section className="pb-2 sm:overflow-x-auto">
            <div className="flex flex-col gap-2 sm:w-full sm:flex-row sm:gap-2">
              {visibleStages.map((stage) => (
                <DroppableKanbanColumn
                  key={stage}
                  stage={stage}
                  leads={stageBuckets[stage].items}
                  total={stageBuckets[stage].total}
                  onAdd={openAdd}
                  actions={leadActions}
                  actionState={actionState}
                  exhibitionName={exhibitionName}
                  canCreate={can("leads", "create")}
                  t={t}
                  locale={locale}
                  stageConfig={STAGE_CONFIG}
                />
              ))}
            </div>
          </section>
          <DragOverlay>
            {activeDragLead ? (
              <div className="w-[240px] rotate-2 cursor-grabbing rounded-xl border border-primary/60 bg-background shadow-xl chip-pad">
                <h4 className="truncate text-[13px] font-semibold leading-tight text-foreground">{activeDragLead.companyName}</h4>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{activeDragLead.contactPerson}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ──── TABLE VIEW ──── */
        <>
          <section className="workspace-panel-surface overflow-hidden rounded-2xl">
            {error ? (
              <div className="p-6">
                <ErrorState onRetry={() => void fetchLeads()} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>{t("tableHeaderCompany")}</TableHead>
                      <TableHead>{t("tableHeaderStage")}</TableHead>
                      <TableHead>{t("tableHeaderContact")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("tableHeaderLocation")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("tableHeaderFollowUp")}</TableHead>
                      <TableHead>{t("tableHeaderScore")}</TableHead>
                      <TableHead className="text-right">{tc("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableBodySkeleton rows={5} cols={7} />
                    ) : leads.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="py-12">
                          <EmptyState title={t("emptyPipelineTitle")} description={t("emptyPipelineDescription")} icon={Inbox} />
                        </TableCell>
                      </TableRow>
                    ) : leads.map((lead) => {
                      const config = STAGE_CONFIG[lead.status];
                      const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
                      const rowActions: { quick: RowAction[]; menu: RowAction[] } = {
                        quick: [],
                        menu: [],
                      };

                      rowActions.quick.push({
                        key: "open",
                        label: t("openLead"),
                        icon: PanelRightOpen,
                        iconOnly: true,
                        onSelect: () => openWorkspace(lead),
                      });

                      // Quick action: Edit
                      if (can("leads", "update")) {
                        rowActions.quick.push({
                          key: "edit",
                          label: tc("edit"),
                          icon: Pencil,
                          iconOnly: true,
                          onSelect: () => openEdit(lead),
                        });
                      }

                      // Menu actions
                      rowActions.menu.push({
                        key: "score",
                        label: t("aiScore"),
                        icon: Flame,
                        pending: scoringLeadId === lead._id,
                        onSelect: () => scoreLead(lead._id),
                      });

                      // An employer account follows a Won lead (Mark Won offers it).
                      if (lead.status === "converted" && !lead.convertedToEmployerId && can("leads", "update")) {
                        rowActions.menu.push({
                          key: "convert",
                          label: t("createEmployerAccount"),
                          icon: Building2,
                          pending: convertingLeadId === lead._id,
                          onSelect: () => convertLead(lead),
                        });
                      }

                      if (can("leads", "delete")) {
                        rowActions.menu.push({
                          key: "delete",
                          label: tc("delete"),
                          icon: Trash2,
                          onSelect: () => handleDelete(lead._id),
                          destructive: true,
                        });
                      }

                      return (
                        <TableRow
                          key={lead._id}
                          className="group border-border/30 transition-colors hover:bg-muted/20"
                        >
                          {/* Company */}
                          <TableCell className="min-w-0">
                            <div className="flex min-w-0 items-center gap-3">
                              <UserAvatar name={lead.companyName} className="h-9 w-9 shrink-0" colorful />
                              <div className="min-w-0">
                                {/* `!justify-start`: phone card tables centre every button (globals.css). */}
                                <button
                                  type="button"
                                  onClick={() => openWorkspace(lead)}
                                  className="max-w-full !justify-start text-start text-sm font-semibold text-foreground hover:text-primary hover:underline"
                                >
                                  <span className="truncate">{lead.companyName}</span>
                                </button>
                                {lead.industry && (
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.industry}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Stage: column 2, so a collapsed phone card shows it */}
                          <TableCell>
                            <InlinePicker
                              name={lead.companyName}
                              picker={{
                                label: t("currentStage", { stage: config.label }),
                                value: lead.status,
                                options: STAGES.map((s) => ({ value: s, label: STAGE_CONFIG[s].label })),
                                onChange: (next) => { void requestStageChange(lead, next as LeadStatus); },
                                display: <StatusBadge status={lead.status} />,
                                pending: updating === lead._id,
                                disabled: updating === lead._id || !can("leads", "update"),
                              }}
                            />
                          </TableCell>

                          {/* Contact */}
                          <TableCell className="max-w-[240px]">
                            <p className="truncate text-sm font-medium text-foreground">{lead.contactPerson}</p>
                            {lead.contactEmail && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={lead.contactEmail}>
                                <Mail className="me-1 inline h-3 w-3 align-[-2px]" />{lead.contactEmail}
                              </p>
                            )}
                          </TableCell>

                          {/* Location */}
                          <TableCell className="hidden max-w-[140px] md:table-cell">
                            {lead.country ? (
                              <p className="truncate text-xs text-muted-foreground" title={lead.country}>
                                <MapPin className="me-1 inline h-3 w-3 align-[-2px]" />{lead.country}
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Follow-up */}
                          <TableCell className="hidden sm:table-cell">
                            {lead.followUpAt ? (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                isOverdue
                                  ? "text-rose-700"
                                  : "text-muted-foreground"
                              }`}>
                                <Calendar className="h-3 w-3" />
                                {formatListDate(new Date(lead.followUpAt))}
                                {isOverdue && <AlertCircle className="h-3 w-3" />}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Score */}
                          <TableCell>
                            {lead.score != null ? (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TEMP_STYLES[lead.qualificationLevel ?? "cold"] ?? TEMP_STYLES.cold}`}>
                                <Gauge className="h-3 w-3" />{lead.score}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <RowActions name={lead.companyName} {...rowActions} />
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

      {/* The board's bar sits outside the loading swap, so it stays put (and
          keeps focus) while the next page's columns load. It waits for the
          first load, so it never opens on "0 leads". */}
      {viewMode === "board" && !error && (!loading || pagination.total > 0) && (
        <PaginationControls
          className="mt-3"
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
          sizeLabel={t("boardPerStage")}
          summary={t("boardPageSummary", { total: pagination.total })}
        />
      )}

      {/* ──── Sign-in details, shown once after a conversion ──── */}
      <Dialog open={Boolean(credentials)} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
        <DialogContent className="max-w-md" mobileSheet>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-status-selected" />
              {t("credentialsTitle")}
            </DialogTitle>
          </DialogHeader>
          {credentials && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("credentialsIntro", { company: credentials.company })}
              </p>

              {[
                { field: "email", label: t("credentialsEmail"), value: credentials.email },
                { field: "password", label: t("credentialsPassword"), value: credentials.password },
              ].map(({ field, label, value }) => (
                <div key={field} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary/60 px-3 py-2 font-mono text-sm text-foreground">
                      {value}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyValue(field, value)}
                      aria-label={t("credentialsCopy", { label })}
                      className="h-10 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold"
                    >
                      {copiedField === field ? <Check className="h-3.5 w-3.5 text-status-selected" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedField === field ? t("credentialsCopied") : t("credentialsCopyAction")}
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-start gap-2 rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg chip-pad text-sm text-status-shortlisted">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">{t("credentialsOnceWarning")}</p>
                  <p className="text-xs">
                    {credentials.emailSent ? t("credentialsEmailSent") : t("credentialsEmailFailed")}
                  </p>
                  <p className="text-xs">{t("credentialsChangeLater")}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyValue("both", `${t("credentialsEmail")}: ${credentials.email}\n${t("credentialsPassword")}: ${credentials.password}`)}
                  className="h-11 gap-1.5 rounded-xl text-sm font-semibold"
                >
                  {copiedField === "both" ? <Check className="h-4 w-4 text-status-selected" /> : <Copy className="h-4 w-4" />}
                  {t("credentialsCopyBoth")}
                </Button>
                <Button type="button" onClick={() => setCredentials(null)} className="h-11 rounded-xl text-sm font-semibold">
                  {t("credentialsDone")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ──── Lead Workspace and the dialogs every view shares ──── */}
      <LeadWorkspace
        // A hand-edited or truncated ?lead= opens nothing rather than a 400.
        leadId={/^[a-f0-9]{24}$/i.test(workspaceLeadId) ? workspaceLeadId : null}
        tab={workspaceTab}
        onTabChange={(tab) => { setWorkspaceTab(tab); setFocusNoteComposer(tab === "notes"); }}
        focusComposer={focusNoteComposer}
        version={workspaceVersion}
        onClose={() => setWorkspaceLeadId("")}
        onLeadChanged={() => { void refreshData({ quiet: true }); }}
        actions={leadActions}
        state={actionState}
        stageConfig={STAGE_CONFIG}
        exhibitionName={exhibitionName}
        t={t}
        locale={locale}
      />
      <MoveStageDialog
        open={Boolean(moveRequest)}
        lead={moveRequest?.lead ?? null}
        target={moveRequest?.target}
        lockTarget={moveRequest?.lock}
        onOpenChange={(open) => { if (!open) setMoveRequest(null); }}
        onMoved={onLeadMoved}
        stageConfig={STAGE_CONFIG}
        t={t}
        tf={tf}
        locale={locale}
      />
      <FollowUpDialog
        open={Boolean(followUpLead)}
        lead={followUpLead}
        onOpenChange={(open) => { if (!open) setFollowUpLead(null); }}
        onSaved={() => { toast.success(t("followUpSaved")); afterLeadChange(); }}
        t={t}
        tf={tf}
      />

      {/* ──── CrudModal ──── */}
      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditLead(null); }}
        title={editLead ? t("modalTitleEdit") : t("modalTitleNew")}
        fields={leadFields}
        steps={leadSteps}
        initialValues={editLead ? {
          companyName: editLead.companyName,
          contactPerson: editLead.contactPerson,
          contactEmail: editLead.contactEmail ?? "",
          contactPhone: editLead.contactPhone ?? "",
          country: editLead.country ?? "",
          industry: editLead.industry ?? "",
          expectedRevenue: editLead.expectedRevenue != null ? String(editLead.expectedRevenue) : "",
          expectedHiring: editLead.expectedHiring ?? "",
          requirement: editLead.requirement ?? "",
          source: editLead.source ?? "",
          exhibitionId: editLead.exhibitionId ?? "",
          notes: editLead.notes ?? "",
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
          <div className="flex items-start gap-2 rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg text-sm text-status-shortlisted chip-pad">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("duplicatesFoundWarning")}</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {duplicates.map((d) => (
                  <li key={d._id}>
                    <span className="font-medium">{d.companyName}</span>
                    {d.contactEmail && <span className="text-status-shortlisted"> &middot; {d.contactEmail}</span>}
                    <span className="ml-1 rounded bg-status-shortlisted-bg px-1 py-0.5 text-[11px] font-semibold uppercase">
                      {d.matchType} match &middot; {d.confidence}
                    </span>
                    <span className="ml-1 text-amber-500">({d.status})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-status-shortlisted">{t("duplicatesWarningOnly")}</p>
            </div>
          </div>
        ) : undefined}
      />

      {/* ──── AI Score Dialog ──── */}
      <Dialog open={Boolean(scoreResult)} onOpenChange={(open) => { if (!open) setScoreResult(null); }}>
        <DialogContent className="max-w-lg rounded-3xl border-border bg-background p-0">
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
                <div className="workspace-glass-panel card-pad rounded-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("recommendedNextAction")}</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{scoreResult.nextAction}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("followUpIn", { days: scoreResult.suggestedFollowUpDays })}
                  </p>
                </div>
                <div className="workspace-glass-panel card-pad rounded-2xl">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-sky-500" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("draftFollowUpMessage")}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{scoreResult.draftMessage}</p>
                  <Button
                    size="dense"
                    variant="outline"
                    className="mt-3 rounded-lg text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(scoreResult.draftMessage);
                      toast.success(t("messageCopied"));
                    }}
                  >
                    {t("copyMessage")}
                  </Button>
                </div>
                {scoreResult.riskFactors.length > 0 && (
                  <div className="workspace-glass-panel card-pad rounded-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("riskFactors")}</p>
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
