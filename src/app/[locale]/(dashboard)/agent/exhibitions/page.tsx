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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  Eye,
  Inbox,
  MapPin,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/hooks/useConfirm";
import { useCountrySearch } from "@/hooks/useCountrySearch";
import { SUPPORTED_CURRENCIES, formatCurrency } from "@/lib/currency";
import {
  AGENT_EXHIBITION_TEMPLATES,
  EMPTY_AGENT_EXHIBITION_FORM,
  applyExhibitionTemplate,
  createDuplicatedExhibitionForm,
  getCountryCurrencyCode,
  hasManualCurrencyOverride,
  resolveCountryCode,
  type AgentExhibitionFormState,
} from "@/lib/exhibitions/agent-request";
import { csrfFetch } from "@/lib/security/csrf-client";

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
  approved: "Approved",
  revision_requested: "Revision Requested",
  budget_approved: "Budget Approved",
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

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "revision_requested", label: "Revision Requested" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const WIZARD_STEPS = [
  { id: 1, title: "Event Basics", description: "Template, location, schedule, and currency" },
  { id: 2, title: "Request Details", description: "Participation, notes, budget, and tags" },
  { id: 3, title: "Review & Submit", description: "Confirm the request before sending" },
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

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState<AgentExhibitionFormState>({ ...EMPTY_AGENT_EXHIBITION_FORM });
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [currencyOverridden, setCurrencyOverridden] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const wizardDialogContentRef = useRef<HTMLDivElement | null>(null);
  const [wizardDialogContainer, setWizardDialogContainer] = useState<HTMLDivElement | null>(null);

  const { data: countries = [], isLoading: countriesLoading } = useCountrySearch(countrySearch, { loadAll: true });

  const countryDirectory = useMemo(() => {
    const map = new Map<string, { name: string; code: string; currencyCode: string }>();

    for (const country of countries) {
      map.set(country.code, {
        name: country.name,
        code: country.code,
        currencyCode: country.currencyCode,
      });
    }

    if (form.country) {
      const resolvedCode = form.countryCode || resolveCountryCode(form.country);
      if (resolvedCode && !map.has(resolvedCode)) {
        map.set(resolvedCode, {
          name: form.country,
          code: resolvedCode,
          currencyCode: getCountryCurrencyCode(form.country, resolvedCode),
        });
      }
    }

    return map;
  }, [countries, form.country, form.countryCode]);

  const countryOptions = useMemo(() => Array.from(countryDirectory.values()).map((country) => ({
    value: country.code,
    label: `${country.name} (${country.currencyCode})`,
  })), [countryDirectory]);

  const autoCurrency = useMemo(() => {
    if (form.countryCode) {
      const matchedCountry = countryDirectory.get(form.countryCode);
      if (matchedCountry?.currencyCode) {
        return matchedCountry.currencyCode;
      }
    }

    return getCountryCurrencyCode(form.country, form.countryCode);
  }, [countryDirectory, form.country, form.countryCode]);

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_AGENT_EXHIBITION_FORM });
    setEditingId(null);
    setWizardStep(1);
    setCountrySearch("");
    setCurrencyOverridden(false);
    setSelectedTemplateId(null);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (search) {
        params.set("search", search);
      }
      const response = await fetch(`/api/exhibitions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items ?? []);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!form.country || currencyOverridden || !autoCurrency || form.budgetCurrency === autoCurrency) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      budgetCurrency: autoCurrency,
    }));
  }, [autoCurrency, currencyOverridden, form.budgetCurrency, form.country]);

  const updateForm = useCallback(<Key extends keyof AgentExhibitionFormState>(field: Key, value: AgentExhibitionFormState[Key]) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }, []);

  const toggleArray = useCallback((values: string[], nextValue: string) => (
    values.includes(nextValue)
      ? values.filter((value) => value !== nextValue)
      : [...values, nextValue]
  ), []);

  const openNewRequest = () => {
    resetForm();
    setShowWizard(true);
  };

  const applyTemplate = async (templateId: string) => {
    const template = AGENT_EXHIBITION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    if (
      form.participationTypes.length > 0 || form.objectives.length > 0 || form.requiredResources.length > 0
    ) {
      const shouldApplyTemplate = await confirm({
        title: "Apply template",
        message: "Applying a template will replace your current participation, objective, and requirement selections in request details (step 2).",
        confirmLabel: "Apply template",
        variant: "default",
      });

      if (!shouldApplyTemplate) {
        return;
      }
    }

    setForm((currentForm) => applyExhibitionTemplate(currentForm, template));
    setSelectedTemplateId(template.id);
    toast.success(`${template.name} template applied. The preset selections are shown below and in step 2.`);
  };

  const handleCountryChange = (countryCode: string) => {
    const nextCountry = countryDirectory.get(countryCode);
    if (!nextCountry) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      country: nextCountry.name,
      countryCode: nextCountry.code,
      budgetCurrency: currencyOverridden ? currentForm.budgetCurrency : nextCountry.currencyCode,
    }));
    setCountrySearch("");
  };

  const handleCurrencyChange = (budgetCurrency: string) => {
    setCurrencyOverridden(true);
    updateForm("budgetCurrency", budgetCurrency);
  };

  const handleBudgetChange = (value: string) => {
    const sanitized = value.replace(/[^\d.]/g, "");
    const [wholePart = "", ...decimalParts] = sanitized.split(".");
    const normalizedValue = decimalParts.length > 0 ? `${wholePart}.${decimalParts.join("")}` : wholePart;
    updateForm("estimatedBudget", normalizedValue);
  };

  const handleExpectedLeadsChange = (value: string) => {
    updateForm("expectedLeads", value.replace(/\D/g, ""));
  };

  const resetCurrencyToCountryDefault = () => {
    setCurrencyOverridden(false);
    updateForm("budgetCurrency", autoCurrency);
  };

  const validateStepOne = () => {
    if (!form.eventName.trim() || !form.eventCategory || !form.country || !form.eventLocation.trim() || !form.eventStartDate || !form.eventEndDate) {
      toast.error("Fill in the event basics before continuing.");
      return false;
    }

    if (new Date(form.eventEndDate) < new Date(form.eventStartDate)) {
      toast.error("End date cannot be earlier than start date.");
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    if (form.participationTypes.length === 0) {
      toast.error("Select at least one participation type before continuing.");
      return false;
    }

    return true;
  };

  const goToStep = (targetStep: number) => {
    if (targetStep > 1 && !validateStepOne()) {
      return;
    }

    if (targetStep > 2 && !validateStepTwo()) {
      return;
    }

    setWizardStep(targetStep);
  };

  const handleNextStep = () => {
    if (wizardStep === 1 && !validateStepOne()) {
      return;
    }

    if (wizardStep === 2 && !validateStepTwo()) {
      return;
    }

    setWizardStep((currentStep) => Math.min(currentStep + 1, WIZARD_STEPS.length));
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!validateStepOne()) {
      setWizardStep(1);
      return;
    }

    if (!asDraft && form.participationTypes.length === 0) {
      toast.error("Choose at least one participation type before submitting.");
      setWizardStep(2);
      return;
    }

    try {
      const parsedBudget = form.estimatedBudget ? Number(form.estimatedBudget) : 0;
      const parsedExpectedLeads = form.expectedLeads ? Number(form.expectedLeads) : undefined;
      const payload = {
        eventName: form.eventName.trim(),
        eventCategory: form.eventCategory,
        eventLocation: form.eventLocation.trim(),
        venue: form.venue.trim() || undefined,
        country: form.country.trim() || undefined,
        eventStartDate: form.eventStartDate,
        eventEndDate: form.eventEndDate,
        organizerName: form.organizerName.trim() || undefined,
        organizerContact: form.organizerContact.trim() || undefined,
        participationTypes: form.participationTypes,
        participationDetails: form.participationDetails.trim() || undefined,
        objectives: form.objectives,
        estimatedBudget: Number.isFinite(parsedBudget) ? parsedBudget : 0,
        budgetCurrency: form.budgetCurrency,
        description: form.description.trim() || undefined,
        expectedLeads: parsedExpectedLeads !== undefined && Number.isFinite(parsedExpectedLeads) ? parsedExpectedLeads : undefined,
        requiredResources: form.requiredResources,
        priority: form.priority,
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
    const countryCode = resolveCountryCode(item.country);
    const nextForm: AgentExhibitionFormState = {
      ...EMPTY_AGENT_EXHIBITION_FORM,
      eventName: item.eventName,
      eventCategory: item.eventCategory ?? EMPTY_AGENT_EXHIBITION_FORM.eventCategory,
      eventLocation: item.eventLocation ?? "",
      venue: item.venue ?? "",
      country: item.country ?? "",
      countryCode,
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
    };

    setForm(nextForm);
    setEditingId(item._id);
    setWizardStep(1);
    setCurrencyOverridden(hasManualCurrencyOverride(nextForm.country, nextForm.budgetCurrency, nextForm.countryCode));
    setSelectedTemplateId(null);
    setShowWizard(true);
  };

  const handleDuplicate = (item: ExhibitionRequest) => {
    const duplicatedForm = createDuplicatedExhibitionForm(item);
    setForm(duplicatedForm);
    setEditingId(null);
    setWizardStep(1);
    setCurrencyOverridden(hasManualCurrencyOverride(duplicatedForm.country, duplicatedForm.budgetCurrency, duplicatedForm.countryCode));
    setSelectedTemplateId(null);
    setShowWizard(true);
    toast.success("Request copied. Update the dates and submit when ready.");
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
  const selectedTemplate = AGENT_EXHIBITION_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? null;
  const isEditing = editingId !== null;
  const setWizardDialogRef = useCallback((node: HTMLDivElement | null) => {
    wizardDialogContentRef.current = node;
    setWizardDialogContainer(node);
  }, []);
  const wizardSelectProps = {
    container: wizardDialogContainer,
    modal: true,
  };
  const wizardControlsReady = wizardDialogContainer !== null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {ConfirmDialogNode}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" /> {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openNewRequest} size="lg">
          <Plus className="mr-2 h-4 w-4" /> {t("newRequest")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder={t("filterStatus")}
        />
      </div>

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Total", value: items.length, color: "text-gray-700 dark:text-gray-300" },
            { label: "Submitted", value: items.filter((item) => item.status === "submitted").length, color: "text-blue-600" },
            { label: "Approved", value: items.filter((item) => ["approved", "budget_approved", "resources_assigned", "active"].includes(item.status)).length, color: "text-emerald-600" },
            { label: "Active", value: items.filter((item) => item.status === "active").length, color: "text-purple-600" },
            { label: "Completed", value: items.filter((item) => item.status === "completed").length, color: "text-green-600" },
            { label: "Revision", value: items.filter((item) => item.status === "revision_requested").length, color: "text-orange-600" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-card p-3 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Clock className="mr-2 h-5 w-5 animate-spin" /> {tc("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="mb-3 h-12 w-12 opacity-40" />
          <p>{t("noRequests")}</p>
          <Button variant="outline" className="mt-4" onClick={openNewRequest}>
            <Plus className="mr-2 h-4 w-4" /> Create your first request
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Event</th>
                <th className="hidden p-3 text-left font-medium md:table-cell">Category</th>
                <th className="hidden p-3 text-left font-medium lg:table-cell">Location</th>
                <th className="p-3 text-left font-medium">Dates</th>
                <th className="hidden p-3 text-left font-medium sm:table-cell">Budget</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="hidden p-3 text-left font-medium md:table-cell">Priority</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="p-3">
                    <button onClick={() => setDetailItem(item)} className="text-left font-medium text-primary hover:underline">
                      {item.eventName}
                    </button>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    <Badge variant="outline" className="text-xs capitalize">
                      {labelFor(EVENT_CATEGORIES, item.eventCategory)}
                    </Badge>
                  </td>
                  <td className="hidden p-3 lg:table-cell">
                    <span className="flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3" /> {item.eventLocation}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs">
                    {formatDate(item.eventStartDate)} - {formatDate(item.eventEndDate)}
                    <br />
                    <span className="text-muted-foreground">{dayCount(item.eventStartDate, item.eventEndDate)} days</span>
                  </td>
                  <td className="hidden whitespace-nowrap p-3 sm:table-cell">{formatCurrency(item.estimatedBudget, item.budgetCurrency)}</td>
                  <td className="p-3">
                    <Badge className={STATUS_COLORS[item.status] ?? STATUS_COLORS.draft}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    <Badge className={PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium}>{item.priority}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicate(item)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {["draft", "submitted", "revision_requested"].includes(item.status) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {["draft", "submitted"].includes(item.status) && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item._id)}>
                              <Trash2 className="h-3.5 w-3.5" />
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
      )}

      <Dialog open={Boolean(detailItem)} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          {detailItem && (
            <>
              <DialogHeader className="border-b bg-gradient-to-r from-primary/8 via-background to-emerald-50/60 px-6 pb-5 pt-6 dark:to-emerald-950/10">
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
                  <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[22rem]">
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
                    { label: "Dates", value: `${formatDate(detailItem.eventStartDate)} - ${formatDate(detailItem.eventEndDate)}` },
                    { label: "Duration", value: `${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)} days` },
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
                {detailItem.description && (
                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Description</p>
                    <p className="mt-2 leading-6">{detailItem.description}</p>
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
          ref={setWizardDialogRef}
          className="flex max-h-[calc(100dvh-2rem)] w-[min(96vw,72rem)] max-w-6xl flex-col overflow-hidden p-0"
        >
          <div className="shrink-0 border-b bg-background px-5 pb-3 pt-4">
            <DialogHeader>
              <DialogTitle className="text-lg">{isEditing ? "Edit Exhibition Request" : "New Exhibition Request"}</DialogTitle>
              <DialogDescription>
                Step {wizardStep} of {WIZARD_STEPS.length} - {WIZARD_STEPS[wizardStep - 1].description}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {WIZARD_STEPS.map((step) => {
                const isCurrent = step.id === wizardStep;
                const isPast = step.id < wizardStep;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${isCurrent ? "border-primary bg-primary/10 text-primary" : isPast ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-400" : "border-border/60 bg-card text-foreground hover:bg-muted/60"}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {isPast ? <CheckCircle2 className="h-4 w-4" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs">{step.id}</span>}
                      {step.title}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{step.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {wizardControlsReady && (
            <div className="space-y-4 px-5 py-4">
            {wizardStep === 1 && (
              <div className="space-y-4">
                {!isEditing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Quick start templates</h3>
                      <p className="text-xs text-muted-foreground">Prefills participation, objectives, and requirement tags.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {AGENT_EXHIBITION_TEMPLATES.map((template) => {
                        const isSelected = selectedTemplateId === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyTemplate(template.id)}
                            className={`rounded-xl border p-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{template.name}</p>
                              {isSelected && <Badge className="bg-primary/10 text-primary">Applied</Badge>}
                            </div>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{template.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    {selectedTemplate && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">{selectedTemplate.name} is applied</p>
                            <p className="mt-1 text-muted-foreground">
                              Most preset values affect request details in step 2. You will also see the full summary again in step 3.
                            </p>
                          </div>
                          <Badge className="w-fit bg-primary/10 text-primary">Ready</Badge>
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Basics updated now</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline">{labelFor(EVENT_CATEGORIES, form.eventCategory)}</Badge>
                              <Badge className={PRIORITY_COLORS[form.priority] ?? PRIORITY_COLORS.medium}>{form.priority}</Badge>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step 2 participation</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {form.participationTypes.length > 0 ? form.participationTypes.map((participationType) => (
                                <Badge key={participationType} variant="outline" className="text-xs capitalize">
                                  {labelFor(PARTICIPATION_TYPES, participationType)}
                                </Badge>
                              )) : <span className="text-xs text-muted-foreground">No preset participation</span>}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step 2 goals and tags</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {form.objectives.map((objective) => (
                                <Badge key={objective} variant="outline" className="text-xs">
                                  {labelFor(OBJECTIVES, objective)}
                                </Badge>
                              ))}
                              {form.requiredResources.map((resource) => (
                                <Badge key={resource} variant="outline" className="text-xs">
                                  {labelFor(RESOURCE_TYPES, resource)}
                                </Badge>
                              ))}
                              {form.objectives.length === 0 && form.requiredResources.length === 0 && (
                                <span className="text-xs text-muted-foreground">No preset objectives or tags</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="lg:col-span-3">
                    <Label>Exhibition Title *</Label>
                    <Input
                      value={form.eventName}
                      onChange={(event) => updateForm("eventName", event.target.value)}
                      placeholder="e.g., Dubai Career Expo 2026"
                    />
                  </div>
                  <div>
                    <Label>Event Category *</Label>
                    <SearchableSelect
                      options={EVENT_CATEGORIES}
                      value={form.eventCategory}
                      onValueChange={(value) => updateForm("eventCategory", value)}
                      placeholder="Select category"
                      {...wizardSelectProps}
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <SearchableSelect
                      options={PRIORITIES}
                      value={form.priority}
                      onValueChange={(value) => updateForm("priority", value)}
                      placeholder="Select priority"
                      {...wizardSelectProps}
                    />
                  </div>
                  <div>
                    <Label>Country *</Label>
                    <SearchableSelect
                      options={countryOptions}
                      value={form.countryCode || undefined}
                      onValueChange={handleCountryChange}
                      searchValue={countrySearch}
                      onSearchValueChange={setCountrySearch}
                      placeholder="Select country"
                      searchPlaceholder="Search country..."
                      loading={countriesLoading}
                      loadingMessage="Loading countries..."
                      {...wizardSelectProps}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label>Budget Currency *</Label>
                      {currencyOverridden && (
                        <button type="button" onClick={resetCurrencyToCountryDefault} className="text-xs font-medium text-primary hover:underline">
                          Reset to {autoCurrency}
                        </button>
                      )}
                    </div>
                    <SearchableSelect
                      options={CURRENCY_OPTIONS}
                      value={form.budgetCurrency}
                      onValueChange={handleCurrencyChange}
                      placeholder="Select currency"
                      {...wizardSelectProps}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currencyOverridden ? "Manual override active." : `Auto-selected from ${form.country || "the chosen country"}.`}
                    </p>
                  </div>
                  <div>
                    <Label>Region / City *</Label>
                    <Input
                      value={form.eventLocation}
                      onChange={(event) => updateForm("eventLocation", event.target.value)}
                      placeholder="Dubai, Riyadh, Bangalore..."
                    />
                  </div>
                  <div>
                    <Label>Venue</Label>
                    <Input
                      value={form.venue}
                      onChange={(event) => updateForm("venue", event.target.value)}
                      placeholder="Convention center, hotel, campus..."
                    />
                  </div>
                  <div>
                    <Label>Start Date *</Label>
                    <DateTimePicker
                      value={form.eventStartDate}
                      onChange={(value) => updateForm("eventStartDate", value)}
                      mode="date"
                      placeholder="Select start date"
                      container={wizardDialogContainer}
                      modal
                    />
                  </div>
                  <div>
                    <Label>End Date *</Label>
                    <DateTimePicker
                      value={form.eventEndDate}
                      onChange={(value) => updateForm("eventEndDate", value)}
                      mode="date"
                      placeholder="Select end date"
                      container={wizardDialogContainer}
                      modal
                    />
                  </div>
                  <div>
                    <Label>Organizer Name</Label>
                    <Input
                      value={form.organizerName}
                      onChange={(event) => updateForm("organizerName", event.target.value)}
                      placeholder="Organizer or company"
                    />
                  </div>
                  <div>
                    <Label>Organizer Contact</Label>
                    <Input
                      value={form.organizerContact}
                      onChange={(event) => updateForm("organizerContact", event.target.value)}
                      placeholder="Phone or email"
                    />
                  </div>
                </div>

                {form.eventStartDate && form.eventEndDate && (
                  <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">Schedule summary</p>
                        <p className="text-muted-foreground">{dayCount(form.eventStartDate, form.eventEndDate)} day event in {form.country || "your selected country"}.</p>
                      </div>
                      <Badge variant="outline">Currency: {form.budgetCurrency}</Badge>
                    </div>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-6">
                {selectedTemplate && (
                  <div className="rounded-xl border bg-primary/5 p-4 text-sm">
                    <p className="font-medium">Template: {selectedTemplate.name}</p>
                    <p className="mt-1 text-muted-foreground">You can adjust any of the suggested participation, objectives, or requirement tags below.</p>
                  </div>
                )}

                <div className="space-y-3">
                  <Label>Select Participation Types *</Label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {PARTICIPATION_TYPES.map((participationType) => {
                      const selected = form.participationTypes.includes(participationType.value);
                      return (
                        <button
                          key={participationType.value}
                          type="button"
                          onClick={() => updateForm("participationTypes", toggleArray(form.participationTypes, participationType.value))}
                          className={`rounded-xl border p-3 text-sm text-center transition-colors ${selected ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted/50"}`}
                        >
                          {participationType.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Estimated Budget ({form.budgetCurrency})</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className={SPINNERLESS_INPUT_CLASS}
                      value={form.estimatedBudget}
                      onChange={(event) => handleBudgetChange(event.target.value)}
                      placeholder="Optional budget"
                    />
                  </div>
                  <div>
                    <Label>Expected Leads</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      className={SPINNERLESS_INPUT_CLASS}
                      value={form.expectedLeads}
                      onChange={(event) => handleExpectedLeadsChange(event.target.value)}
                      placeholder="e.g., 120"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description / Notes</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) => updateForm("description", event.target.value)}
                      placeholder="What makes this exhibition worth attending? Add optional notes for the reviewer."
                      rows={4}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Participation Notes</Label>
                    <Textarea
                      value={form.participationDetails}
                      onChange={(event) => updateForm("participationDetails", event.target.value)}
                      placeholder="Any setup details, sponsorship notes, or booth expectations."
                      rows={3}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Business Objectives</Label>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {OBJECTIVES.map((objective) => {
                      const selected = form.objectives.includes(objective.value);
                      return (
                        <button
                          key={objective.value}
                          type="button"
                          onClick={() => updateForm("objectives", toggleArray(form.objectives, objective.value))}
                          className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
                        >
                          <span className={`font-medium ${selected ? "text-primary" : ""}`}>{objective.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Requirement Tags</Label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {RESOURCE_TYPES.map((resource) => {
                      const selected = form.requiredResources.includes(resource.value);
                      return (
                        <button
                          key={resource.value}
                          type="button"
                          onClick={() => updateForm("requiredResources", toggleArray(form.requiredResources, resource.value))}
                          className={`rounded-xl border p-3 text-sm text-center transition-colors ${selected ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted/50"}`}
                        >
                          {resource.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl border p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{form.eventName || "Untitled exhibition request"}</h3>
                      <p className="text-sm text-muted-foreground">{labelFor(EVENT_CATEGORIES, form.eventCategory)} in {form.eventLocation || "selected region"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{form.country || "No country selected"}</Badge>
                      <Badge className={PRIORITY_COLORS[form.priority] ?? PRIORITY_COLORS.medium}>{form.priority}</Badge>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                    <div><span className="text-muted-foreground">Venue:</span> {form.venue || "-"}</div>
                    <div><span className="text-muted-foreground">Dates:</span> {form.eventStartDate || "-"} - {form.eventEndDate || "-"}</div>
                    <div><span className="text-muted-foreground">Organizer:</span> {form.organizerName || "-"}</div>
                    <div><span className="text-muted-foreground">Contact:</span> {form.organizerContact || "-"}</div>
                    <div><span className="text-muted-foreground">Budget:</span> {formatCurrency(form.estimatedBudget || 0, form.budgetCurrency)}</div>
                    <div><span className="text-muted-foreground">Expected Leads:</span> {form.expectedLeads || "-"}</div>
                  </div>

                  {form.participationTypes.length > 0 && (
                    <div className="mt-5">
                      <p className="text-sm text-muted-foreground">Participation</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {form.participationTypes.map((participationType) => (
                          <Badge key={participationType} variant="outline" className="text-xs capitalize">
                            {labelFor(PARTICIPATION_TYPES, participationType)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.objectives.length > 0 && (
                    <div className="mt-5">
                      <p className="text-sm text-muted-foreground">Objectives</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {form.objectives.map((objective) => (
                          <Badge key={objective} variant="outline" className="text-xs">
                            {labelFor(OBJECTIVES, objective)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.requiredResources.length > 0 && (
                    <div className="mt-5">
                      <p className="text-sm text-muted-foreground">Requirement Tags</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {form.requiredResources.map((resource) => (
                          <Badge key={resource} variant="outline" className="text-xs">
                            {labelFor(RESOURCE_TYPES, resource)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.description && (
                    <div className="mt-5 text-sm">
                      <p className="text-muted-foreground">Description</p>
                      <p className="mt-1">{form.description}</p>
                    </div>
                  )}

                  {form.participationDetails && (
                    <div className="mt-5 text-sm">
                      <p className="text-muted-foreground">Participation Notes</p>
                      <p className="mt-1">{form.participationDetails}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Draft saves the request without notifying reviewers. Submit sends it into the approval queue.
                </div>
              </div>
            )}
            </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t bg-background px-6 py-4">
            <div>
              {wizardStep > 1 && (
                <Button variant="outline" onClick={() => setWizardStep((currentStep) => currentStep - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {wizardStep === WIZARD_STEPS.length ? (
                <>
                  <Button variant="outline" onClick={() => handleSubmit(true)}>
                    <Save className="mr-1 h-4 w-4" /> Save Draft
                  </Button>
                  <Button onClick={() => handleSubmit(false)}>
                    <Send className="mr-1 h-4 w-4" /> Submit Request
                  </Button>
                </>
              ) : (
                <Button onClick={handleNextStep}>
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}