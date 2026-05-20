"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays, Clock, CheckCircle2, XCircle, Inbox,
  MapPin, ThumbsUp, ThumbsDown, Trash2, Eye, ArrowRight,
  DollarSign, Target, Users, FileText, RotateCcw, Flag,
  BarChart2, TrendingUp, Activity, Building2,
  Download, FolderOpen, ExternalLink, Plus, Sparkles,
} from "lucide-react";
import { ExhibitionHeroFilters } from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import { ApprovalTimeline } from "@/components/features/exhibitions/ApprovalTimeline";

interface ExhibitionRequest {
  _id: string;
  agentId: { _id: string; name: string; email: string };
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  venue?: string;
  country?: string;
  eventStartDate: string;
  eventEndDate: string;
  organizerName?: string;
  participationTypes: string[];
  participationDetails?: string;
  objectives: string[];
  estimatedBudget: number;
  approvedBudget?: number;
  actualSpend?: number;
  budgetBreakdown?: { travel: number; accommodation: number; marketingMaterial: number; stallCost: number; miscellaneous: number };
  budgetCurrency: string;
  budgetNotes?: string;
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;
  requiredResources: string[];
  assignedTeam?: string[];
  priority: string;
  status: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  statusHistory?: { status: string; changedAt: string; changedBy?: { _id: string; name: string }; note?: string; approverRole?: string; statusReason?: string }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
  revision_requested: "bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400",
  budget_approved: "bg-teal-100 text-teal-800 dark:bg-teal-950/30 dark:text-teal-400",
  resources_assigned: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400",
  active: "bg-purple-100 text-purple-800 dark:bg-purple-950/30 dark:text-purple-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", under_review: "Under Review",
  approved: "Operationally Approved", revision_requested: "Revision Requested",
  budget_approved: "Financially Approved", resources_assigned: "Resources Assigned",
  active: "Active", completed: "Completed", rejected: "Rejected", archived: "Archived",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};
const CATEGORY_LABELS: Record<string, string> = {
  career_fair: "Career Fair", recruitment_expo: "Recruitment Expo",
  employer_branding: "Employer Branding", hiring_drive: "Hiring Drive",
  university_event: "University Event", gcc_recruitment: "GCC Recruitment",
  job_fair: "Job Fair", other: "Other",
};
const PARTICIPATION_LABELS: Record<string, string> = {
  standee: "Standee", stall: "Stall", booth: "Booth", sponsorship: "Sponsorship",
  flyers: "Flyers", recruitment_desk: "Recruitment Desk", branding_package: "Branding Package", other: "Other",
};
const OBJECTIVE_LABELS: Record<string, string> = {
  employer_acquisition: "Employer Acquisition", candidate_sourcing: "Candidate Sourcing",
  brand_awareness: "Brand Awareness", lead_generation: "Lead Generation",
  direct_hiring: "Direct Hiring", market_expansion: "Market Expansion",
};
const RESOURCE_LABELS: Record<string, string> = {
  brochures: "Brochures", standee: "Standee", flyers: "Flyers", presentation_deck: "Presentation Deck",
  employer_catalog: "Employer Catalog", candidate_forms: "Candidate Forms",
  branding_banners: "Branding Banners", video_assets: "Video Assets",
  business_cards: "Business Cards", booth_design: "Booth Design",
};

/** Maps exhibition requiredResources → resource management categories */
const RESOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
  brochures: "brochures",
  standee: "standee_designs",
  flyers: "flyers",
  presentation_deck: "presentation_decks",
  employer_catalog: "employer_kits",
  candidate_forms: "candidate_forms",
  branding_banners: "branding_assets",
  video_assets: "exhibition_videos",
  business_cards: "branding_assets",
  booth_design: "booth_designs",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "submitted", label: "Submitted" }, { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Operationally Approved" }, { value: "revision_requested", label: "Revision Requested" },
  { value: "budget_approved", label: "Financially Approved" }, { value: "resources_assigned", label: "Resources Assigned" },
  { value: "active", label: "Active" }, { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" }, { value: "archived", label: "Archived" },
];
const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

const ADMIN_TRANSITIONS: Record<string, { label: string; value: string; variant: "default" | "destructive" | "outline" }[]> = {
  submitted: [
    { label: "Start Review", value: "under_review", variant: "default" },
    { label: "Approve", value: "approved", variant: "default" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  under_review: [
    { label: "Approve", value: "approved", variant: "default" },
    { label: "Revision", value: "revision_requested", variant: "outline" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  revision_requested: [
    { label: "Re-review", value: "under_review", variant: "default" },
  ],
  approved: [
    { label: "Approve Budget", value: "budget_approved", variant: "default" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  budget_approved: [
    { label: "Assign Resources", value: "resources_assigned", variant: "default" },
  ],
  resources_assigned: [
    { label: "Mark Active", value: "active", variant: "default" },
  ],
  active: [
    { label: "Complete", value: "completed", variant: "default" },
  ],
  completed: [
    { label: "Archive", value: "archived", variant: "outline" },
  ],
  rejected: [
    { label: "Archive", value: "archived", variant: "outline" },
  ],
};

export default function AdminExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionItem, setActionItem] = useState<ExhibitionRequest | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [matchedResources, setMatchedResources] = useState<{ _id: string; title: string; category: string; files: { fileName: string; url: string; size: number }[] }[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Fetch matching resources from Resource Management when viewing detail
  const fetchMatchedResources = useCallback(async (requiredResources: string[]) => {
    if (!requiredResources?.length) { setMatchedResources([]); return; }
    setResourcesLoading(true);
    try {
      const categories = [...new Set(requiredResources.map((r) => RESOURCE_TYPE_TO_CATEGORY[r]).filter(Boolean))];
      const results = await Promise.all(
        categories.map((cat) => fetch(`/api/resources?category=${cat}&limit=10`).then((r) => r.ok ? r.json() : { items: [] }))
      );
      const allResources = results.flatMap((r) => r.items ?? []);
      // Deduplicate by _id
      const seen = new Set<string>();
      const unique = allResources.filter((r: { _id: string }) => { if (seen.has(r._id)) return false; seen.add(r._id); return true; });
      setMatchedResources(unique);
    } catch { setMatchedResources([]); } finally { setResourcesLoading(false); }
  }, []);

  const handleDetailOpen = useCallback((item: ExhibitionRequest) => {
    setDetailItem(item);
    fetchMatchedResources(item.requiredResources);
  }, [fetchMatchedResources]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [statusFilter, priorityFilter, categoryFilter, search, t]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAction = (item: ExhibitionRequest, status: string) => {
    setActionItem(item); setActionStatus(status); setReviewNote("");
    setApprovedBudget(item.approvedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
    setBudgetNotes(item.budgetNotes ?? ""); setAssignedTeam(item.assignedTeam?.join(", ") ?? "");
  };

  const handleAction = async () => {
    if (!actionItem) return;
    try {
      const trimmedNote = reviewNote.trim() || undefined;
      const payload: Record<string, unknown> = { status: actionStatus, reviewNote: trimmedNote, statusReason: trimmedNote };
      if (["budget_approved", "approved"].includes(actionStatus) && approvedBudget) {
        payload.approvedBudget = Number(approvedBudget); payload.budgetNotes = budgetNotes;
      }
      if (actionStatus === "resources_assigned" && assignedTeam) {
        payload.assignedTeam = assignedTeam.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const res = await csrfFetch(`/api/exhibitions/${actionItem._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) { toast.success(`Status → ${STATUS_LABELS[actionStatus]}`); setActionItem(null); fetchItems(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: string) => {
    try { const res = await csrfFetch(`/api/exhibitions/${id}`, { method: "DELETE" }); if (res.ok) { toast.success(t("deleted")); fetchItems(); } } catch { toast.error(t("deleteError")); }
  };

  const fmt = (d: string | undefined | null) => {
    if (!d) return "—";
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  const dayCount = (s: string | undefined | null, e: string | undefined | null) => {
    if (!s || !e) return null;
    const start = new Date(s);
    const end = new Date(e);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  };

  // Stats
  const totalBudgetReq = items.reduce((s, i) => s + (i.estimatedBudget ?? 0), 0);
  const totalBudgetApp = items.reduce((s, i) => s + (i.approvedBudget ?? 0), 0);
  const totalActualSpend = items.reduce((s, i) => s + (i.actualSpend ?? 0), 0);

  const pendingCount = items.filter((i) => ["submitted", "under_review"].includes(i.status)).length;

  return (
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Admin operations
            </div>
            <h1 className="mt-4 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              <CalendarDays className="h-7 w-7 text-primary" />
              Exhibition Operations Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage all exhibition requests, approvals, budgets, and resources from one modern control surface.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:items-start">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[200px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Awaiting action</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending or under review</p>
            </div>
            <a href="exhibitions/analytics" className="self-start">
              <Button variant="outline" className="h-10 rounded-xl border-border/70 bg-background/90">
                <BarChart2 className="mr-2 h-4 w-4" /> Analytics
              </Button>
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {([
            { label: "Total", value: items.length, note: "All requests", icon: CalendarDays, tone: "text-slate-600", chip: "bg-slate-50 dark:bg-slate-950/30" },
            { label: "Pending", value: pendingCount, note: "Needs review", icon: Clock, tone: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Approved", value: items.filter((i) => ["approved", "budget_approved", "resources_assigned"].includes(i.status)).length, note: "Cleared to proceed", icon: CheckCircle2, tone: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Active", value: items.filter((i) => i.status === "active").length, note: "In progress", icon: Activity, tone: "text-purple-600", chip: "bg-purple-50 dark:bg-purple-950/30" },
            { label: "Completed", value: items.filter((i) => i.status === "completed").length, note: "Finished events", icon: TrendingUp, tone: "text-green-600", chip: "bg-green-50 dark:bg-green-950/30" },
            { label: "Rejected", value: items.filter((i) => i.status === "rejected").length, note: "Declined", icon: XCircle, tone: "text-red-600", chip: "bg-red-50 dark:bg-red-950/30" },
            { label: "Budget Req.", value: `${Math.round(totalBudgetReq / 1000)}K`, note: "Estimated total", icon: DollarSign, tone: "text-blue-600", chip: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Budget App.", value: `${Math.round(totalBudgetApp / 1000)}K`, note: "Approved total", icon: Target, tone: "text-teal-600", chip: "bg-teal-50 dark:bg-teal-950/30" },
          ] as const).map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{note}</p>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${chip}`}>
                  <Icon className={`h-4 w-4 ${tone}`} />
                </span>
              </div>
            </div>
          ))}
        </div>

        <ExhibitionHeroFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={STATUS_OPTIONS}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          priorityOptions={PRIORITY_OPTIONS}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categoryOptions={CATEGORY_OPTIONS}
          searchPlaceholder="Search events, agents, locations…"
        />
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request queue</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">All exhibition requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">Advance requests through the full lifecycle from the table below.</p>
        </div>

        <div className="mt-5">
      {loading ? (
        <div className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="bg-gradient-to-r from-muted/80 to-muted/40 px-4 py-3.5"><div className="h-4 w-48 rounded bg-muted animate-pulse" /></div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-4 px-4 py-4 border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
              <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
              <div className="hidden md:block h-4 w-28 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted/50 animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-muted/40 animate-pulse" />
              <div className="ml-auto h-7 w-20 rounded-lg bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="workspace-empty-state flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-8 w-8 text-muted-foreground" /></div>
          <p className="text-sm font-semibold text-foreground">{t("noRequests")}</p>
        </div>
      ) : (
        <div className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gradient-to-r from-muted/80 to-muted/40">
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event</th>
              <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Agent</th>
              <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Location</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</th>
              <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Participation</th>
              <th className="hidden px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Budget</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Priority</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border/60">
              {items.map((item, idx) => {
                const transitions = ADMIN_TRANSITIONS[item.status] ?? [];
                const days = dayCount(item.eventStartDate, item.eventEndDate);
                return (
                  <tr key={item._id} className={`transition-colors hover:bg-primary/[0.03] ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                    <td className="px-4 py-3.5">
                      <button onClick={() => handleDetailOpen(item)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">{item.eventName}</button>
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</p>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell"><p className="text-sm font-medium">{item.agentId?.name}</p><p className="text-xs text-muted-foreground">{item.agentId?.email}</p></td>
                    <td className="hidden px-4 py-3.5 lg:table-cell"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary/60" /> {item.eventLocation} {item.country ? `· ${item.country}` : ""}</span></td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="text-xs font-medium">{fmt(item.eventStartDate)}{item.eventEndDate ? ` – ${fmt(item.eventEndDate)}` : ""}</p>
                      {days && <p className="mt-0.5 text-[11px] text-muted-foreground">{days} days</p>}
                    </td>
                    <td className="hidden px-4 py-3.5 sm:table-cell"><div className="flex flex-wrap gap-1">{(item.participationTypes ?? []).slice(0, 2).map((pt) => (<Badge key={pt} variant="outline" className="rounded-md border-primary/20 bg-primary/5 text-[11px] font-medium">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}{(item.participationTypes?.length ?? 0) > 2 && <Badge variant="outline" className="rounded-md text-[11px]">+{item.participationTypes.length - 2}</Badge>}</div></td>
                    <td className="hidden px-4 py-3.5 text-right whitespace-nowrap md:table-cell">
                      <div className="font-medium">{item.budgetCurrency} {item.estimatedBudget?.toLocaleString()}</div>
                      {item.approvedBudget != null && <div className="text-[11px] font-medium text-emerald-600">✓ {item.approvedBudget.toLocaleString()}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge className={`${STATUS_COLORS[item.status]} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>{STATUS_LABELS[item.status] ?? item.status}</Badge>
                      {item.reviewedBy && <p className="mt-0.5 text-[10px] text-muted-foreground">by {item.reviewedBy.name}</p>}
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell"><Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize`}>{item.priority}</Badge></td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" onClick={() => handleDetailOpen(item)}><Eye className="h-4 w-4" /></Button>
                        {transitions.map((tr) => (
                          <Button key={tr.value} size="sm" variant={tr.variant === "destructive" ? "destructive" : tr.variant === "outline" ? "outline" : "default"} onClick={() => openAction(item, tr.value)} title={tr.label}
                            className={`text-xs h-7 px-2.5 rounded-lg ${tr.variant === "default" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}>
                            {tr.label}
                          </Button>
                        ))}
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item._id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
        </div>
      </section>

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{STATUS_LABELS[detailItem.status]}</Badge><Badge className={PRIORITY_COLORS[detailItem.priority]}>{detailItem.priority}</Badge></DialogTitle>
              <DialogDescription>{CATEGORY_LABELS[detailItem.eventCategory]} · {detailItem.eventLocation} {detailItem.country ? `· ${detailItem.country}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <SectionBlock icon={<Users className="h-4 w-4" />} title="Agent"><p>{detailItem.agentId?.name} ({detailItem.agentId?.email})</p><p className="text-xs text-muted-foreground">Submitted {fmt(detailItem.createdAt)}</p></SectionBlock>
              <SectionBlock icon={<CalendarDays className="h-4 w-4" />} title="Event Details">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Venue:</span> {detailItem.venue ?? "—"}</div>
                  <div><span className="text-muted-foreground">Country:</span> {detailItem.country ?? "—"}</div>
                  <div><span className="text-muted-foreground">Dates:</span> {fmt(detailItem.eventStartDate)}{detailItem.eventEndDate ? ` – ${fmt(detailItem.eventEndDate)}` : ""}{dayCount(detailItem.eventStartDate, detailItem.eventEndDate) ? ` (${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)` : ""}</div>
                  <div><span className="text-muted-foreground">Organizer:</span> {detailItem.organizerName ?? "—"}</div>
                </div>
              </SectionBlock>
              <SectionBlock icon={<DollarSign className="h-4 w-4" />} title="Budget">
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs text-muted-foreground">Estimated</p><p className="font-medium">{detailItem.budgetCurrency} {detailItem.estimatedBudget?.toLocaleString()}</p></div>
                  <div><p className="text-xs text-muted-foreground">Approved</p><p className="font-medium text-emerald-600">{detailItem.approvedBudget != null ? `${detailItem.budgetCurrency} ${detailItem.approvedBudget.toLocaleString()}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Actual</p><p className="font-medium">{detailItem.actualSpend != null ? `${detailItem.budgetCurrency} ${detailItem.actualSpend.toLocaleString()}` : "—"}</p></div>
                </div>
                {detailItem.budgetBreakdown && (<div className="grid grid-cols-5 gap-2 mt-2">{Object.entries(detailItem.budgetBreakdown).map(([k, v]) => (<div key={k} className="rounded border p-1.5 text-center text-xs"><p className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p><p className="font-medium">{(v as number)?.toLocaleString()}</p></div>))}</div>)}
              </SectionBlock>
              {detailItem.participationTypes?.length > 0 && (<SectionBlock icon={<Building2 className="h-4 w-4" />} title="Participation"><div className="flex flex-wrap gap-1">{detailItem.participationTypes.map((pt) => (<Badge key={pt} variant="outline">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}</div></SectionBlock>)}
              {detailItem.objectives?.length > 0 && (<SectionBlock icon={<Target className="h-4 w-4" />} title="Objectives"><div className="flex flex-wrap gap-1">{detailItem.objectives.map((o) => (<Badge key={o} variant="outline">{OBJECTIVE_LABELS[o] ?? o}</Badge>))}</div>{detailItem.expectedLeads != null && <p className="mt-1 text-muted-foreground">Expected Leads: {detailItem.expectedLeads}</p>}</SectionBlock>)}
              {detailItem.requiredResources?.length > 0 && (<SectionBlock icon={<FileText className="h-4 w-4" />} title="Required Resources"><div className="flex flex-wrap gap-1">{detailItem.requiredResources.map((r) => (<Badge key={r} variant="outline">{RESOURCE_LABELS[r] ?? r}</Badge>))}</div></SectionBlock>)}
              {/* Available Resources from Resource Management */}
              {detailItem.requiredResources?.length > 0 && (
                <SectionBlock icon={<FolderOpen className="h-4 w-4" />} title="Available Resources from Library">
                  {resourcesLoading ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3 animate-spin" /> Loading matching resources...</p>
                  ) : matchedResources.length > 0 ? (
                    <div className="space-y-2">
                      {matchedResources.map((res) => (
                        <div key={res._id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{res.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{res.category?.replace(/_/g, " ")}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {res.files?.slice(0, 1).map((f, i) => (
                              <Button key={i} variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open(f.url, "_blank")}>
                                <Download className="h-3 w-3 mr-1" /> {f.fileName?.length > 15 ? f.fileName.slice(0, 15) + "…" : f.fileName}
                              </Button>
                            ))}
                            {(res.files?.length ?? 0) > 1 && (
                              <Badge variant="secondary" className="text-xs">+{res.files.length - 1}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      <a href="/en/admin/resources" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        <ExternalLink className="h-3 w-3" /> Manage all resources
                      </a>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed bg-muted/10 p-3 text-center">
                      <p className="text-xs text-muted-foreground">No matching resources uploaded yet.</p>
                      <a href="/en/admin/resources" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        <Plus className="h-3 w-3" /> Upload resources in Resource Management
                      </a>
                    </div>
                  )}
                </SectionBlock>
              )}
              {detailItem.assignedTeam?.length ? <SectionBlock icon={<Users className="h-4 w-4" />} title="Assigned Team"><div className="flex flex-wrap gap-1">{detailItem.assignedTeam.map((m, i) => (<Badge key={i} variant="secondary">{m}</Badge>))}</div></SectionBlock> : null}
              {detailItem.description && <SectionBlock icon={<FileText className="h-4 w-4" />} title="Description"><p>{detailItem.description}</p></SectionBlock>}
              {detailItem.executionPlan && <SectionBlock icon={<Activity className="h-4 w-4" />} title="Execution Plan"><p>{detailItem.executionPlan}</p></SectionBlock>}
              {detailItem.expectedOutcome && <SectionBlock icon={<TrendingUp className="h-4 w-4" />} title="Expected Outcome"><p>{detailItem.expectedOutcome}</p></SectionBlock>}
              {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                <SectionBlock icon={<Clock className="h-4 w-4" />} title="Approval History">
                  <ApprovalTimeline entries={detailItem.statusHistory} />
                </SectionBlock>
              )}
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button></DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Action Modal */}
      <Dialog open={!!actionItem} onOpenChange={() => setActionItem(null)}>
        <DialogContent className="max-w-md">
          {actionItem && (<>
            <DialogHeader>
              <DialogTitle>{actionStatus === "rejected" ? "Reject Request" : actionStatus === "revision_requested" ? "Request Revision" : actionStatus === "archived" ? "Archive" : `Advance → ${STATUS_LABELS[actionStatus]}`}</DialogTitle>
              <DialogDescription>{actionItem.eventName} — {actionItem.agentId?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {["approved", "budget_approved"].includes(actionStatus) && (
                <div><Label>Approved Budget ({actionItem.budgetCurrency})</Label><Input type="number" value={approvedBudget} onChange={(e) => setApprovedBudget(e.target.value)} /><p className="text-xs text-muted-foreground mt-1">Requested: {actionItem.budgetCurrency} {actionItem.estimatedBudget?.toLocaleString()}</p></div>
              )}
              {actionStatus === "resources_assigned" && (
                <div><Label>Assigned Team (comma-separated)</Label><Input value={assignedTeam} onChange={(e) => setAssignedTeam(e.target.value)} placeholder="e.g. John, Sarah, Ahmed" /></div>
              )}
              <div><Label>{actionStatus === "revision_requested" ? "Revision Notes *" : "Review Notes"}</Label><Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={actionStatus === "revision_requested" ? "What needs to be revised..." : "Optional notes..."} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setActionItem(null)}>{tc("cancel")}</Button>
              <Button onClick={handleAction} variant={actionStatus === "rejected" ? "destructive" : "default"}
                className={actionStatus !== "rejected" ? (actionStatus === "revision_requested" ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700") : ""}
                disabled={actionStatus === "revision_requested" && !reviewNote.trim()}>
                {actionStatus === "rejected" ? "Reject" : actionStatus === "revision_requested" ? "Request Revision" : "Confirm"}
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (<div><h3 className="text-sm font-semibold flex items-center gap-2 mb-2">{icon} {title}</h3><div className="pl-6">{children}</div></div>);
}
