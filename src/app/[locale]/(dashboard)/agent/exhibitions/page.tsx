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
  CalendarDays, Plus, Clock, CheckCircle2, XCircle, ChevronRight, ChevronLeft,
  Trash2, Edit, Search, Inbox, MapPin, Building2, Target, DollarSign,
  FileText, Briefcase, Send, Save, Eye, AlertTriangle,
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
  organizerContact?: string;
  participationTypes: string[];
  participationDetails?: string;
  objectives: string[];
  estimatedBudget: number;
  budgetBreakdown?: {
    travel: number;
    accommodation: number;
    marketingMaterial: number;
    stallCost: number;
    miscellaneous: number;
  };
  budgetCurrency: string;
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;
  requiredResources: string[];
  priority: string;
  status: string;
  reviewNote?: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
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

const EVENT_CATEGORIES = [
  { value: "career_fair", label: "Career Fair" },
  { value: "recruitment_expo", label: "Recruitment Expo" },
  { value: "employer_branding", label: "Employer Branding Event" },
  { value: "hiring_drive", label: "Hiring Drive" },
  { value: "university_event", label: "University Event" },
  { value: "gcc_recruitment", label: "GCC Recruitment Expo" },
  { value: "job_fair", label: "Job Fair" },
  { value: "other", label: "Other" },
];

const PARTICIPATION_TYPES = [
  { value: "standee", label: "Standee" },
  { value: "stall", label: "Stall" },
  { value: "booth", label: "Booth" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "flyers", label: "Flyers" },
  { value: "recruitment_desk", label: "Recruitment Desk" },
  { value: "branding_package", label: "Branding Package" },
  { value: "other", label: "Other" },
];

const OBJECTIVES = [
  { value: "employer_acquisition", label: "Employer Acquisition" },
  { value: "candidate_sourcing", label: "Candidate Sourcing" },
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "lead_generation", label: "Lead Generation" },
  { value: "direct_hiring", label: "Direct Hiring" },
  { value: "market_expansion", label: "Market Expansion" },
];

const RESOURCE_TYPES = [
  { value: "brochures", label: "Brochures" },
  { value: "standee", label: "Standee" },
  { value: "flyers", label: "Flyers" },
  { value: "presentation_deck", label: "Presentation Deck" },
  { value: "employer_catalog", label: "Employer Catalog" },
  { value: "candidate_forms", label: "Candidate Forms" },
  { value: "branding_banners", label: "Branding Banners" },
  { value: "video_assets", label: "Video Assets" },
  { value: "business_cards", label: "Business Cards" },
  { value: "booth_design", label: "Booth Design" },
];

const PRIORITIES = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" }, { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" }, { value: "approved", label: "Approved" },
  { value: "revision_requested", label: "Revision Requested" },
  { value: "completed", label: "Completed" }, { value: "rejected", label: "Rejected" },
];

const WIZARD_STEPS = [
  { id: 1, title: "Event Details", icon: CalendarDays },
  { id: 2, title: "Participation", icon: Building2 },
  { id: 3, title: "Objectives", icon: Target },
  { id: 4, title: "Budget", icon: DollarSign },
  { id: 5, title: "Description", icon: FileText },
  { id: 6, title: "Resources", icon: Briefcase },
  { id: 7, title: "Review & Submit", icon: Send },
];

const INITIAL_FORM = {
  eventName: "", eventCategory: "career_fair", eventLocation: "", venue: "", country: "",
  eventStartDate: "", eventEndDate: "", organizerName: "", organizerContact: "",
  participationTypes: [] as string[], participationDetails: "",
  objectives: [] as string[],
  estimatedBudget: "", budgetCurrency: "USD",
  budgetTravel: "", budgetAccommodation: "", budgetMarketing: "", budgetStall: "", budgetMisc: "",
  description: "", executionPlan: "", expectedOutcome: "", expectedLeads: "",
  requiredResources: [] as string[], priority: "medium",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);

  const resetForm = () => { setForm({ ...INITIAL_FORM }); setEditingId(null); setWizardStep(1); };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [statusFilter, search, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const handleSubmit = async (asDraft: boolean) => {
    if (!form.eventName.trim() || !form.eventCategory || !form.eventLocation.trim() || !form.eventStartDate || !form.eventEndDate) {
      toast.error("Please fill in all required event details (Step 1)"); setWizardStep(1); return;
    }
    try {
      const travel = Number(form.budgetTravel) || 0;
      const accommodation = Number(form.budgetAccommodation) || 0;
      const marketing = Number(form.budgetMarketing) || 0;
      const stall = Number(form.budgetStall) || 0;
      const misc = Number(form.budgetMisc) || 0;
      const totalBudget = Number(form.estimatedBudget) || (travel + accommodation + marketing + stall + misc);
      const payload = {
        eventName: form.eventName.trim(), eventCategory: form.eventCategory,
        eventLocation: form.eventLocation.trim(), venue: form.venue.trim() || undefined,
        country: form.country.trim() || undefined,
        eventStartDate: form.eventStartDate, eventEndDate: form.eventEndDate,
        organizerName: form.organizerName.trim() || undefined,
        organizerContact: form.organizerContact.trim() || undefined,
        participationTypes: form.participationTypes, participationDetails: form.participationDetails.trim() || undefined,
        objectives: form.objectives,
        estimatedBudget: totalBudget,
        budgetBreakdown: { travel, accommodation, marketingMaterial: marketing, stallCost: stall, miscellaneous: misc },
        budgetCurrency: form.budgetCurrency,
        description: form.description.trim() || undefined, executionPlan: form.executionPlan.trim() || undefined,
        expectedOutcome: form.expectedOutcome.trim() || undefined,
        expectedLeads: form.expectedLeads ? Number(form.expectedLeads) : undefined,
        requiredResources: form.requiredResources, priority: form.priority,
        status: asDraft ? "draft" : "submitted",
      };
      const url = editingId ? `/api/exhibitions/${editingId}` : "/api/exhibitions";
      const method = editingId ? "PATCH" : "POST";
      const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(editingId ? t("updated") : (asDraft ? "Saved as draft" : t("created")));
        resetForm(); setShowWizard(false); fetchItems();
      } else { const err = await res.json(); toast.error(err.error ?? t("submitError")); }
    } catch { toast.error(t("submitError")); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/exhibitions/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success(t("deleted")); fetchItems(); }
    } catch { toast.error(t("deleteError")); }
  };

  const startEdit = (item: ExhibitionRequest) => {
    setForm({
      eventName: item.eventName, eventCategory: item.eventCategory ?? "career_fair",
      eventLocation: item.eventLocation ?? "", venue: item.venue ?? "", country: item.country ?? "",
      eventStartDate: item.eventStartDate?.slice(0, 10) ?? "",
      eventEndDate: item.eventEndDate?.slice(0, 10) ?? "",
      organizerName: item.organizerName ?? "", organizerContact: item.organizerContact ?? "",
      participationTypes: item.participationTypes ?? [], participationDetails: item.participationDetails ?? "",
      objectives: item.objectives ?? [],
      estimatedBudget: item.estimatedBudget?.toString() ?? "", budgetCurrency: item.budgetCurrency ?? "USD",
      budgetTravel: item.budgetBreakdown?.travel?.toString() ?? "",
      budgetAccommodation: item.budgetBreakdown?.accommodation?.toString() ?? "",
      budgetMarketing: item.budgetBreakdown?.marketingMaterial?.toString() ?? "",
      budgetStall: item.budgetBreakdown?.stallCost?.toString() ?? "",
      budgetMisc: item.budgetBreakdown?.miscellaneous?.toString() ?? "",
      description: item.description ?? "", executionPlan: item.executionPlan ?? "",
      expectedOutcome: item.expectedOutcome ?? "",
      expectedLeads: item.expectedLeads?.toString() ?? "",
      requiredResources: item.requiredResources ?? [], priority: item.priority ?? "medium",
    });
    setEditingId(item._id); setWizardStep(1); setShowWizard(true);
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString();
  const dayCount = (s: string, e: string) => Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);
  const calcBudgetTotal = () => (Number(form.budgetTravel) || 0) + (Number(form.budgetAccommodation) || 0) + (Number(form.budgetMarketing) || 0) + (Number(form.budgetStall) || 0) + (Number(form.budgetMisc) || 0);
  const labelFor = (arr: { value: string; label: string }[], val: string) => arr.find((o) => o.value === val)?.label ?? val;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowWizard(true); }} size="lg">
          <Plus className="h-4 w-4 mr-2" /> {t("newRequest")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} placeholder={t("filterStatus")} />
      </div>

      {/* Stats */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: items.length, color: "text-gray-700 dark:text-gray-300" },
            { label: "Submitted", value: items.filter((i) => i.status === "submitted").length, color: "text-blue-600" },
            { label: "Approved", value: items.filter((i) => ["approved","budget_approved","resources_assigned","active"].includes(i.status)).length, color: "text-emerald-600" },
            { label: "Active", value: items.filter((i) => i.status === "active").length, color: "text-purple-600" },
            { label: "Completed", value: items.filter((i) => i.status === "completed").length, color: "text-green-600" },
            { label: "Revision", value: items.filter((i) => i.status === "revision_requested").length, color: "text-orange-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-3 opacity-40" /><p>{t("noRequests")}</p>
          <Button variant="outline" className="mt-4" onClick={() => { resetForm(); setShowWizard(true); }}><Plus className="h-4 w-4 mr-2" /> Create your first request</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Event</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Category</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Location</th>
              <th className="text-left p-3 font-medium">Dates</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Budget</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Priority</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <button onClick={() => setDetailItem(item)} className="font-medium text-primary hover:underline text-left">{item.eventName}</button>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                  </td>
                  <td className="p-3 hidden md:table-cell"><Badge variant="outline" className="text-xs capitalize">{labelFor(EVENT_CATEGORIES, item.eventCategory)}</Badge></td>
                  <td className="p-3 hidden lg:table-cell"><span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" /> {item.eventLocation}</span></td>
                  <td className="p-3 whitespace-nowrap text-xs">{fmtDate(item.eventStartDate)} â€“ {fmtDate(item.eventEndDate)}<br /><span className="text-muted-foreground">{dayCount(item.eventStartDate, item.eventEndDate)} days</span></td>
                  <td className="p-3 hidden sm:table-cell whitespace-nowrap">{item.budgetCurrency} {item.estimatedBudget?.toLocaleString()}</td>
                  <td className="p-3"><Badge className={STATUS_COLORS[item.status] ?? STATUS_COLORS.draft}>{STATUS_LABELS[item.status] ?? item.status}</Badge></td>
                  <td className="p-3 hidden md:table-cell"><Badge className={PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}>{item.priority}</Badge></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}><Eye className="h-3.5 w-3.5" /></Button>
                      {["draft","submitted","revision_requested"].includes(item.status) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                          {["draft","submitted"].includes(item.status) && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item._id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </>
                      )}
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
              <DialogTitle className="flex items-center gap-2">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{STATUS_LABELS[detailItem.status]}</Badge></DialogTitle>
              <DialogDescription>{labelFor(EVENT_CATEGORIES, detailItem.eventCategory)} Â· {detailItem.eventLocation}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {detailItem.status === "revision_requested" && detailItem.reviewNote && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3">
                  <p className="font-medium text-orange-800 dark:text-orange-400 flex items-center gap-1 mb-1"><AlertTriangle className="h-4 w-4" /> Revision Requested</p>
                  <p className="text-orange-700 dark:text-orange-300">{detailItem.reviewNote}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Venue:</span> {detailItem.venue ?? "â€”"}</div>
                <div><span className="text-muted-foreground">Country:</span> {detailItem.country ?? "â€”"}</div>
                <div><span className="text-muted-foreground">Dates:</span> {fmtDate(detailItem.eventStartDate)} â€“ {fmtDate(detailItem.eventEndDate)} ({dayCount(detailItem.eventStartDate, detailItem.eventEndDate)} days)</div>
                <div><span className="text-muted-foreground">Organizer:</span> {detailItem.organizerName ?? "â€”"}</div>
                <div><span className="text-muted-foreground">Budget:</span> {detailItem.budgetCurrency} {detailItem.estimatedBudget?.toLocaleString()}</div>
                <div><span className="text-muted-foreground">Expected Leads:</span> {detailItem.expectedLeads ?? "â€”"}</div>
                <div><span className="text-muted-foreground">Priority:</span> <Badge className={PRIORITY_COLORS[detailItem.priority]}>{detailItem.priority}</Badge></div>
              </div>
              {detailItem.participationTypes?.length > 0 && (<div><p className="text-muted-foreground mb-1">Participation:</p><div className="flex flex-wrap gap-1">{detailItem.participationTypes.map((pt) => (<Badge key={pt} variant="outline" className="capitalize">{labelFor(PARTICIPATION_TYPES, pt)}</Badge>))}</div></div>)}
              {detailItem.objectives?.length > 0 && (<div><p className="text-muted-foreground mb-1">Objectives:</p><div className="flex flex-wrap gap-1">{detailItem.objectives.map((o) => (<Badge key={o} variant="outline">{labelFor(OBJECTIVES, o)}</Badge>))}</div></div>)}
              {detailItem.requiredResources?.length > 0 && (<div><p className="text-muted-foreground mb-1">Required Resources:</p><div className="flex flex-wrap gap-1">{detailItem.requiredResources.map((r) => (<Badge key={r} variant="outline">{labelFor(RESOURCE_TYPES, r)}</Badge>))}</div></div>)}
              {detailItem.budgetBreakdown && (<div><p className="text-muted-foreground mb-1">Budget Breakdown:</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(detailItem.budgetBreakdown).map(([k, v]) => (<div key={k} className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p><p className="font-semibold">{detailItem.budgetCurrency} {(v as number)?.toLocaleString()}</p></div>))}</div></div>)}
              {detailItem.description && <div><p className="text-muted-foreground">Description:</p><p>{detailItem.description}</p></div>}
              {detailItem.executionPlan && <div><p className="text-muted-foreground">Execution Plan:</p><p>{detailItem.executionPlan}</p></div>}
              {detailItem.expectedOutcome && <div><p className="text-muted-foreground">Expected Outcome:</p><p>{detailItem.expectedOutcome}</p></div>}
            </div>
            <DialogFooter>
              {["draft","submitted","revision_requested"].includes(detailItem.status) && (<Button variant="outline" onClick={() => { setDetailItem(null); startEdit(detailItem); }}><Edit className="h-4 w-4 mr-2" /> Edit</Button>)}
              <Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* WIZARD MODAL */}
      <Dialog open={showWizard} onOpenChange={(open) => { if (!open) { resetForm(); setShowWizard(false); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background border-b px-6 pt-5 pb-4">
            <DialogHeader>
              <DialogTitle className="text-lg">{editingId ? "Edit Exhibition Request" : "New Exhibition Request"}</DialogTitle>
              <DialogDescription>Step {wizardStep} of 7 â€” {WIZARD_STEPS[wizardStep - 1].title}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-1 mt-4 overflow-x-auto">
              {WIZARD_STEPS.map((step) => {
                const Icon = step.icon;
                const isCurrent = step.id === wizardStep;
                const isPast = step.id < wizardStep;
                return (
                  <button key={step.id} onClick={() => setWizardStep(step.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${isCurrent ? "bg-primary text-primary-foreground" : isPast ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{step.title}</span><span className="sm:hidden">{step.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Step 1 â€” Event Details */}
            {wizardStep === 1 && (<div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Exhibition Title *</Label><Input value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} placeholder="e.g., Dubai Career Expo 2026" /></div>
              <div><Label>Event Category *</Label><SearchableSelect options={EVENT_CATEGORIES} value={form.eventCategory} onValueChange={(v) => setForm({ ...form, eventCategory: v })} placeholder="Select category" /></div>
              <div><Label>Priority</Label><SearchableSelect options={PRIORITIES} value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })} placeholder="Select priority" /></div>
              <div><Label>Location *</Label><Input value={form.eventLocation} onChange={(e) => setForm({ ...form, eventLocation: e.target.value })} placeholder="City / Area" /></div>
              <div><Label>Venue</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Convention center, hotel..." /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g., UAE" /></div>
              <div><Label>Start Date *</Label><Input type="date" value={form.eventStartDate} onChange={(e) => setForm({ ...form, eventStartDate: e.target.value })} /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.eventEndDate} onChange={(e) => setForm({ ...form, eventEndDate: e.target.value })} /></div>
              {form.eventStartDate && form.eventEndDate && (<div className="sm:col-span-2 rounded-lg bg-muted/50 p-3 text-center text-sm">Duration: <strong>{dayCount(form.eventStartDate, form.eventEndDate)} days</strong></div>)}
              <div><Label>Organizer Name</Label><Input value={form.organizerName} onChange={(e) => setForm({ ...form, organizerName: e.target.value })} placeholder="Organizer / Company" /></div>
              <div><Label>Contact Details</Label><Input value={form.organizerContact} onChange={(e) => setForm({ ...form, organizerContact: e.target.value })} placeholder="Phone / Email" /></div>
            </div></div>)}

            {/* Step 2 â€” Participation */}
            {wizardStep === 2 && (<div className="space-y-4">
              <Label>Select Participation Types (multiple)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PARTICIPATION_TYPES.map((pt) => (
                  <button key={pt.value} type="button" onClick={() => setForm({ ...form, participationTypes: toggleArray(form.participationTypes, pt.value) })}
                    className={`rounded-lg border p-3 text-sm text-center transition-colors ${form.participationTypes.includes(pt.value) ? "bg-primary/10 border-primary text-primary font-medium" : "hover:bg-muted/50"}`}>{pt.label}</button>
                ))}
              </div>
              <div><Label>Additional Details</Label><Textarea value={form.participationDetails} onChange={(e) => setForm({ ...form, participationDetails: e.target.value })} placeholder="Any specific requirements..." rows={3} /></div>
            </div>)}

            {/* Step 3 â€” Objectives */}
            {wizardStep === 3 && (<div className="space-y-4">
              <Label>Select Business Objectives (multiple)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {OBJECTIVES.map((obj) => (
                  <button key={obj.value} type="button" onClick={() => setForm({ ...form, objectives: toggleArray(form.objectives, obj.value) })}
                    className={`rounded-lg border p-4 text-left transition-colors ${form.objectives.includes(obj.value) ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}`}>
                    <span className={`font-medium ${form.objectives.includes(obj.value) ? "text-primary" : ""}`}>{obj.label}</span>
                  </button>
                ))}
              </div>
            </div>)}

            {/* Step 4 â€” Budget */}
            {wizardStep === 4 && (<div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Currency</Label><SearchableSelect options={[{value:"USD",label:"USD"},{value:"INR",label:"INR"},{value:"AED",label:"AED"},{value:"SAR",label:"SAR"},{value:"EUR",label:"EUR"},{value:"GBP",label:"GBP"}]} value={form.budgetCurrency} onValueChange={(v) => setForm({ ...form, budgetCurrency: v })} placeholder="Currency" /></div>
                <div><Label>Total Estimated Budget</Label><Input type="number" value={form.estimatedBudget || calcBudgetTotal().toString()} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} placeholder="Auto-calculated" /></div>
              </div>
              <div className="border rounded-lg p-4 space-y-3">
                <p className="font-medium text-sm">Budget Breakdown</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label className="text-xs">Travel</Label><Input type="number" value={form.budgetTravel} onChange={(e) => setForm({ ...form, budgetTravel: e.target.value })} placeholder="0" /></div>
                  <div><Label className="text-xs">Accommodation</Label><Input type="number" value={form.budgetAccommodation} onChange={(e) => setForm({ ...form, budgetAccommodation: e.target.value })} placeholder="0" /></div>
                  <div><Label className="text-xs">Marketing Material</Label><Input type="number" value={form.budgetMarketing} onChange={(e) => setForm({ ...form, budgetMarketing: e.target.value })} placeholder="0" /></div>
                  <div><Label className="text-xs">Stall Cost</Label><Input type="number" value={form.budgetStall} onChange={(e) => setForm({ ...form, budgetStall: e.target.value })} placeholder="0" /></div>
                  <div><Label className="text-xs">Miscellaneous</Label><Input type="number" value={form.budgetMisc} onChange={(e) => setForm({ ...form, budgetMisc: e.target.value })} placeholder="0" /></div>
                </div>
                {calcBudgetTotal() > 0 && (<div className="text-right pt-2 border-t"><span className="text-muted-foreground text-sm">Breakdown Total: </span><span className="font-bold">{form.budgetCurrency} {calcBudgetTotal().toLocaleString()}</span></div>)}
              </div>
            </div>)}

            {/* Step 5 â€” Description */}
            {wizardStep === 5 && (<div className="space-y-4">
              <div><Label>Description / Notes</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="General notes..." rows={3} /></div>
              <div><Label>Execution Plan</Label><Textarea value={form.executionPlan} onChange={(e) => setForm({ ...form, executionPlan: e.target.value })} placeholder="How will this exhibition be executed?" rows={4} /></div>
              <div><Label>Expected Outcome</Label><Textarea value={form.expectedOutcome} onChange={(e) => setForm({ ...form, expectedOutcome: e.target.value })} placeholder="What outcomes are expected?" rows={3} /></div>
              <div><Label>Expected Leads</Label><Input type="number" value={form.expectedLeads} onChange={(e) => setForm({ ...form, expectedLeads: e.target.value })} placeholder="e.g., 350" /></div>
            </div>)}

            {/* Step 6 â€” Resources */}
            {wizardStep === 6 && (<div className="space-y-4">
              <Label>Select Required Resources (multiple)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {RESOURCE_TYPES.map((r) => (
                  <button key={r.value} type="button" onClick={() => setForm({ ...form, requiredResources: toggleArray(form.requiredResources, r.value) })}
                    className={`rounded-lg border p-3 text-sm text-center transition-colors ${form.requiredResources.includes(r.value) ? "bg-primary/10 border-primary text-primary font-medium" : "hover:bg-muted/50"}`}>{r.label}</button>
                ))}
              </div>
            </div>)}

            {/* Step 7 â€” Review */}
            {wizardStep === 7 && (<div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold">Review Your Request</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Event:</span> <strong>{form.eventName}</strong></div>
                  <div><span className="text-muted-foreground">Category:</span> {labelFor(EVENT_CATEGORIES, form.eventCategory)}</div>
                  <div><span className="text-muted-foreground">Location:</span> {form.eventLocation}</div>
                  <div><span className="text-muted-foreground">Venue:</span> {form.venue || "â€”"}</div>
                  <div><span className="text-muted-foreground">Country:</span> {form.country || "â€”"}</div>
                  <div><span className="text-muted-foreground">Dates:</span> {form.eventStartDate} â€“ {form.eventEndDate}</div>
                  {form.eventStartDate && form.eventEndDate && <div><span className="text-muted-foreground">Duration:</span> {dayCount(form.eventStartDate, form.eventEndDate)} days</div>}
                  <div><span className="text-muted-foreground">Priority:</span> {form.priority}</div>
                  <div><span className="text-muted-foreground">Budget:</span> {form.budgetCurrency} {(Number(form.estimatedBudget) || calcBudgetTotal()).toLocaleString()}</div>
                  <div><span className="text-muted-foreground">Expected Leads:</span> {form.expectedLeads || "â€”"}</div>
                </div>
                {form.participationTypes.length > 0 && (<div className="text-sm"><span className="text-muted-foreground">Participation:</span><div className="flex flex-wrap gap-1 mt-1">{form.participationTypes.map((pt) => (<Badge key={pt} variant="outline" className="text-xs capitalize">{labelFor(PARTICIPATION_TYPES, pt)}</Badge>))}</div></div>)}
                {form.objectives.length > 0 && (<div className="text-sm"><span className="text-muted-foreground">Objectives:</span><div className="flex flex-wrap gap-1 mt-1">{form.objectives.map((o) => (<Badge key={o} variant="outline" className="text-xs">{labelFor(OBJECTIVES, o)}</Badge>))}</div></div>)}
                {form.requiredResources.length > 0 && (<div className="text-sm"><span className="text-muted-foreground">Resources:</span><div className="flex flex-wrap gap-1 mt-1">{form.requiredResources.map((r) => (<Badge key={r} variant="outline" className="text-xs">{labelFor(RESOURCE_TYPES, r)}</Badge>))}</div></div>)}
                {form.description && <div className="text-sm"><span className="text-muted-foreground">Description:</span><p className="mt-1">{form.description}</p></div>}
                {form.executionPlan && <div className="text-sm"><span className="text-muted-foreground">Execution Plan:</span><p className="mt-1">{form.executionPlan}</p></div>}
              </div>
            </div>)}
          </div>

          {/* Wizard Footer */}
          <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex items-center justify-between">
            <div>{wizardStep > 1 && (<Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>)}</div>
            <div className="flex items-center gap-2">
              {wizardStep === 7 ? (<>
                <Button variant="outline" onClick={() => handleSubmit(true)}><Save className="h-4 w-4 mr-1" /> Save Draft</Button>
                <Button onClick={() => handleSubmit(false)}><Send className="h-4 w-4 mr-1" /> Submit Request</Button>
              </>) : (<Button onClick={() => setWizardStep(wizardStep + 1)}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
