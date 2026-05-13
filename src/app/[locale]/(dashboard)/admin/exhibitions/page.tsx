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
  CalendarDays, Clock, CheckCircle2, XCircle, Search, Inbox,
  MapPin, ThumbsUp, ThumbsDown, Trash2, Eye, ArrowRight,
  DollarSign, Target, Users, FileText, RotateCcw, Flag,
  BarChart2, TrendingUp, Activity, Archive, Building2,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

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
  statusHistory?: { status: string; changedAt: string; changedBy?: { _id: string; name: string }; note?: string }[];
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
  approved: "Approved", revision_requested: "Revision Requested",
  budget_approved: "Budget Approved", resources_assigned: "Resources Assigned",
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

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "submitted", label: "Submitted" }, { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" }, { value: "revision_requested", label: "Revision Requested" },
  { value: "budget_approved", label: "Budget Approved" }, { value: "resources_assigned", label: "Resources Assigned" },
  { value: "active", label: "Active" }, { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" }, { value: "archived", label: "Archived" },
];
const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
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
  const [search, setSearch] = useState("");
  const [actionItem, setActionItem] = useState<ExhibitionRequest | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [statusFilter, priorityFilter, search, t]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAction = (item: ExhibitionRequest, status: string) => {
    setActionItem(item); setActionStatus(status); setReviewNote("");
    setApprovedBudget(item.approvedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
    setBudgetNotes(item.budgetNotes ?? ""); setAssignedTeam(item.assignedTeam?.join(", ") ?? "");
  };

  const handleAction = async () => {
    if (!actionItem) return;
    try {
      const payload: Record<string, unknown> = { status: actionStatus, reviewNote: reviewNote.trim() || undefined };
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

  const fmt = (d: string) => new Date(d).toLocaleDateString();
  const dayCount = (s: string, e: string) => Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);

  // Stats
  const totalBudgetReq = items.reduce((s, i) => s + (i.estimatedBudget ?? 0), 0);
  const totalBudgetApp = items.reduce((s, i) => s + (i.approvedBudget ?? 0), 0);
  const totalActualSpend = items.reduce((s, i) => s + (i.actualSpend ?? 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Exhibition Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all exhibition requests, approvals, budgets & resources</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="exhibitions/analytics"><Button variant="outline"><BarChart2 className="h-4 w-4 mr-2" /> Analytics</Button></a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Total", value: items.length, color: "text-gray-700 dark:text-gray-300" },
          { label: "Pending", value: items.filter((i) => ["submitted","under_review"].includes(i.status)).length, color: "text-amber-600" },
          { label: "Approved", value: items.filter((i) => ["approved","budget_approved","resources_assigned"].includes(i.status)).length, color: "text-emerald-600" },
          { label: "Active", value: items.filter((i) => i.status === "active").length, color: "text-purple-600" },
          { label: "Completed", value: items.filter((i) => i.status === "completed").length, color: "text-green-600" },
          { label: "Rejected", value: items.filter((i) => i.status === "rejected").length, color: "text-red-600" },
          { label: "Budget Req.", value: `${Math.round(totalBudgetReq / 1000)}K`, color: "text-blue-600" },
          { label: "Budget App.", value: `${Math.round(totalBudgetApp / 1000)}K`, color: "text-teal-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search events, agents, locations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} placeholder="Status" />
        <SearchableSelect options={PRIORITY_OPTIONS} value={priorityFilter} onValueChange={setPriorityFilter} placeholder="Priority" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><Inbox className="h-12 w-12 mb-3 opacity-40" /><p>{t("noRequests")}</p></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Event</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Agent</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Location</th>
              <th className="text-left p-3 font-medium">Dates</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Participation</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">Budget</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Priority</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {items.map((item) => {
                const transitions = ADMIN_TRANSITIONS[item.status] ?? [];
                return (
                  <tr key={item._id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <button onClick={() => setDetailItem(item)} className="font-medium text-primary hover:underline text-left">{item.eventName}</button>
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</p>
                    </td>
                    <td className="p-3 hidden md:table-cell"><p className="font-medium text-sm">{item.agentId?.name}</p><p className="text-xs text-muted-foreground">{item.agentId?.email}</p></td>
                    <td className="p-3 hidden lg:table-cell"><span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" /> {item.eventLocation} {item.country ? `· ${item.country}` : ""}</span></td>
                    <td className="p-3 whitespace-nowrap text-xs">{fmt(item.eventStartDate)} – {fmt(item.eventEndDate)}<br /><span className="text-muted-foreground">{dayCount(item.eventStartDate, item.eventEndDate)}d</span></td>
                    <td className="p-3 hidden sm:table-cell"><div className="flex flex-wrap gap-1">{(item.participationTypes ?? []).slice(0, 2).map((pt) => (<Badge key={pt} variant="outline" className="text-xs">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}{(item.participationTypes?.length ?? 0) > 2 && <Badge variant="outline" className="text-xs">+{item.participationTypes.length - 2}</Badge>}</div></td>
                    <td className="p-3 hidden md:table-cell text-right whitespace-nowrap">
                      <div>{item.budgetCurrency} {item.estimatedBudget?.toLocaleString()}</div>
                      {item.approvedBudget != null && <div className="text-xs text-emerald-600">✓ {item.approvedBudget.toLocaleString()}</div>}
                      {item.actualSpend != null && <div className="text-xs text-muted-foreground">Spent: {item.actualSpend.toLocaleString()}</div>}
                    </td>
                    <td className="p-3"><Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status] ?? item.status}</Badge></td>
                    <td className="p-3 hidden md:table-cell"><Badge className={PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}>{item.priority}</Badge></td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}><Eye className="h-3.5 w-3.5" /></Button>
                        {transitions.map((tr) => (
                          <Button key={tr.value} size="sm" variant={tr.variant === "destructive" ? "destructive" : tr.variant === "outline" ? "outline" : "default"} onClick={() => openAction(item, tr.value)} title={tr.label}
                            className={tr.variant === "default" ? "bg-emerald-600 hover:bg-emerald-700 text-white text-xs" : "text-xs"}>
                            {tr.label}
                          </Button>
                        ))}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item._id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                  <div><span className="text-muted-foreground">Dates:</span> {fmt(detailItem.eventStartDate)} – {fmt(detailItem.eventEndDate)} ({dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)</div>
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
              {detailItem.assignedTeam?.length ? <SectionBlock icon={<Users className="h-4 w-4" />} title="Assigned Team"><div className="flex flex-wrap gap-1">{detailItem.assignedTeam.map((m, i) => (<Badge key={i} variant="secondary">{m}</Badge>))}</div></SectionBlock> : null}
              {detailItem.description && <SectionBlock icon={<FileText className="h-4 w-4" />} title="Description"><p>{detailItem.description}</p></SectionBlock>}
              {detailItem.executionPlan && <SectionBlock icon={<Activity className="h-4 w-4" />} title="Execution Plan"><p>{detailItem.executionPlan}</p></SectionBlock>}
              {detailItem.expectedOutcome && <SectionBlock icon={<TrendingUp className="h-4 w-4" />} title="Expected Outcome"><p>{detailItem.expectedOutcome}</p></SectionBlock>}
              {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                <SectionBlock icon={<Clock className="h-4 w-4" />} title="Approval History">
                  <div className="space-y-2">{detailItem.statusHistory.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs border-l-2 border-muted pl-3 py-1">
                      <Badge className={`${STATUS_COLORS[h.status]} text-xs`}>{STATUS_LABELS[h.status] ?? h.status}</Badge>
                      <span className="text-muted-foreground">{new Date(h.changedAt).toLocaleString()}</span>
                      {h.changedBy && <span>by {typeof h.changedBy === "object" ? h.changedBy.name : "User"}</span>}
                      {h.note && <span className="italic">— {h.note}</span>}
                    </div>
                  ))}</div>
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
