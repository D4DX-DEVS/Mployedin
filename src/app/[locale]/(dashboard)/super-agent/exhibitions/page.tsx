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
  MapPin, Building2, ThumbsUp, ThumbsDown, Eye, AlertTriangle,
  DollarSign, Target, FileText, RotateCcw, Flag,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  budgetBreakdown?: { travel: number; accommodation: number; marketingMaterial: number; stallCost: number; miscellaneous: number };
  budgetCurrency: string;
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;
  requiredResources: string[];
  priority: string;
  status: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  statusHistory?: { status: string; changedAt: string; changedBy?: { _id: string; name: string }; note?: string }[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

const OBJECTIVE_LABELS: Record<string, string> = {
  employer_acquisition: "Employer Acquisition", candidate_sourcing: "Candidate Sourcing",
  brand_awareness: "Brand Awareness", lead_generation: "Lead Generation",
  direct_hiring: "Direct Hiring", market_expansion: "Market Expansion",
};

const RESOURCE_LABELS: Record<string, string> = {
  brochures: "Brochures", standee: "Standee", flyers: "Flyers",
  presentation_deck: "Presentation Deck", employer_catalog: "Employer Catalog",
  candidate_forms: "Candidate Forms", branding_banners: "Branding Banners",
  video_assets: "Video Assets", business_cards: "Business Cards", booth_design: "Booth Design",
};

const PARTICIPATION_LABELS: Record<string, string> = {
  standee: "Standee", stall: "Stall", booth: "Booth", sponsorship: "Sponsorship",
  flyers: "Flyers", recruitment_desk: "Recruitment Desk", branding_package: "Branding Package", other: "Other",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "submitted", label: "Submitted" }, { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" }, { value: "revision_requested", label: "Revision Requested" },
  { value: "budget_approved", label: "Budget Approved" },
  { value: "active", label: "Active" }, { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Review dialog
  const [reviewItem, setReviewItem] = useState<ExhibitionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<string>("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");

  // Detail dialog
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [statusFilter, priorityFilter, search, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleReview = async () => {
    if (!reviewItem || !reviewAction) return;
    try {
      const payload: Record<string, unknown> = { status: reviewAction, reviewNote: reviewNote.trim() || undefined };
      if (approvedBudget) payload.approvedBudget = Number(approvedBudget);
      const res = await csrfFetch(`/api/exhibitions/${reviewItem._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(`Exhibition ${reviewAction === "rejected" ? "rejected" : reviewAction === "revision_requested" ? "revision requested" : "approved"}`);
        setReviewItem(null); setReviewNote(""); setApprovedBudget(""); fetchItems();
      } else { const err = await res.json(); toast.error(err.error ?? "Error"); }
    } catch { toast.error("Error updating exhibition"); }
  };

  const openReview = (item: ExhibitionRequest, action: string) => {
    setReviewItem(item); setReviewAction(action); setReviewNote(""); setApprovedBudget(item.approvedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
  };

  const fmtDate = (d: string | undefined | null) => {
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
  const pendingCount = items.filter((i) => i.status === "submitted").length;
  const reviewCount = items.filter((i) => i.status === "under_review").length;
  const approvedCount = items.filter((i) => ["approved","budget_approved","resources_assigned","active"].includes(i.status)).length;
  const totalBudgetRequested = items.reduce((s, i) => s + (i.estimatedBudget ?? 0), 0);
  const totalBudgetApproved = items.reduce((s, i) => s + (i.approvedBudget ?? 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" /> Exhibition Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Review and approve exhibition requests from your team</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Requests", value: items.length, color: "text-slate-700 dark:text-slate-200", bg: "from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30" },
          { label: "Pending Review", value: pendingCount + reviewCount, color: "text-amber-600 dark:text-amber-400", bg: "from-amber-50 to-white dark:from-amber-950/40 dark:to-amber-900/10" },
          { label: "Approved", value: approvedCount, color: "text-emerald-600 dark:text-emerald-400", bg: "from-emerald-50 to-white dark:from-emerald-950/40 dark:to-emerald-900/10" },
          { label: "Budget Requested", value: `${totalBudgetRequested.toLocaleString()}`, color: "text-blue-600 dark:text-blue-400", bg: "from-blue-50 to-white dark:from-blue-950/40 dark:to-blue-900/10" },
          { label: "Budget Approved", value: `${totalBudgetApproved.toLocaleString()}`, color: "text-teal-600 dark:text-teal-400", bg: "from-teal-50 to-white dark:from-teal-950/40 dark:to-teal-900/10" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border bg-gradient-to-br ${s.bg} p-4 shadow-sm transition-shadow hover:shadow-md`}>
            <p className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} placeholder="Status" />
        <SearchableSelect options={PRIORITY_OPTIONS} value={priorityFilter} onValueChange={setPriorityFilter} placeholder="Priority" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border shadow-sm">
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
        <div className="flex flex-col items-center justify-center rounded-xl border py-16 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-3 opacity-40" /><p className="text-sm">No exhibition requests found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Event</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Agent</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Location</th>
              <th className="text-left p-3 font-medium">Dates</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Participation</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Budget Req.</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Budget Appr.</th>
              <th className="text-left p-3 font-medium hidden xl:table-cell">Objective</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Priority</th>
              <th className="text-left p-3 font-medium hidden xl:table-cell">Resources</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <button onClick={() => setDetailItem(item)} className="font-medium text-primary hover:underline text-left">{item.eventName}</button>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</p>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <p className="font-medium text-sm">{item.agentId?.name}</p>
                    <p className="text-xs text-muted-foreground">{item.agentId?.email}</p>
                  </td>
                  <td className="p-3 hidden lg:table-cell"><span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" /> {item.eventLocation}</span></td>
                  <td className="p-3 whitespace-nowrap text-xs">{fmtDate(item.eventStartDate)} â€“ {fmtDate(item.eventEndDate)}<br /><span className="text-muted-foreground">{dayCount(item.eventStartDate, item.eventEndDate)}d</span></td>
                  <td className="p-3 hidden sm:table-cell"><div className="flex flex-wrap gap-1">{(item.participationTypes ?? []).slice(0, 2).map((pt) => (<Badge key={pt} variant="outline" className="text-xs">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}{(item.participationTypes?.length ?? 0) > 2 && <Badge variant="outline" className="text-xs">+{item.participationTypes.length - 2}</Badge>}</div></td>
                  <td className="p-3 hidden md:table-cell whitespace-nowrap">{item.budgetCurrency} {item.estimatedBudget?.toLocaleString()}</td>
                  <td className="p-3 hidden lg:table-cell whitespace-nowrap">{item.approvedBudget ? `${item.budgetCurrency} ${item.approvedBudget.toLocaleString()}` : "â€”"}</td>
                  <td className="p-3 hidden xl:table-cell"><div className="flex flex-wrap gap-1">{(item.objectives ?? []).slice(0, 1).map((o) => (<Badge key={o} variant="outline" className="text-xs">{OBJECTIVE_LABELS[o] ?? o}</Badge>))}{(item.objectives?.length ?? 0) > 1 && <Badge variant="outline" className="text-xs">+{item.objectives.length - 1}</Badge>}</div></td>
                  <td className="p-3"><Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status] ?? item.status}</Badge></td>
                  <td className="p-3 hidden md:table-cell"><Badge className={PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}>{item.priority}</Badge></td>
                  <td className="p-3 hidden xl:table-cell"><span className="text-xs text-muted-foreground">{item.requiredResources?.length ?? 0} items</span></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}><Eye className="h-3.5 w-3.5" /></Button>
                      {item.status === "submitted" && (<Button size="sm" variant="outline" onClick={() => openReview(item, "under_review")} className="text-amber-600 border-amber-200"><Clock className="h-3.5 w-3.5 mr-1" /> Review</Button>)}
                      {item.status === "under_review" && (<>
                        <Button size="sm" onClick={() => openReview(item, "approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white"><ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => openReview(item, "revision_requested")} className="text-orange-600 border-orange-200"><RotateCcw className="h-3.5 w-3.5 mr-1" /> Revise</Button>
                        <Button size="sm" variant="destructive" onClick={() => openReview(item, "rejected")}><ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                      </>)}
                      {item.status === "approved" && (<Button size="sm" variant="outline" onClick={() => openReview(item, "budget_approved")} className="text-teal-600 border-teal-200"><DollarSign className="h-3.5 w-3.5 mr-1" /> Approve Budget</Button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{STATUS_LABELS[detailItem.status]}</Badge><Badge className={PRIORITY_COLORS[detailItem.priority]}>{detailItem.priority}</Badge></DialogTitle>
              <DialogDescription>{CATEGORY_LABELS[detailItem.eventCategory]} Â· {detailItem.eventLocation} {detailItem.country ? `Â· ${detailItem.country}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Agent:</span> <strong>{detailItem.agentId?.name}</strong></div>
                <div><span className="text-muted-foreground">Venue:</span> {detailItem.venue ?? "â€”"}</div>
              <div><span className="text-muted-foreground">Dates:</span> {fmtDate(detailItem.eventStartDate)}{detailItem.eventEndDate ? ` – ${fmtDate(detailItem.eventEndDate)}` : ""}{dayCount(detailItem.eventStartDate, detailItem.eventEndDate) ? ` (${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)` : ""}</div>
                <div><span className="text-muted-foreground">Organizer:</span> {detailItem.organizerName ?? "â€”"}</div>
                <div><span className="text-muted-foreground">Budget Requested:</span> {detailItem.budgetCurrency} {detailItem.estimatedBudget?.toLocaleString()}</div>
                <div><span className="text-muted-foreground">Budget Approved:</span> {detailItem.approvedBudget ? `${detailItem.budgetCurrency} ${detailItem.approvedBudget.toLocaleString()}` : "â€”"}</div>
                <div><span className="text-muted-foreground">Expected Leads:</span> {detailItem.expectedLeads ?? "â€”"}</div>
              </div>

              {detailItem.participationTypes?.length > 0 && (<div><p className="text-muted-foreground mb-1">Participation:</p><div className="flex flex-wrap gap-1">{detailItem.participationTypes.map((pt) => (<Badge key={pt} variant="outline">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}</div></div>)}
              {detailItem.objectives?.length > 0 && (<div><p className="text-muted-foreground mb-1">Objectives:</p><div className="flex flex-wrap gap-1">{detailItem.objectives.map((o) => (<Badge key={o} variant="outline">{OBJECTIVE_LABELS[o] ?? o}</Badge>))}</div></div>)}
              {detailItem.requiredResources?.length > 0 && (<div><p className="text-muted-foreground mb-1">Required Resources:</p><div className="flex flex-wrap gap-1">{detailItem.requiredResources.map((r) => (<Badge key={r} variant="outline">{RESOURCE_LABELS[r] ?? r}</Badge>))}</div></div>)}
              {detailItem.budgetBreakdown && (<div><p className="text-muted-foreground mb-1">Budget Breakdown:</p><div className="grid grid-cols-3 gap-2">{Object.entries(detailItem.budgetBreakdown).map(([k, v]) => (<div key={k} className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p><p className="font-semibold">{detailItem.budgetCurrency} {(v as number)?.toLocaleString()}</p></div>))}</div></div>)}
              {detailItem.description && <div><p className="text-muted-foreground">Description:</p><p>{detailItem.description}</p></div>}
              {detailItem.executionPlan && <div><p className="text-muted-foreground">Execution Plan:</p><p>{detailItem.executionPlan}</p></div>}
              {detailItem.expectedOutcome && <div><p className="text-muted-foreground">Expected Outcome:</p><p>{detailItem.expectedOutcome}</p></div>}

              {/* Approval History */}
              {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 font-medium">Approval History:</p>
                  <div className="space-y-2">
                    {detailItem.statusHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs border-l-2 border-muted pl-3 py-1">
                        <Badge className={`${STATUS_COLORS[h.status]} text-xs`}>{STATUS_LABELS[h.status] ?? h.status}</Badge>
                        <span className="text-muted-foreground">{new Date(h.changedAt).toLocaleString()}</span>
                        {h.changedBy && <span>by {typeof h.changedBy === "object" ? h.changedBy.name : "User"}</span>}
                        {h.note && <span className="italic">â€” {h.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      <Dialog open={!!reviewItem} onOpenChange={() => { setReviewItem(null); setReviewNote(""); setApprovedBudget(""); }}>
        <DialogContent className="max-w-md">
          {reviewItem && (<>
            <DialogHeader>
              <DialogTitle>
                {reviewAction === "under_review" ? "Start Review" : reviewAction === "approved" ? "Approve Exhibition" : reviewAction === "revision_requested" ? "Request Revision" : reviewAction === "budget_approved" ? "Approve Budget" : "Reject Exhibition"}
              </DialogTitle>
              <DialogDescription>{reviewItem.eventName} â€” {reviewItem.agentId?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {["approved", "budget_approved"].includes(reviewAction) && (
                <div>
                  <Label>Approved Budget ({reviewItem.budgetCurrency})</Label>
                  <Input type="number" value={approvedBudget} onChange={(e) => setApprovedBudget(e.target.value)} placeholder="Approved budget amount" />
                  <p className="text-xs text-muted-foreground mt-1">Requested: {reviewItem.budgetCurrency} {reviewItem.estimatedBudget?.toLocaleString()}</p>
                </div>
              )}
              <div>
                <Label>{reviewAction === "revision_requested" ? "Revision Notes *" : "Review Notes"}</Label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={reviewAction === "revision_requested" ? "What needs to be revised..." : "Optional notes..."} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setReviewItem(null); setReviewNote(""); }}>{tc("cancel")}</Button>
              <Button onClick={handleReview}
                variant={reviewAction === "rejected" ? "destructive" : "default"}
                className={!["rejected"].includes(reviewAction) ? (reviewAction === "revision_requested" ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700") : ""}
                disabled={reviewAction === "revision_requested" && !reviewNote.trim()}>
                {reviewAction === "rejected" ? "Reject" : reviewAction === "revision_requested" ? "Request Revision" : "Confirm"}
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
