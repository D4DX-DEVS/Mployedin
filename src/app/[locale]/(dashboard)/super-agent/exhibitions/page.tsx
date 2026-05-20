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
  CalendarDays, Clock, CheckCircle2, Inbox, Sparkles,
  MapPin, ThumbsUp, ThumbsDown, Eye,
  DollarSign, Target, RotateCcw,
} from "lucide-react";
import { ExhibitionHeroFilters } from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

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

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
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
  const [categoryFilter, setCategoryFilter] = useState("all");
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
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [statusFilter, priorityFilter, categoryFilter, search, t]);

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

  const metrics = [
    { label: "Total Requests", value: items.length, helper: "All exhibition requests from your team.", icon: <CalendarDays className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Pending Review", value: pendingCount + reviewCount, helper: "Submitted or currently under review.", icon: <Clock className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
    { label: "Approved", value: approvedCount, helper: "Approved through active execution.", icon: <CheckCircle2 className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Budget Requested", value: totalBudgetRequested.toLocaleString(), helper: "Combined estimated budget across requests.", icon: <DollarSign className="h-5 w-5" />, toneClassName: "workspace-tone-indigo" },
    { label: "Budget Approved", value: totalBudgetApproved.toLocaleString(), helper: "Total approved spend to date.", icon: <Target className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
  ];

  return (
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Super agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Exhibition Management</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review and approve exhibition requests from your team. Use filters to narrow the queue, then act on submissions inline.
            </p>
          </div>
          <div className="workspace-glass-panel shrink-0 rounded-2xl px-4 py-3 text-left sm:min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Queue health</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {pendingCount + reviewCount} request{pendingCount + reviewCount === 1 ? "" : "s"} awaiting your review.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <SuperAgentMetricsGrid items={metrics} />
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

      <SuperAgentSection
        eyebrow="Requests"
        title="Team exhibition requests"
        description="Open details or run approval actions from the table below."
      >
        {loading ? (
          <SuperAgentDataTableShell>
            <div className="border-b border-border/50 bg-muted/30 px-4 py-3.5"><div className="h-4 w-48 animate-pulse rounded bg-muted" /></div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex items-center gap-4 border-b border-border/40 px-4 py-4 last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                <div className="h-4 w-36 animate-pulse rounded bg-muted/60" />
                <div className="hidden h-4 w-28 animate-pulse rounded bg-muted/40 md:block" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted/40" />
                <div className="ml-auto h-8 w-20 animate-pulse rounded-lg bg-muted/30" />
              </div>
            ))}
          </SuperAgentDataTableShell>
        ) : items.length === 0 ? (
          <SuperAgentEmptyState icon={<Inbox className="h-8 w-8 text-muted-foreground" />} title="No exhibition requests found" description="Try adjusting filters or check back when agents submit new events." />
        ) : (
          <SuperAgentDataTableShell>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/25">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Agent</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Location</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Participation</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Budget Req.</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Budget Appr.</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Objective</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Priority</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Resources</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {items.map((item, idx) => {
                    const days = dayCount(item.eventStartDate, item.eventEndDate);
                    return (
                      <tr key={item._id} className={`transition-colors hover:bg-primary/[0.03] ${idx % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                        <td className="px-4 py-3.5">
                          <button type="button" onClick={() => setDetailItem(item)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">{item.eventName}</button>
                          <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</p>
                        </td>
                        <td className="hidden px-4 py-3.5 md:table-cell">
                          <p className="text-sm font-medium">{item.agentId?.name}</p>
                          <p className="text-xs text-muted-foreground">{item.agentId?.email}</p>
                        </td>
                        <td className="hidden px-4 py-3.5 lg:table-cell">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary/60" /> {item.eventLocation}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <p className="text-xs font-medium">{fmtDate(item.eventStartDate)} – {fmtDate(item.eventEndDate)}</p>
                          {days ? <p className="mt-0.5 text-[11px] text-muted-foreground">{days} days</p> : null}
                        </td>
                        <td className="hidden px-4 py-3.5 sm:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(item.participationTypes ?? []).slice(0, 2).map((pt) => (<Badge key={pt} variant="outline" className="rounded-md border-primary/20 bg-primary/5 text-[11px] font-medium">{PARTICIPATION_LABELS[pt] ?? pt}</Badge>))}
                            {(item.participationTypes?.length ?? 0) > 2 && <Badge variant="outline" className="rounded-md text-[11px]">+{item.participationTypes.length - 2}</Badge>}
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 font-medium md:table-cell">{item.budgetCurrency} {item.estimatedBudget?.toLocaleString()}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell lg:table-cell">{item.approvedBudget ? <span className="font-medium text-emerald-600">{item.budgetCurrency} {item.approvedBudget.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="hidden px-4 py-3.5 xl:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(item.objectives ?? []).slice(0, 1).map((o) => (<Badge key={o} variant="outline" className="rounded-md text-[11px]">{OBJECTIVE_LABELS[o] ?? o}</Badge>))}
                            {(item.objectives?.length ?? 0) > 1 && <Badge variant="outline" className="rounded-md text-[11px]">+{item.objectives.length - 1}</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><Badge className={`${STATUS_COLORS[item.status]} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>{STATUS_LABELS[item.status] ?? item.status}</Badge></td>
                        <td className="hidden px-4 py-3.5 md:table-cell"><Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize`}>{item.priority}</Badge></td>
                        <td className="hidden px-4 py-3.5 xl:table-cell"><span className="text-xs text-muted-foreground">{item.requiredResources?.length ?? 0} items</span></td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" onClick={() => setDetailItem(item)}><Eye className="h-4 w-4" /></Button>
                            {item.status === "submitted" && (<Button size="sm" variant="outline" onClick={() => openReview(item, "under_review")} className="h-8 rounded-lg border-amber-200 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"><Clock className="mr-1 h-3.5 w-3.5" /> Review</Button>)}
                            {item.status === "under_review" && (<>
                              <Button size="sm" onClick={() => openReview(item, "approved")} className="h-8 rounded-lg bg-emerald-600 text-xs text-white hover:bg-emerald-700"><ThumbsUp className="mr-1 h-3.5 w-3.5" /> Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => openReview(item, "revision_requested")} className="h-8 rounded-lg border-orange-200 text-xs text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300"><RotateCcw className="mr-1 h-3.5 w-3.5" /> Revise</Button>
                              <Button size="sm" variant="destructive" className="h-8 rounded-lg text-xs" onClick={() => openReview(item, "rejected")}><ThumbsDown className="mr-1 h-3.5 w-3.5" /> Reject</Button>
                            </>)}
                            {item.status === "approved" && (<Button size="sm" variant="outline" onClick={() => openReview(item, "budget_approved")} className="h-8 rounded-lg border-teal-200 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-500/30 dark:text-teal-300"><DollarSign className="mr-1 h-3.5 w-3.5" /> Approve Budget</Button>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SuperAgentDataTableShell>
        )}
      </SuperAgentSection>

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{STATUS_LABELS[detailItem.status]}</Badge><Badge className={PRIORITY_COLORS[detailItem.priority]}>{detailItem.priority}</Badge></DialogTitle>
              <DialogDescription>{CATEGORY_LABELS[detailItem.eventCategory]} · {detailItem.eventLocation} {detailItem.country ? `· ${detailItem.country}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Agent:</span> <strong>{detailItem.agentId?.name}</strong></div>
                <div><span className="text-muted-foreground">Venue:</span> {detailItem.venue ?? "—"}</div>
              <div><span className="text-muted-foreground">Dates:</span> {fmtDate(detailItem.eventStartDate)}{detailItem.eventEndDate ? ` – ${fmtDate(detailItem.eventEndDate)}` : ""}{dayCount(detailItem.eventStartDate, detailItem.eventEndDate) ? ` (${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)` : ""}</div>
                <div><span className="text-muted-foreground">Organizer:</span> {detailItem.organizerName ?? "—"}</div>
                <div><span className="text-muted-foreground">Budget Requested:</span> {detailItem.budgetCurrency} {detailItem.estimatedBudget?.toLocaleString()}</div>
                <div><span className="text-muted-foreground">Budget Approved:</span> {detailItem.approvedBudget ? `${detailItem.budgetCurrency} ${detailItem.approvedBudget.toLocaleString()}` : "—"}</div>
                <div><span className="text-muted-foreground">Expected Leads:</span> {detailItem.expectedLeads ?? "—"}</div>
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
                        {h.note && <span className="italic">— {h.note}</span>}
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
              <DialogDescription>{reviewItem.eventName} — {reviewItem.agentId?.name}</DialogDescription>
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
