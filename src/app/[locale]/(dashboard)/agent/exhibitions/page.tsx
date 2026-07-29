"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Copy,
  Edit,
  Eye,
  Inbox,
  MapPin,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { ExhibitionHeroFilters } from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/hooks/useConfirm";
import { SUPPORTED_CURRENCIES, formatCurrency } from "@/lib/currency";
import {
  EMPTY_AGENT_EXHIBITION_FORM,
  createDuplicatedExhibitionForm,
  resolveCountryCode,
  type AgentExhibitionFormState,
} from "@/lib/exhibitions/agent-request";
import { csrfFetch } from "@/lib/security/csrf-client";
import { ApprovalTimeline, type TimelineEntry } from "@/components/features/exhibitions/ApprovalTimeline";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

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
  approvedBudget?: number;
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
  statusHistory?: TimelineEntry[];
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
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Operationally Approved",
  revision_requested: "Revision Requested",
  budget_approved: "Financially Approved",
  resources_assigned: "Resources Assigned",
  active: "Active",
  completed: "Completed",
  rejected: "Rejected",
  archived: "Archived",
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

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Operationally Approved" },
  { value: "revision_requested", label: "Revision Requested" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "All Categories" },
  ...EVENT_CATEGORIES.map((category) => ({ value: category.value, label: category.label })),
];

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((currency) => ({
  value: currency.code,
  label: `${currency.code} - ${currency.label}`,
}));

const SPINNERLESS_INPUT_CLASS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export default function AgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentExhibitionFormState>({ ...EMPTY_AGENT_EXHIBITION_FORM });
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null);
  const [agentCurrency, setAgentCurrency] = useState<string>("AED");
  const [agentCountry, setAgentCountry] = useState<string>("");

  // Fetch agent's default currency and country on mount
  useEffect(() => {
    fetch("/api/agent/settings/invoice-defaults")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.invoiceDefaults?.defaultCurrency) {
          setAgentCurrency(data.invoiceDefaults.defaultCurrency);
        }
        if (data?.invoiceDefaults?.billingCountry) {
          setAgentCountry(data.invoiceDefaults.billingCountry);
        }
      })
      .catch(() => { /* silent fallback */ });
  }, []);

  const resetForm = useCallback(() => {
    setForm((prev) => ({ ...EMPTY_AGENT_EXHIBITION_FORM, budgetCurrency: prev.budgetCurrency }));
    setEditingId(null);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      if (search) {
        params.set("search", search);
      }
      const response = await fetch(`/api/exhibitions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items ?? []);
        updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter, t, page, limit, paginationParams, updateTotal]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  useEffect(() => {
    resetPage();
  }, [search, statusFilter, categoryFilter, resetPage]);

  const updateForm = useCallback(<Key extends keyof AgentExhibitionFormState>(field: Key, value: AgentExhibitionFormState[Key]) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }, []);

  const openNewRequest = () => {
    setForm({ ...EMPTY_AGENT_EXHIBITION_FORM, budgetCurrency: agentCurrency, country: agentCountry });
    setEditingId(null);
    setShowWizard(true);
  };

  // Date validation helpers
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startDateMin = today;
  const endDateMin = useMemo(() => {
    if (form.eventStartDate) {
      const d = new Date(form.eventStartDate);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return today;
  }, [form.eventStartDate, today]);

  const handleBudgetChange = (value: string) => {
    const sanitized = value.replace(/[^\d.]/g, "");
    const [wholePart = "", ...decimalParts] = sanitized.split(".");
    const normalizedValue = decimalParts.length > 0 ? `${wholePart}.${decimalParts.join("")}` : wholePart;
    updateForm("estimatedBudget", normalizedValue);
  };

  const handleCurrencyChange = (budgetCurrency: string) => {
    updateForm("budgetCurrency", budgetCurrency);
  };

  const validateForm = () => {
    if (!form.eventName.trim()) {
      toast.error(t("enterExhibitionTitle"));
      return false;
    }
    if (form.eventStartDate) {
      const start = new Date(form.eventStartDate);
      if (start < today) {
        toast.error(t("startDateInPast"));
        return false;
      }
      if (form.eventEndDate && new Date(form.eventEndDate) < start) {
        toast.error(t("endDateEarlierThanStart"));
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!asDraft && !validateForm()) {
      return;
    }

    try {
      const parsedBudget = form.estimatedBudget ? Number(form.estimatedBudget) : 0;
      const payload = {
        eventName: form.eventName.trim(),
        eventCategory: form.eventCategory || "career_fair",
        eventLocation: form.eventLocation.trim() || "TBD",
        venue: form.venue.trim() || undefined,
        country: form.country.trim() || undefined,
        eventStartDate: form.eventStartDate || undefined,
        eventEndDate: form.eventEndDate || undefined,
        organizerName: form.organizerName.trim() || undefined,
        organizerContact: form.organizerContact.trim() || undefined,
        estimatedBudget: Number.isFinite(parsedBudget) ? parsedBudget : 0,
        budgetCurrency: form.budgetCurrency,
        description: form.description.trim() || undefined,
        priority: form.priority || "medium",
        status: asDraft ? "draft" : "submitted",
      };

      const url = editingId ? `/api/exhibitions/${editingId}` : "/api/exhibitions";
      const method = editingId ? "PATCH" : "POST";
      const response = await csrfFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error ?? t("submitError"));
        return;
      }

      toast.success(editingId ? t("updated") : asDraft ? "Saved as draft" : t("created"));
      resetForm();
      setShowWizard(false);
      fetchItems();
    } catch {
      toast.error(t("submitError"));
    }
  };

  const handleDelete = async (id: string) => {
    const shouldDelete = await confirm({
      title: "Delete request",
      message: "Delete this exhibition request? This action cannot be undone.",
      confirmLabel: "Delete request",
      variant: "destructive",
    });

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await csrfFetch(`/api/exhibitions/${id}`, { method: "DELETE" });
      if (response.ok) {
        toast.success(t("deleted"));
        fetchItems();
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  const startEdit = (item: ExhibitionRequest) => {
    setForm({
      ...EMPTY_AGENT_EXHIBITION_FORM,
      eventName: item.eventName,
      eventCategory: item.eventCategory ?? EMPTY_AGENT_EXHIBITION_FORM.eventCategory,
      eventLocation: item.eventLocation ?? "",
      venue: item.venue ?? "",
      country: item.country ?? "",
      countryCode: resolveCountryCode(item.country),
      eventStartDate: item.eventStartDate?.slice(0, 10) ?? "",
      eventEndDate: item.eventEndDate?.slice(0, 10) ?? "",
      organizerName: item.organizerName ?? "",
      organizerContact: item.organizerContact ?? "",
      participationTypes: item.participationTypes ?? [],
      participationDetails: item.participationDetails ?? "",
      objectives: item.objectives ?? [],
      estimatedBudget: item.estimatedBudget?.toString() ?? "",
      budgetCurrency: item.budgetCurrency ?? "USD",
      description: item.description ?? "",
      expectedLeads: item.expectedLeads?.toString() ?? "",
      requiredResources: item.requiredResources ?? [],
      priority: item.priority ?? EMPTY_AGENT_EXHIBITION_FORM.priority,
    });
    setEditingId(item._id);
    setShowWizard(true);
  };

  const handleDuplicate = (item: ExhibitionRequest) => {
    const duplicatedForm = createDuplicatedExhibitionForm(item);
    setForm(duplicatedForm);
    setEditingId(null);
    setShowWizard(true);
    toast.success(t("requestCopied"));
  };

  const formatDate = (value: string) => {
    if (!value) {
      return "-";
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsedDate);
  };
  const dayCount = (startDate: string, endDate: string) => {
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      return 0;
    }

    return Math.max(1, Math.ceil((parsedEndDate.getTime() - parsedStartDate.getTime()) / 86400000) + 1);
  };
  const labelFor = (options: { value: string; label: string }[], value: string) => (
    options.find((option) => option.value === value)?.label ?? value
  );
  const isEditing = editingId !== null;
  const setDialogRef = useCallback((node: HTMLDivElement | null) => {
    dialogContentRef.current = node;
    setDialogContainer(node);
  }, []);

  const submittedCount = items.filter((item) => item.status === "submitted").length;
  const approvedCount = items.filter((item) => ["approved", "budget_approved", "resources_assigned"].includes(item.status)).length;

  return (
    <div className="page-container space-y-3 sm:space-y-6">
      {ConfirmDialogNode}

      <DashboardPageHeader
        icon={CalendarDays}
        eyebrow="Exhibition requests"
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button onClick={openNewRequest} size="lg" className="h-11 shrink-0 rounded-xl px-5 shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> {t("newRequest")}
          </Button>
        }
        metrics={!loading && items.length > 0 ? [
          { label: "Total", value: items.length, note: "All requests", icon: CalendarDays },
          { label: "Submitted", value: submittedCount, note: "Awaiting review", icon: Send },
          { label: "Approved", value: approvedCount, note: "Cleared to proceed", icon: Save },
          { label: "Active", value: items.filter((item) => item.status === "active").length, note: "In progress", icon: Clock },
          { label: "Completed", value: items.filter((item) => item.status === "completed").length, note: "Finished", icon: Eye },
          { label: "Revision", value: items.filter((item) => item.status === "revision_requested").length, note: "Needs updates", icon: AlertTriangle },
        ] : undefined}
        metricsClassName="xl:grid-cols-6"
      >
        <ExhibitionHeroFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={STATUS_OPTIONS}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categoryOptions={CATEGORY_FILTER_OPTIONS}
          searchPlaceholder={t("searchPlaceholder")}
        />
      </DashboardPageHeader>

      <section className="workspace-panel-surface rounded-[28px] p-3.5 sm:p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your requests</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Request history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open details or continue editing drafts from the table below.</p>
        </div>

        <div className="mt-5">
      {loading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground">
          <Clock className="mr-2 h-5 w-5 animate-spin" /> {tc("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="workspace-empty-state flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-8 w-8 text-muted-foreground" /></div>
          <p className="text-sm font-semibold text-foreground">{t("noRequests")}</p>
          <Button variant="outline" className="mt-2 rounded-xl" onClick={openNewRequest}>
            <Plus className="mr-2 h-4 w-4" /> Create your first request
          </Button>
        </div>
      ) : (
        <div className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gradient-to-r from-muted/80 to-muted/40">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event</th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Category</th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Location</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Budget</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Priority</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((item, idx) => (
                <tr key={item._id} className={`transition-colors hover:bg-primary/[0.03] ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td className="px-4 py-3.5">
                    <button onClick={() => setDetailItem(item)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">
                      {item.eventName}
                    </button>
                    {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <Badge variant="outline" className="rounded-md border-primary/20 bg-primary/5 text-xs font-medium">
                      {labelFor(EVENT_CATEGORIES, item.eventCategory)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary/60" /> {item.eventLocation}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <p className="text-xs font-medium">{formatDate(item.eventStartDate)}{item.eventEndDate ? ` – ${formatDate(item.eventEndDate)}` : ""}</p>
                    {item.eventEndDate && <p className="mt-0.5 text-[11px] text-muted-foreground">{dayCount(item.eventStartDate, item.eventEndDate)} days</p>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 font-medium sm:table-cell">{formatCurrency(item.estimatedBudget, item.budgetCurrency)}</td>
                  <td className="px-4 py-3.5">
                    <Badge className={`${STATUS_COLORS[item.status] ?? STATUS_COLORS.draft} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize`}>{item.priority}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" title="View details" onClick={() => setDetailItem(item)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" title="Duplicate request" onClick={() => handleDuplicate(item)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {["draft", "submitted", "revision_requested"].includes(item.status) && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" title="Edit request" onClick={() => startEdit(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {["draft", "submitted"].includes(item.status) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive" title="Delete request" onClick={() => handleDelete(item._id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
        </div>
      )}
        </div>
      </section>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      <Dialog open={Boolean(detailItem)} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          {detailItem && (
            <>
              <DialogHeader className="border-b bg-gradient-to-r from-primary/8 via-background to-emerald-50/60 px-6 pb-5 pr-12 pt-6 dark:to-emerald-950/10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-2xl font-semibold tracking-tight">{detailItem.eventName}</DialogTitle>
                      <Badge className={STATUS_COLORS[detailItem.status]}>{STATUS_LABELS[detailItem.status]}</Badge>
                      <Badge className={PRIORITY_COLORS[detailItem.priority] ?? PRIORITY_COLORS.medium}>{detailItem.priority}</Badge>
                    </div>
                    <DialogDescription className="text-sm">
                      {labelFor(EVENT_CATEGORIES, detailItem.eventCategory)} in {detailItem.eventLocation}{detailItem.country ? `, ${detailItem.country}` : ""}
                    </DialogDescription>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[20rem]">
                    <div className="rounded-xl border bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
                      <p className="mt-1 font-semibold">{formatCurrency(detailItem.estimatedBudget, detailItem.budgetCurrency)}</p>
                    </div>
                    <div className="rounded-xl border bg-background/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Expected Leads</p>
                      <p className="mt-1 font-semibold">{detailItem.expectedLeads ?? "-"}</p>
                    </div>
                  </div>
                </div>
              </DialogHeader>
              <div className="max-h-[68vh] space-y-6 overflow-y-auto px-6 py-5 text-sm">
                {detailItem.status === "revision_requested" && detailItem.reviewNote && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/20">
                    <p className="mb-1 flex items-center gap-1 font-medium text-orange-800 dark:text-orange-400">
                      <AlertTriangle className="h-4 w-4" /> Revision Requested
                    </p>
                    <p className="text-orange-700 dark:text-orange-300">{detailItem.reviewNote}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Venue", value: detailItem.venue ?? "-" },
                    { label: "Country", value: detailItem.country ?? "-" },
                    { label: "Dates", value: detailItem.eventEndDate ? `${formatDate(detailItem.eventStartDate)} – ${formatDate(detailItem.eventEndDate)}` : formatDate(detailItem.eventStartDate) },
                    { label: "Duration", value: detailItem.eventEndDate ? `${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)} days` : "—" },
                    { label: "Organizer", value: detailItem.organizerName ?? "-" },
                    { label: "Contact", value: detailItem.organizerContact ?? "-" },
                    { label: "Category", value: labelFor(EVENT_CATEGORIES, detailItem.eventCategory) },
                    { label: "Status", value: STATUS_LABELS[detailItem.status] ?? detailItem.status },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border bg-card p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <p className="mt-2 font-medium text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
                {detailItem.participationTypes.length > 0 && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Participation</p>
                    <div className="flex flex-wrap gap-1">
                      {detailItem.participationTypes.map((participationType) => (
                        <Badge key={participationType} variant="outline" className="capitalize">
                          {labelFor(PARTICIPATION_TYPES, participationType)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detailItem.objectives.length > 0 && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Objectives</p>
                    <div className="flex flex-wrap gap-1">
                      {detailItem.objectives.map((objective) => (
                        <Badge key={objective} variant="outline">{labelFor(OBJECTIVES, objective)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detailItem.requiredResources.length > 0 && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Requirement Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {detailItem.requiredResources.map((resource) => (
                        <Badge key={resource} variant="outline">{labelFor(RESOURCE_TYPES, resource)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detailItem.budgetBreakdown && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Legacy Budget Breakdown</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {Object.entries(detailItem.budgetBreakdown).map(([key, value]) => (
                        <div key={key} className="rounded border p-2 text-center">
                          <p className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p>
                          <p className="font-semibold">{formatCurrency(value as number, detailItem.budgetCurrency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailItem.approvedBudget != null && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Approved Budget</p>
                    <p className="mt-2 text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(detailItem.approvedBudget, detailItem.budgetCurrency)}</p>
                    {detailItem.approvedBudget !== detailItem.estimatedBudget && (
                      <p className="mt-1 text-xs text-muted-foreground">Estimated was {formatCurrency(detailItem.estimatedBudget, detailItem.budgetCurrency)}</p>
                    )}
                  </div>
                )}
                {detailItem.description && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Description</p>
                    <p className="mt-2 leading-6">{detailItem.description}</p>
                  </div>
                )}
                {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Approval History</p>
                    <ApprovalTimeline entries={detailItem.statusHistory} />
                  </div>
                )}
              </div>
              <DialogFooter className="border-t px-6 py-4">
                {["draft", "submitted", "revision_requested"].includes(detailItem.status) && (
                  <Button variant="outline" onClick={() => {
                    setDetailItem(null);
                    startEdit(detailItem);
                  }}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showWizard}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            setShowWizard(false);
          }
        }}
      >
        <DialogContent
          ref={setDialogRef}
          className="w-[min(96vw,36rem)] max-w-xl p-0"
        >
          <DialogHeader className="border-b px-6 pb-4 pt-5">
            <DialogTitle className="text-lg">{isEditing ? "Edit Exhibition Request" : "New Exhibition Request"}</DialogTitle>
            <DialogDescription>
              Fill in the details below to submit your request for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div>
              <Label>Exhibition Title *</Label>
              <Input
                value={form.eventName}
                onChange={(event) => updateForm("eventName", event.target.value)}
                placeholder="e.g., Dubai Career Expo 2026"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                placeholder="Brief description of the exhibition and its purpose..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start Date</Label>
                <DateTimePicker
                  value={form.eventStartDate}
                  onChange={(value) => {
                    updateForm("eventStartDate", value);
                    // Clear end date if it's now before start
                    if (form.eventEndDate && new Date(form.eventEndDate) < new Date(value)) {
                      updateForm("eventEndDate", "");
                    }
                  }}
                  mode="date"
                  placeholder="Select start date"
                  minDate={startDateMin}
                  container={dialogContainer}
                  modal
                />
              </div>
              <div>
                <Label>End Date</Label>
                <DateTimePicker
                  value={form.eventEndDate}
                  onChange={(value) => updateForm("eventEndDate", value)}
                  mode="date"
                  placeholder="Select end date"
                  minDate={endDateMin}
                  container={dialogContainer}
                  modal
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Venue <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={form.venue}
                  onChange={(event) => updateForm("venue", event.target.value)}
                  placeholder="e.g., Dubai World Trade Centre"
                />
              </div>
              <div>
                <Label>Organizer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={form.organizerName}
                  onChange={(event) => updateForm("organizerName", event.target.value)}
                  placeholder="e.g., DWTC Events"
                />
              </div>
              <div>
                <Label>Contact <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={form.organizerContact}
                  onChange={(event) => updateForm("organizerContact", event.target.value)}
                  placeholder="Email or phone"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Estimated Budget</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className={SPINNERLESS_INPUT_CLASS}
                  value={form.estimatedBudget}
                  onChange={(event) => handleBudgetChange(event.target.value)}
                  placeholder="e.g., 5000"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <SearchableSelect
                  options={CURRENCY_OPTIONS}
                  value={form.budgetCurrency}
                  onValueChange={handleCurrencyChange}
                  placeholder="Select currency"
                  container={dialogContainer}
                  modal
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={() => handleSubmit(true)}>
              <Save className="mr-1 h-4 w-4" /> Save Draft
            </Button>
            <Button onClick={() => handleSubmit(false)}>
              <Send className="mr-1 h-4 w-4" /> Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
