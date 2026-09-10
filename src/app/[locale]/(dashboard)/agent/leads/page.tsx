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
  Edit2, Flame, Gauge, GripVertical, Inbox, LayoutGrid, List,
  Loader2, Mail, MapPin, MessageSquare, Phone, Plus, Search,
  Sparkles, Target, Trash2, TrendingUp, XCircle,
} from "lucide-react";
import {
  DndContext, DragOverlay, closestCorners, useSensor, useSensors,
  MouseSensor, TouchSensor, KeyboardSensor,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

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

/* How many cards a board column holds before it asks. The board used to pull
   `limit=200` in one request and drop the lot into six columns, so a busy
   pipeline buried the page and the column counts were capped at whatever that
   one page happened to contain. Each column now pages its own stage. */
const BOARD_PAGE_SIZE = 10;
type StageBucket = { items: Lead[]; total: number; page: number; loadingMore: boolean };
const emptyStageBuckets = (): Record<LeadStatus, StageBucket> =>
  STAGES.reduce((acc, st) => {
    acc[st] = { items: [], total: 0, page: 1, loadingMore: false };
    return acc;
  }, {} as Record<LeadStatus, StageBucket>);

function getStageConfig(t: ReturnType<typeof useTranslations>): Record<LeadStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode; description: string }> {
  return {
    new: {
      label: t("stageNew"),
      color: "text-status-applied",
      bgColor: "bg-status-applied-bg",
      borderColor: "border-status-applied/20",
      icon: <Sparkles className="h-4 w-4" />,
      description: t("stageNewDescription"),
    },
    contacted: {
      label: t("stageContacted"),
      color: "text-status-interview",
      bgColor: "bg-status-interview-bg",
      borderColor: "border-status-interview/20",
      icon: <Phone className="h-4 w-4" />,
      description: t("stageContactedDescription"),
    },
    interested: {
      label: t("stageInterested"),
      color: "text-status-shortlisted",
      bgColor: "bg-status-shortlisted-bg",
      borderColor: "border-status-shortlisted/20",
      icon: <TrendingUp className="h-4 w-4" />,
      description: t("stageInterestedDescription"),
    },
    negotiating: {
      label: t("stageNegotiating"),
      color: "text-status-interview",
      bgColor: "bg-status-interview-bg",
      borderColor: "border-status-interview/20",
      icon: <Target className="h-4 w-4" />,
      description: t("stageNegotiatingDescription"),
    },
    converted: {
      label: t("stageWon"),
      color: "text-status-selected",
      bgColor: "bg-status-selected-bg",
      borderColor: "border-status-selected/20",
      icon: <Building2 className="h-4 w-4" />,
      description: t("stageWonDescription"),
    },
    lost: {
      label: t("stageLost"),
      color: "text-status-rejected",
      bgColor: "bg-status-rejected-bg",
      borderColor: "border-status-rejected/20",
      icon: <XCircle className="h-4 w-4" />,
      description: t("stageLostDescription"),
    },
  };
}

const TEMP_STYLES: Record<string, string> = {
  hot: "border-status-rejected/20 bg-status-rejected-bg text-status-rejected",
  warm: "border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted",
  cold: "border-status-applied/20 bg-status-applied-bg text-status-applied",
  qualified: "border-status-selected/20 bg-status-selected-bg text-status-selected",
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

function getLeadFields(t: ReturnType<typeof useTranslations>, stageConfig: Record<LeadStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode; description: string }>): CrudField[] {
  return [
    { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
    { name: "contactPerson", label: t("fieldContactPerson"), type: "text", required: true },
    { name: "contactEmail", label: t("fieldContactEmail"), type: "email" },
    { name: "contactPhone", label: t("fieldContactPhone"), type: "text" },
    { name: "country", label: t("fieldCountry"), type: "text" },
    { name: "industry", label: t("fieldIndustry"), type: "text" },
    { name: "expectedRevenue", label: t("fieldExpectedRevenue"), type: "number" },
    { name: "source", label: t("fieldLeadSource"), type: "text" },
    { name: "exhibitionId", label: t("fieldExhibition"), type: "select", options: [] },
    { name: "status", label: t("fieldStage"), type: "select", options: STAGES.map((s) => ({ value: s, label: stageConfig[s].label })) },
    { name: "lostReason", label: t("fieldLostReason"), type: "text" },
    { name: "notes", label: t("fieldNotes"), type: "textarea" },
    { name: "followUpAt", label: t("fieldFollowUpDate"), type: "date" },
  ];
}

const FORWARD_STAGES: LeadStatus[] = STAGES.filter((st) => st !== "lost");

/* ─── Stage progress ────────────────────────────────────────────────────── */

/** Where a lead stands on the pipeline, under the stage picker in the table. */
function StageProgress({
  stage,
  stageConfig,
  t,
}: {
  stage: LeadStatus;
  stageConfig: ReturnType<typeof getStageConfig>;
  t: ReturnType<typeof useTranslations>;
}) {
  const idx = FORWARD_STAGES.indexOf(stage);
  const isLost = stage === "lost";
  const label = isLost
    ? stageConfig.lost.label
    : `${t("pipelineProgress")} — ${t("stageStep", { step: idx + 1, total: FORWARD_STAGES.length })}`;

  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={label} title={label}>
      {FORWARD_STAGES.map((st, i) => (
        <span
          key={st}
          className={`h-1 w-4 rounded-full ${
            isLost ? "bg-status-rejected/40" : i <= idx ? "bg-status-selected" : "bg-border/60"
          }`}
        />
      ))}
    </div>
  );
}

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
  t,
  stageConfig,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  scoring: boolean;
  converting: boolean;
  exhibitions: { _id: string; eventName: string }[];
  t: ReturnType<typeof useTranslations>;
  stageConfig: ReturnType<typeof getStageConfig>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead._id,
    data: { lead },
  });

  // The pointerup that ends a real drag still fires a click on the card, which
  // opened the edit modal on every drop. Swallow clicks for a beat after a drag.
  const wasDraggingRef = useRef(false);
  const dragEndedAtRef = useRef(0);
  useEffect(() => {
    if (isDragging) { wasDraggingRef.current = true; return; }
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      dragEndedAtRef.current = Date.now();
    }
  }, [isDragging]);

  const handleEdit = useCallback((l: Lead) => {
    if (Date.now() - dragEndedAtRef.current < 250) return;
    onEdit(l);
  }, [onEdit]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
        // Touch drag runs off TouchSensor's long-press, so the column keeps its
        // own vertical scroll; `none` here would have killed it.
        touchAction: "manipulation",
      }}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      {...attributes}
      {...listeners}
    >
      <LeadCard
        lead={lead}
        onEdit={handleEdit}
        onScore={onScore}
        onConvert={onConvert}
        onStatusChange={onStatusChange}
        scoring={scoring}
        converting={converting}
        exhibitions={exhibitions}
        draggable
        t={t}
        stageConfig={stageConfig}
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
  draggable,
  t,
  stageConfig,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  scoring: boolean;
  converting: boolean;
  exhibitions: { _id: string; eventName: string }[];
  draggable?: boolean;
  t: ReturnType<typeof useTranslations>;
  stageConfig: ReturnType<typeof getStageConfig>;
}) {
  const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
  const exhibition = lead.exhibitionId ? exhibitions.find((e) => e._id === lead.exhibitionId) : null;
  const stageIdx = STAGES.indexOf(lead.status);
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;
  const hasRevenue = lead.expectedRevenue != null && lead.expectedRevenue > 0;
  const canConvert = lead.status !== "converted" && lead.status !== "lost" && Boolean(lead.contactEmail);
  // Location and industry ride one clipped line instead of a wrapping icon
  // grid — the old card ran ~130px tall, mostly on a wrapped email address.
  const place = [lead.country, lead.industry].filter(Boolean).join(" · ");

  return (
    <div
      className={`group relative rounded-xl border border-border/60 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-border chip-pad ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      onClick={() => onEdit(lead)}
    >
      {/* Company + score. The grip is a cue only — the whole card is the
          drag activator, so it must not swallow the pointer. */}
      <div className="flex items-start gap-1.5">
        {draggable && (
          <GripVertical className="pointer-events-none mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/25 transition group-hover:text-muted-foreground/60" />
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-semibold leading-tight text-foreground" title={lead.companyName}>{lead.companyName}</h4>
        </div>
        {lead.score != null && (
          <span className={`shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-bold leading-5 ${TEMP_STYLES[lead.qualificationLevel ?? "cold"] ?? TEMP_STYLES.cold}`}>
            <Gauge className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />
            {lead.score}
          </span>
        )}
      </div>

      {/* Contact, country and industry share one clipped line — three stacked
          rows with an icon each is what made the old card 130px tall. */}
      <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
        {lead.contactPerson}
        {place && <><span className="mx-1 opacity-40">·</span><MapPin className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />{place}</>}
      </p>

      {(lead.followUpAt || exhibition || hasRevenue) && (
        <div className="mt-1.5 flex items-center gap-1 overflow-hidden text-[10px] font-medium">
          {lead.followUpAt && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 ${isOverdue ? "bg-status-rejected-bg text-rose-700" : "bg-muted text-muted-foreground"}`}>
              <Calendar className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />
              {formatDate(new Date(lead.followUpAt), { month: "short", day: "numeric" })}
            </span>
          )}
          {exhibition && (
            <span className="min-w-0 truncate rounded bg-primary/5 px-1.5 py-0.5 text-primary">{exhibition.eventName}</span>
          )}
          {hasRevenue && (
            <span className="ml-auto shrink-0 font-semibold text-status-selected">
              {lead.expectedRevenueCurrency ?? "AED"} {formatCount(lead.expectedRevenue!)}
            </span>
          )}
        </div>
      )}

      {/* Actions float over the card corner. The old bar sat on the bottom
          edge and, on a card this short, covered the content it belonged to. */}
      <div
        className="absolute end-1 top-1 hidden items-center gap-0.5 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm group-hover:flex group-focus-within:flex"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onScore(lead._id)}
          disabled={scoring}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-status-shortlisted-bg hover:text-amber-600"
          title={t("aiScore")}
          aria-label={t("aiScore")}
        >
          {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
        </button>
        {canConvert && (
          <button
            type="button"
            onClick={() => onConvert(lead)}
            disabled={converting}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-status-selected-bg hover:text-status-selected"
            title={t("convertToEmployer")}
            aria-label={t("convertToEmployer")}
          >
            {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
          </button>
        )}
        {nextStage && (
          <button
            type="button"
            onClick={() => onStatusChange(lead._id, nextStage)}
            className="rounded-md p-1 text-primary transition hover:bg-primary/10"
            title={t("moveToStage", { stage: stageConfig[nextStage].label })}
            aria-label={t("moveToStage", { stage: stageConfig[nextStage].label })}
          >
            <TrendingUp className="h-3.5 w-3.5" />
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
  total,
  loadingMore,
  onLoadMore,
  onEdit,
  onScore,
  onConvert,
  onStatusChange,
  onAdd,
  scoringLeadId,
  convertingLeadId,
  exhibitions,
  canCreate,
  t,
  stageConfig,
}: {
  stage: LeadStatus;
  leads: Lead[];
  total: number;
  loadingMore: boolean;
  onLoadMore: (stage: LeadStatus) => void;
  onEdit: (lead: Lead) => void;
  onScore: (id: string) => void;
  onConvert: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onAdd: () => void;
  scoringLeadId: string | null;
  convertingLeadId: string | null;
  exhibitions: { _id: string; eventName: string }[];
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
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
      <div className="flex-1 space-y-1 overflow-y-auto p-1.5" style={{ maxHeight: "calc(100vh - 236px)" }}>
        {leads.length === 0 ? (
          <div className={`flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-5 text-center transition-colors ${isOver ? "border-primary/60 bg-primary/5" : "border-transparent"}`}>
            <div className={`rounded-full p-2 ${config.bgColor}`}>
              <Inbox className={`h-4 w-4 ${config.color}`} />
            </div>
            <p className="px-2 text-[11px] leading-tight text-muted-foreground">{config.description}</p>
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
              t={t}
              stageConfig={stageConfig}
            />
          ))
        )}

        {leads.length > 0 && leads.length < total && (
          <button
            type="button"
            onClick={() => onLoadMore(stage)}
            disabled={loadingMore}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("loadMoreLeads", { count: total - leads.length })}
          </button>
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
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
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
    fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).then((res) => {
      if (!res.ok) {
        toast.error(t("failedToMoveLead"));
        revert(); // the optimistic move was a lie
        return;
      }
      toast.success(t("leadMovedToStage", { stage: STAGE_CONFIG[newStatus].label }));
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
    const baseFields = getLeadFields(t, STAGE_CONFIG);
    const exOpts = [{ value: "", label: t("noneOption") }, ...exhibitions.map((e) => ({ value: e._id, label: e.eventName }))];
    return baseFields.map((f) => f.name === "exhibitionId" ? { ...f, options: exOpts } : f);
  }, [exhibitions, t, STAGE_CONFIG]);

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

  const fetchStage = useCallback(async (stage: LeadStatus, page: number) => {
    const params = sharedParams();
    params.set("status", stage);
    params.set("limit", String(BOARD_PAGE_SIZE));
    params.set("page", String(page));
    const res = await fetch(`/api/leads?${params}`);
    if (!res.ok) return { items: [] as Lead[], total: 0 };
    const data = await res.json();
    return { items: (data.items ?? []) as Lead[], total: (data.total ?? 0) as number };
  }, [sharedParams]);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(visibleStages.map((st) => fetchStage(st, 1)));
    setStageBuckets(() => {
      const next = emptyStageBuckets();
      visibleStages.forEach((st, i) => {
        next[st] = { items: results[i].items, total: results[i].total, page: 1, loadingMore: false };
      });
      return next;
    });
    setLoading(false);
  }, [visibleStages, fetchStage]);

  // A column asks for its own next page; the others are untouched.
  const loadMoreStage = useCallback(async (stage: LeadStatus) => {
    const bucket = stageBuckets[stage];
    if (!bucket || bucket.loadingMore || bucket.items.length >= bucket.total) return;
    const nextPage = bucket.page + 1;
    setStageBuckets((prev) => ({ ...prev, [stage]: { ...prev[stage], loadingMore: true } }));
    const { items, total } = await fetchStage(stage, nextPage);
    setStageBuckets((prev) => {
      const seen = new Set(prev[stage].items.map((l) => l._id));
      return {
        ...prev,
        [stage]: {
          items: [...prev[stage].items, ...items.filter((l) => !seen.has(l._id))],
          total: total || prev[stage].total,
          page: nextPage,
          loadingMore: false,
        },
      };
    });
  }, [stageBuckets, fetchStage]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = sharedParams();
    const pp = pagination.paginationParams();
    pp.forEach((v, k) => params.set(k, v));
    if (statusFilter !== "all") params.set("status", statusFilter);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.items ?? []);
    pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    setLoading(false);
  }, [sharedParams, statusFilter, pagination.page, pagination.limit]);

  const refreshData = useCallback(() => {
    return viewMode === "board" ? fetchBoard() : fetchLeads();
  }, [viewMode, fetchBoard, fetchLeads]);

  useEffect(() => {
    if (viewMode === "board") { fetchBoard(); } else { fetchLeads(); }
  }, [viewMode, fetchBoard, fetchLeads]);
  useEffect(() => { pagination.resetPage(); }, [search, statusFilter, exhibitionFilter, followUpFilter]);

  const updateStatus = async (id: string, status: LeadStatus) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error(t("failedToMoveLead"));
        return;
      }
      toast.success(t("leadMovedToStage", { stage: STAGE_CONFIG[status].label }));
      await refreshData();
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
    refreshData();
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
    { header: t("exportHeaderFollowUp"), key: "followUpAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "" },
    { header: t("exportHeaderCreated"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "" },
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
    } catch (err) {
      toast.error(t("aiScoringFailed"));
    } finally {
      setScoringLeadId(null);
    }
  };

  const convertLead = async (lead: Lead) => {
    if (!lead.contactEmail) {
      toast.error(t("cannotConvertNoEmail"));
      return;
    }
    const ok = await confirmDialog(
      t("confirmConvertLead", { company: lead.companyName, email: lead.contactEmail }),
    );
    if (!ok) return;
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
      refreshData();
    } catch (err) {
      toast.error(t("leadConversionFailed"));
    } finally {
      setConvertingLeadId(null);
    }
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

      {/* ──── Toolbar ──── */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        {/* Opt into the shared mobile toolbar rules (see globals.css). Scoped to
            this row, not the whole section — the stage pills below carry leading
            icons too, and the icon-only rule would strip their labels. */}
        <div className="flex flex-wrap items-center gap-2" data-table-toolbar="simple">
          {/* View toggle */}
          <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1">
            <button
              onClick={() => setViewMode("board")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition min-h-11 px-3 ${ viewMode === "board" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground" }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />{t("viewBoard")}
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition min-h-11 px-3 ${ viewMode === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground" }`}
            >
              <List className="h-3.5 w-3.5" />{t("viewTable")}
            </button>
          </div>

          {/* Search & Filters — flat children of the toolbar row. A nested
              wrapper made these wrap inside themselves on phones, which left
              the search box stranded on a line of its own. */}
          <>
            <div className="relative toolbar-search-field min-w-[180px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 w-full rounded-xl border border-border bg-background/70 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-auto min-w-[132px] shrink-0 rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStages")}</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={exhibitionFilter} onValueChange={setExhibitionFilter}>
              <SelectTrigger className="h-10 w-auto min-w-[132px] max-w-[180px] shrink-0 truncate rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allExhibitions")}</SelectItem>
                {exhibitions.map((e) => (
                  <SelectItem key={e._id} value={e._id}>{e.eventName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The dashboard queue and the nav badge both link ?followUp=due;
                this toggle is how the agent turns that view off again. */}
            <button
              type="button"
              onClick={() => setFollowUpFilter(followUpFilter === "due" ? "all" : "due")}
              aria-pressed={followUpFilter === "due"}
              title={t("dueFollowUpsHint")}
              className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition ${
                followUpFilter === "due"
                  ? "border-status-rejected/30 bg-status-rejected-bg text-status-rejected"
                  : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              {t("dueFollowUps")}
            </button>
          </>

          {/* Export */}
          <div className="ms-auto flex items-center">
          <TableToolbar
            onExportCsv={viewMode === "board" ? () => exportBoard("csv") : handleExportCsv}
            onExportExcel={viewMode === "board" ? () => exportBoard("excel") : handleExportExcel}
            onExportPdf={viewMode === "board" ? () => exportBoard("pdf") : handleExportPdf}
          />
          </div>
        </div>

        {/* Stage pill filters — the board's own column headers already carry
            every label and count, so on the board these were a second copy of
            the same six numbers above the thing displaying them. */}
        {viewMode === "table" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STAGES.map((s) => {
            const config = STAGE_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition [&_svg]:h-3 [&_svg]:w-3 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:[&_svg]:h-3.5 sm:[&_svg]:w-3.5 ${
                  statusFilter === s
                    ? `${config.bgColor} ${config.borderColor} ${config.color}`
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {config.icon}
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
        )}
      </section>

      {/* ──── Content Area ──── */}
      {loading ? (
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
                  loadingMore={stageBuckets[stage].loadingMore}
                  onLoadMore={loadMoreStage}
                  onEdit={openEdit}
                  onScore={scoreLead}
                  onConvert={convertLead}
                  onStatusChange={updateStatus}
                  onAdd={openAdd}
                  scoringLeadId={scoringLeadId}
                  convertingLeadId={convertingLeadId}
                  exhibitions={exhibitions}
                  canCreate={can("leads", "create")}
                  t={t}
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
          <section className="workspace-panel-surface overflow-hidden rounded-3xl">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="rounded-2xl bg-muted/50 p-4">
                  <Inbox className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t("emptyPipelineTitle")}</p>
                <p className="text-xs text-muted-foreground/70">{t("emptyPipelineDescription")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-[200px] pl-5 text-[11px] font-semibold uppercase tracking-wider">{t("tableHeaderCompany")}</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">{t("tableHeaderContact")}</TableHead>
                      <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider md:table-cell">{t("tableHeaderLocation")}</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">{t("tableHeaderStage")}</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider">{t("tableHeaderScore")}</TableHead>
                      <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wider sm:table-cell">{t("tableHeaderFollowUp")}</TableHead>
                      <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-wider">{tc("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => {
                      const config = STAGE_CONFIG[lead.status];
                      const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
                      return (
                        <TableRow
                          key={lead._id}
                          className="group border-border/30 transition-colors hover:bg-muted/20"
                        >
                          {/* Company */}
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-1 shrink-0 rounded-full bg-current ${config.color}`} />
                              <div className="min-w-0">
                                <Link
                                  href={`/${locale}/agent/leads/${lead._id}`}
                                  className="block truncate text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                                  title={lead.companyName}
                                >
                                  {lead.companyName}
                                </Link>
                                {lead.industry && (
                                  <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    {lead.industry}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Contact */}
                          <TableCell className="max-w-[240px]">
                            <p className="truncate text-sm font-medium text-foreground">{lead.contactPerson}</p>
                            {lead.contactEmail && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={lead.contactEmail}>
                                <Mail className="me-1 inline h-3 w-3 align-[-2px]" />{lead.contactEmail}
                              </p>
                            )}
                            {lead.contactPhone && (
                              <p className="mt-0.5 hidden truncate whitespace-nowrap text-xs text-muted-foreground xl:block">
                                <Phone className="me-1 inline h-3 w-3 align-[-2px]" />{lead.contactPhone}
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

                          {/* Stage — pick it here, and see how far along it is */}
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Select
                                value={lead.status}
                                onValueChange={(v) => updateStatus(lead._id, v as LeadStatus)}
                                disabled={updating === lead._id || !can("leads", "update")}
                              >
                                <SelectTrigger
                                  aria-label={t("currentStage", { stage: config.label })}
                                  title={t("currentStage", { stage: config.label })}
                                  className={`h-7 w-[140px] gap-1 rounded-full border px-2.5 text-[11px] font-semibold shadow-none ${config.bgColor} ${config.borderColor} ${config.color}`}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5 [&_svg]:h-3 [&_svg]:w-3">
                                    {updating === lead._id ? <Loader2 className="h-3 w-3 animate-spin" /> : config.icon}
                                    <span className="truncate">{config.label}</span>
                                  </span>
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGES.map((st) => (
                                    <SelectItem key={st} value={st} className="text-xs">
                                      <span className="flex items-center gap-1.5 [&_svg]:h-3 [&_svg]:w-3">
                                        <span className={STAGE_CONFIG[st].color}>{STAGE_CONFIG[st].icon}</span>
                                        {STAGE_CONFIG[st].label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <StageProgress stage={lead.status} stageConfig={STAGE_CONFIG} t={t} />
                            </div>
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

                          {/* Follow-up */}
                          <TableCell className="hidden sm:table-cell">
                            {lead.followUpAt ? (
                              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                isOverdue
                                  ? "bg-status-rejected-bg text-rose-700"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                <Calendar className="h-3 w-3" />
                                {formatDate(new Date(lead.followUpAt), { month: "short", day: "numeric" })}
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
                                onClick={() => scoreLead(lead._id)}
                                disabled={scoringLeadId === lead._id}
                                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-status-shortlisted-bg hover:text-amber-600"
                                title={t("aiScore")}
                              >
                                {scoringLeadId === lead._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                              </button>
                              {lead.status !== "converted" && lead.status !== "lost" && lead.contactEmail && (
                                <button
                                  onClick={() => convertLead(lead)}
                                  disabled={convertingLeadId === lead._id}
                                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-status-selected-bg hover:text-status-selected"
                                  title={t("convertToEmployer")}
                                >
                                  {convertingLeadId === lead._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                                </button>
                              )}
                              {can("leads", "update") && (
                                <button
                                  onClick={() => openEdit(lead)}
                                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                                  title={tc("edit")}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              )}
                              {can("leads", "delete") && (
                                <button
                                  onClick={() => handleDelete(lead._id)}
                                  className="hidden rounded-lg p-1.5 text-muted-foreground transition hover:bg-status-rejected-bg hover:text-status-rejected group-hover:inline-flex"
                                  title={tc("delete")}
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

      {/* ──── CrudModal ──── */}
      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditLead(null); }}
        title={editLead ? t("modalTitleEdit") : t("modalTitleNew")}
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
