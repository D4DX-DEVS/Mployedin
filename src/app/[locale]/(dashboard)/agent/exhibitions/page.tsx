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
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  Copy,
  Eye,
  Inbox,
  MapPin,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useConfirm } from "@/hooks/useConfirm";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { SUPPORTED_CURRENCIES, formatCurrency } from "@/lib/currency";
import {
  EMPTY_AGENT_EXHIBITION_FORM,
  createDuplicatedExhibitionForm,
  resolveCountryCode,
  type AgentExhibitionFormState,
} from "@/lib/exhibitions/agent-request";
import { SupportItemsFormSection, supportItemsFormError, supportItemsPayload } from "@/components/features/exhibitions/SupportItemsFormSection";
import type { SupportItemType } from "@/lib/exhibitions/supportItems";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { TimelineEntry } from "@/components/features/exhibitions/ApprovalTimeline";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { AgentExhibitionDetailDialog } from "./_components/AgentExhibitionDetailDialog";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { formatListDate } from "@/lib/ui/intlFormat";
import { PriorityFormField } from "@/components/features/exhibitions/PriorityFields";
import { AttachmentList, PendingFilesField } from "@/components/features/exhibitions/ExhibitionAttachments";
import { CompleteEventDialog } from "@/components/features/exhibitions/CompleteEventDialog";
import { canReportEvent } from "@/lib/exhibitions/transitions";
import {
  removeExhibitionFile,
  uploadExhibitionFiles,
  type ExhibitionAttachmentView,
} from "@/components/features/exhibitions/attachmentsClient";

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
  supportItems?: { item: SupportItemType; label?: string; requestedQty: number; allocatedQty?: number; deliveryStatus?: string }[];
  additionalRequirements?: string;
  priority: string;
  status: string;
  reviewNote?: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  statusHistory?: TimelineEntry[];
  attachments?: ExhibitionAttachmentView[];
  completionReport?: { actualLeads?: number; summary?: string; completedAt?: string; completedBy?: { name?: string } | string | null } | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  revision_requested: "bg-orange-100 text-orange-800",
  budget_approved: "bg-teal-100 text-teal-800",
  resources_assigned: "bg-indigo-100 text-indigo-800",
  active: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  archived: "bg-slate-100 text-slate-600",
};

// Labels come from the `exhibitions` namespace, the same keys the super agent
// and admin screens read (client check 2026-10-30: English-only here, and
// "Financially Approved" where the admin read "Payment approved").
const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "statusDraft",
  submitted: "statusSubmitted",
  under_review: "statusUnderReview",
  approved: "statusApproved",
  revision_requested: "statusRevisionRequested",
  budget_approved: "statusBudgetApproved",
  resources_assigned: "statusResourcesAssigned",
  active: "statusActive",
  completed: "statusCompleted",
  rejected: "statusRejected",
  archived: "statusArchived",
};

/** A billing country stored as a code ("IN") reads as its name ("India"). */
function countryName(value: string): string {
  if (!/^[A-Za-z]{2}$/.test(value)) return value;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(value.toUpperCase()) ?? value;
  } catch {
    return value;
  }
}

/** City and country; "TBD" is the stored "no city yet", not a place. */
function placeText(item: { eventLocation?: string; country?: string }): string {
  const city = item.eventLocation?.trim();
  return [city && city.toUpperCase() !== "TBD" ? city : "", item.country ? countryName(item.country.trim()) : ""]
    .filter(Boolean).join(", ");
}

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  critical: "priorityCritical",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PARTICIPATION_KEYS = [
  ["standee", "participationStandee"],
  ["stall", "participationStall"],
  ["booth", "participationBooth"],
  ["sponsorship", "participationSponsorship"],
  ["flyers", "participationFlyers"],
  ["recruitment_desk", "participationRecruitmentDesk"],
  ["branding_package", "participationBrandingPackage"],
  ["other", "participationOther"],
] as const;

const OBJECTIVE_KEYS = [
  ["employer_acquisition", "objectiveEmployerAcquisition"],
  ["candidate_sourcing", "objectiveCandidateSourcing"],
  ["brand_awareness", "objectiveBrandAwareness"],
  ["lead_generation", "objectiveLeadGeneration"],
  ["direct_hiring", "objectiveDirectHiring"],
  ["market_expansion", "objectiveMarketExpansion"],
] as const;

const RESOURCE_KEYS = [
  ["brochures", "resourceBrochures"],
  ["standee", "resourceStandee"],
  ["flyers", "resourceFlyers"],
  ["presentation_deck", "resourcePresentationDeck"],
  ["employer_catalog", "resourceEmployerCatalog"],
  ["candidate_forms", "resourceCandidateForms"],
  ["branding_banners", "resourceBrandingBanners"],
  ["video_assets", "resourceVideoAssets"],
  ["business_cards", "resourceBusinessCards"],
  ["booth_design", "resourceBoothDesign"],
] as const;

// Filter options: values here, labels from the `exhibitions` namespace at render
// (the hard-coded English labels showed in Arabic too).
const STATUS_FILTER_KEYS = [
  ["draft", "statusDraft"],
  ["submitted", "statusSubmitted"],
  ["under_review", "statusUnderReview"],
  ["approved", "statusApproved"],
  ["revision_requested", "statusRevisionRequested"],
  ["completed", "statusCompleted"],
  ["rejected", "statusRejected"],
] as const;

const CATEGORY_FILTER_KEYS = [
  ["career_fair", "categoryCareerFair"],
  ["recruitment_expo", "categoryRecruitmentExpo"],
  ["employer_branding", "categoryEmployerBranding"],
  ["hiring_drive", "categoryHiringDrive"],
  ["university_event", "categoryUniversityEvent"],
  ["gcc_recruitment", "categoryGccRecruitment"],
  ["job_fair", "categoryJobFair"],
  ["other", "categoryOther"],
] as const;

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((currency) => ({
  value: currency.code,
  label: `${currency.code} - ${currency.label}`,
}));

const SPINNERLESS_INPUT_CLASS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export default function AgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const locale = useLocale();
  const tc = useTranslations("common");
  const statusLabel = (status: string) => (STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status);
  const priorityLabel = (priority: string) => (PRIORITY_LABEL_KEYS[priority] ? t(PRIORITY_LABEL_KEYS[priority]) : priority);
  const eventCategories = CATEGORY_FILTER_KEYS.map(([value, key]) => ({ value, label: t(key) }));
  const tf = useTranslations("exhibitionHeroFilters");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useUrlFilter("category", "all");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [showWizard, setShowWizard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Shown in the step dialog's banner; the step is where the problem lives.
  const [formError, setFormError] = useState("");
  const [formErrorStep, setFormErrorStep] = useState<number | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentExhibitionFormState>({ ...EMPTY_AGENT_EXHIBITION_FORM });
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [completeItem, setCompleteItem] = useState<ExhibitionRequest | null>(null);
  // Event files: chosen in the form, uploaded once the request has an id.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<ExhibitionAttachmentView[]>([]);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null);
  const [agentCurrency, setAgentCurrency] = useState<string>("AED");
  const [agentCountry, setAgentCountry] = useState<string>("");
  const [summary, setSummary] = useState<{
    total: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    revisionRequested: number;
  }>({
    total: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
    revisionRequested: 0,
  });

  // Fetch agent's default currency and country on mount
  useEffect(() => {
    fetch("/api/agent/settings/invoice-defaults")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.invoiceDefaults?.defaultCurrency) {
          setAgentCurrency(data.invoiceDefaults.defaultCurrency);
        }
        if (data?.invoiceDefaults?.billingCountry) {
          setAgentCountry(countryName(data.invoiceDefaults.billingCountry));
        }
      })
      .catch(() => { /* silent fallback */ });
  }, []);

  const resetForm = useCallback(() => {
    setForm((prev) => ({ ...EMPTY_AGENT_EXHIBITION_FORM, budgetCurrency: prev.budgetCurrency }));
    setEditingId(null);
    setPendingFiles([]);
    setExistingFiles([]);
    setRemovedFileIds([]);
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
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const response = await fetch(`/api/exhibitions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items ?? []);
        updateTotal(data.total ?? 0);
        if (data.summary) {
          setSummary({
            total: data.summary.total ?? 0,
            pendingReview: data.summary.pendingReview ?? 0,
            approved: data.summary.approved ?? 0,
            rejected: data.summary.rejected ?? 0,
            revisionRequested: data.summary.revisionRequested ?? 0,
          });
        }
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

  // Step 1: a title, and dates that make sense together.
  const validateDetailsStep = (): string | null => {
    if (!form.eventName.trim()) return t("enterExhibitionTitle");
    if (form.eventStartDate) {
      const start = new Date(form.eventStartDate);
      if (start < today) return t("startDateInPast");
      if (form.eventEndDate && new Date(form.eventEndDate) < start) return t("endDateEarlierThanStart");
    }
    return null;
  };

  // Step 2: every ticked support item needs a quantity (and "Other" a name).
  const validateSupportStep = (): string | null => {
    const supportError = supportItemsFormError(form.supportItems);
    return supportError ? t(supportError) : null;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (submitting) return;
    // The step dialog checks both steps before a submit. A draft skips the
    // date rules, but the server still needs a title, and a support line it
    // would refuse has to be fixed first.
    if (asDraft) {
      const titleError = form.eventName.trim() ? null : t("enterExhibitionTitle");
      const supportError = validateSupportStep();
      if (titleError || supportError) {
        setFormErrorStep(titleError ? 0 : 1);
        setFormError((titleError ?? supportError) as string);
        return;
      }
    }
    setFormError("");
    setFormErrorStep(undefined);
    setSubmitting(true);

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
        // The wizard collected this into form state and the detail dialog read
        // it back, but the payload never sent it — so every request created
        // here stored an empty array and the super-agent participation-mix
        // chart had nothing to plot.
        participationTypes: form.participationTypes,
        // The summary always showed "Expected leads", but no step asked for
        // it (client feedback 2026-10-14), so it was empty on every request.
        expectedLeads: form.expectedLeads === "" ? null : Number(form.expectedLeads),
        // Requested support only — allocation is the admin's, later.
        supportItems: supportItemsPayload(form.supportItems),
        additionalRequirements: form.additionalRequirements.trim(),
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
        const error = await response.json().catch(() => ({}));
        setFormError(error.error ?? t("submitError"));
        return;
      }

      // Files go up after the save: a new request has no id before it. A file
      // that fails does not undo the request — the agent is told and can add
      // it from the request's details.
      const saved = await response.json().catch(() => null);
      const savedId: string | undefined = saved?._id ?? editingId ?? undefined;
      if (savedId && (pendingFiles.length > 0 || removedFileIds.length > 0)) {
        const removals = await Promise.all(removedFileIds.map((fileId) => removeExhibitionFile(savedId, fileId)));
        const upload = await uploadExhibitionFiles(savedId, "event", pendingFiles);
        if (!upload.ok || removals.some((r) => !r.ok)) {
          toast.warning(upload.ok ? t("filesRemoveFailedAfterSave") : (upload.error ?? t("filesFailedAfterSave")));
        }
      }

      toast.success(editingId ? t("updated") : asDraft ? t("savedAsDraft") : t("created"));
      resetForm();
      setShowWizard(false);
      fetchItems();
    } catch {
      setFormError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const shouldDelete = await confirm({
      title: t("deleteRequest"),
      message: t("deleteRequestConfirm"),
      confirmLabel: t("deleteRequest"),
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
      eventLocation: item.eventLocation && item.eventLocation.toUpperCase() !== "TBD" ? item.eventLocation : "",
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
      supportItems: (item.supportItems ?? []).map((entry) => ({ item: entry.item, label: entry.label, requestedQty: entry.requestedQty })),
      additionalRequirements: item.additionalRequirements ?? "",
      priority: item.priority ?? EMPTY_AGENT_EXHIBITION_FORM.priority,
    });
    setEditingId(item._id);
    setPendingFiles([]);
    setRemovedFileIds([]);
    setExistingFiles((item.attachments ?? []).filter((a) => a.kind === "event"));
    setShowWizard(true);
  };

  // `?edit=<id>`: the dashboard's "sent back for changes" row opens the
  // request straight into its edit form. The param is then dropped with
  // history.replaceState (router.replace on mount re-runs the page's effects).
  const editParamHandled = useRef(false);
  useEffect(() => {
    if (editParamHandled.current) return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    editParamHandled.current = true;
    fetch(`/api/exhibitions/${encodeURIComponent(editId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ExhibitionRequest | null) => {
        if (data && ["draft", "submitted", "revision_requested"].includes(data.status)) startEdit(data);
        else if (data) setDetailItem(data);
      })
      .catch(() => undefined)
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        window.history.replaceState(null, "", url.toString());
      });
    // Runs once: the deep link is read on arrival only.
  }, []);

  const handleDuplicate = (item: ExhibitionRequest) => {
    const duplicatedForm = createDuplicatedExhibitionForm(item);
    setForm(duplicatedForm);
    setEditingId(null);
    setShowWizard(true);
    toast.success(t("requestCopied"));
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderEvent"), key: "eventName" },
    { header: t("tableHeaderCategory"), key: "eventCategory", formatter: (v) => labelFor(eventCategories, String(v)) },
    { header: t("tableHeaderLocation"), key: "eventLocation", formatter: (_v, row) => placeText(row) || t("notSpecified") },
    { header: t("tableHeaderDates"), key: "eventStartDate", formatter: (_v, row) => {
      const item = row as unknown as ExhibitionRequest;
      return `${formatListDate(item.eventStartDate, locale)}${item.eventEndDate ? ` – ${formatListDate(item.eventEndDate, locale)}` : ""}`;
    }},
    { header: t("tableHeaderBudget"), key: "estimatedBudget", formatter: (_v, row) => {
      const item = row as unknown as ExhibitionRequest;
      return formatCurrency(item.estimatedBudget, item.budgetCurrency);
    }},
    { header: t("tableHeaderStatus"), key: "status", formatter: (v) => statusLabel(String(v)) },
    { header: t("tableHeaderPriority"), key: "priority", formatter: (v) => priorityLabel(String(v)) },
  ];
  const dayCount = (startDate: string, endDate: string) => {
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      return 0;
    }

    return Math.max(1, Math.ceil((parsedEndDate.getTime() - parsedStartDate.getTime()) / 86400000) + 1);
  };

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: items as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: "agent-exhibitions",
    title: t("title"),
  });
  const labelFor = (options: { value: string; label: string }[], value: string) => (
    options.find((option) => option.value === value)?.label ?? value
  );
  const keyed = (pairs: readonly (readonly [string, string])[]) => pairs.map(([value, key]) => ({ value, label: t(key) }));
  const participationTypes = keyed(PARTICIPATION_KEYS);
  const objectives = keyed(OBJECTIVE_KEYS);
  const resourceTypes = keyed(RESOURCE_KEYS);
  const isEditing = editingId !== null;
  const setDialogRef = useCallback((node: HTMLDivElement | null) => {
    dialogContentRef.current = node;
    setDialogContainer(node);
  }, []);

  const statusOptions = [{ value: "all", label: tf("allStatuses") }, ...STATUS_FILTER_KEYS.map(([value, key]) => ({ value, label: t(key) }))];
  const categoryOptions = [{ value: "all", label: tf("allCategories") }, ...CATEGORY_FILTER_KEYS.map(([value, key]) => ({ value, label: t(key) }))];
  const phoneFilterCount = (statusFilter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0);

  const requestActions = (item: ExhibitionRequest): { quick: RowAction[]; menu: RowAction[] } => {
  const quick: RowAction[] = [
    { key: "view", label: t("viewDetails"), icon: Eye, onSelect: () => setDetailItem(item) },
  ];
  const menu: RowAction[] = [
    { key: "copy", label: t("duplicateRequest"), icon: Copy, onSelect: () => handleDuplicate(item) },
  ];
  if (["draft", "submitted", "revision_requested"].includes(item.status)) {
    menu.push({ key: "edit", label: t("editRequest"), icon: Pencil, onSelect: () => startEdit(item) });
  }
  if (canReportEvent(item)) {
    menu.unshift({ key: "complete", label: t("markEventCompleted"), icon: CheckCheck, onSelect: () => setCompleteItem(item) });
  }
  if (["draft", "submitted"].includes(item.status)) {
    menu.push({ key: "delete", label: t("deleteRequest"), icon: Trash2, destructive: true, onSelect: () => handleDelete(item._id) });
  }
    return { quick, menu };
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <WorkspaceHeader
        title={t("title")}
        context={t("subtitle")}
        actions={
          <Button onClick={openNewRequest} aria-label={t("newRequest")} className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("newRequest")}</span>
          </Button>
        }
        metrics={!loading && total > 0 ? [
          { label: tc("total"), value: total, icon: CalendarDays, tone: "primary" },
          { label: t("statusSubmitted"), value: summary.pendingReview, icon: Send, tone: "info" },
          { label: t("approved"), value: summary.approved, icon: Save, tone: "success" },
          { label: t("statusRevision"), value: summary.revisionRequested, icon: AlertTriangle, tone: "warning" },
        ] : undefined}
      />

      {/* Status and category were dropped when the filters left the header
          panel; both still narrow the API request, so they are back here. */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        onClear={search || statusFilter !== "all" || categoryFilter !== "all" ? () => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); resetPage(); } : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch value={search} onChange={(v) => { setSearch(v); resetPage(); }} placeholder={t("searchPlaceholder")} />
        <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
        <div className="contents max-sm:hidden">
          <SearchableSelect
            id="agent-exhibitions-status"
            className={INLINE_FILTER_CONTROL}
            options={statusOptions}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
            placeholder={tf("allStatuses")}
          />
          <SearchableSelect
            id="agent-exhibitions-category"
            className={INLINE_FILTER_CONTROL}
            options={categoryOptions}
            value={categoryFilter}
            onValueChange={(v) => { setCategoryFilter(v); resetPage(); }}
            placeholder={tf("allCategories")}
          />
        </div>
      </InlineFilterBar>

      <PhoneFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={phoneFilterCount}
        onClear={() => { setStatusFilter("all"); setCategoryFilter("all"); resetPage(); }}
      >
        <FilterField label={tf("status")} htmlFor="agent-exhibitions-sheet-status">
          <SearchableSelect
            id="agent-exhibitions-sheet-status"
            className={SHEET_CONTROL}
            options={statusOptions}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
            placeholder={tf("allStatuses")}
          />
        </FilterField>
        <FilterField label={tf("category")} htmlFor="agent-exhibitions-sheet-category">
          <SearchableSelect
            id="agent-exhibitions-sheet-category"
            className={SHEET_CONTROL}
            options={categoryOptions}
            value={categoryFilter}
            onValueChange={(v) => { setCategoryFilter(v); resetPage(); }}
            placeholder={tf("allCategories")}
          />
        </FilterField>
      </PhoneFilterSheet>

      <PhoneRecordList
        className="p-3 sm:hidden"
        label={t("title")}
        loading={loading}
        empty={<EmptyState title={t("noRequests")} icon={Inbox} />}
        items={items.map((item) => {
          const { quick, menu } = requestActions(item);
          const dateStr = item.eventStartDate
            ? `${formatListDate(item.eventStartDate, locale)}${item.eventEndDate ? ` – ${formatListDate(item.eventEndDate, locale)}` : ""}`
            : undefined;
          return {
            key: item._id,
            href: undefined,
            title: item.eventName,
            subtitle: placeText(item) || undefined,
            trailing: (
              <Badge className={`${STATUS_COLORS[item.status] ?? STATUS_COLORS.draft} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>
                {statusLabel(item.status)}
              </Badge>
            ),
            facts: [
              dateStr,
              formatCurrency(item.estimatedBudget, item.budgetCurrency),
            ],
            actions: <RowActions name={item.eventName} quick={quick} menu={menu} />,
          };
        })}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:hidden">
        {loading ? (
          <Table data-mobile-table="scroll">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeaderEvent")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderCategory")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderLocation")}</TableHead>
                <TableHead>{t("tableHeaderDates")}</TableHead>
                <TableHead>{t("tableHeaderBudget")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderPriority")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableBodySkeleton rows={5} cols={8} />
            </TableBody>
          </Table>
        ) : items.length === 0 ? (
          <Table data-mobile-table="scroll">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeaderEvent")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderCategory")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderLocation")}</TableHead>
                <TableHead>{t("tableHeaderDates")}</TableHead>
                <TableHead>{t("tableHeaderBudget")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderPriority")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-12">
                  <EmptyState title={t("noRequests")} icon={Inbox} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div className="overflow-x-auto">
            <Table data-mobile-table="scroll">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("tableHeaderEvent")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tableHeaderCategory")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tableHeaderLocation")}</TableHead>
                  <TableHead>{t("tableHeaderDates")}</TableHead>
                  <TableHead>{t("tableHeaderBudget")}</TableHead>
                  <TableHead>{t("tableHeaderStatus")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tableHeaderPriority")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const { quick, menu } = requestActions(item);
                  return (
                    <TableRow key={item._id}>
                      <TableCell>
                        <button onClick={() => setDetailItem(item)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">
                          {item.eventName}
                        </button>
                        {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="rounded-md border-primary/20 bg-primary/5 text-xs font-medium">
                          {labelFor(eventCategories, item.eventCategory)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary/60" /> {placeText(item) || t("notSpecified")}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-xs font-medium">{formatListDate(item.eventStartDate, locale)}{item.eventEndDate ? ` – ${formatListDate(item.eventEndDate, locale)}` : ""}</p>
                        {item.eventEndDate && <p className="mt-0.5 text-[11px] text-muted-foreground">{t("dayCount", { count: dayCount(item.eventStartDate, item.eventEndDate) })}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{formatCurrency(item.estimatedBudget, item.budgetCurrency)}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[item.status] ?? STATUS_COLORS.draft} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>
                          {statusLabel(item.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>{priorityLabel(item.priority)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions name={item.eventName} quick={quick} menu={menu} />
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
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      <AgentExhibitionDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null);
          startEdit(item as ExhibitionRequest);
        }}
        onComplete={(item) => {
          setDetailItem(null);
          setCompleteItem(item as ExhibitionRequest);
        }}
        statusLabel={statusLabel}
        statusClassName={(status) => STATUS_COLORS[status] ?? STATUS_COLORS.draft}
        priorityClassName={(priority) => PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium}
        categoryLabel={(value) => labelFor(eventCategories, value)}
        participationLabel={(value) => labelFor(participationTypes, value)}
        objectiveLabel={(value) => labelFor(objectives, value)}
        resourceLabel={(value) => labelFor(resourceTypes, value)}
      />

      <CompleteEventDialog
        request={completeItem ? {
          _id: completeItem._id,
          eventName: completeItem.eventName,
          expectedLeads: completeItem.expectedLeads,
          completionPhotoCount: (completeItem.attachments ?? []).filter((a) => a.kind === "completion").length,
        } : null}
        onClose={() => setCompleteItem(null)}
        onDone={() => { setCompleteItem(null); void fetchItems(); }}
      />

      {/* Steps instead of one long scroll (owner, 2026-10-14): what and
          when, then budget and support, then files. Only the fields scroll;
          the header, step bar and buttons stay put. */}
      <StepFormDialog
        open={showWizard}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            resetForm();
            setFormError("");
            setShowWizard(false);
          }
        }}
        title={isEditing ? t("editRequestTitle") : t("newRequestTitle")}
        description={t("requestFormDescription")}
        className="sm:max-w-xl"
        equalStepHeights
        contentRef={setDialogRef}
        error={formError}
        errorStep={formErrorStep}
        onErrorDismiss={() => setFormError("")}
        submitLabel={t("submitRequest")}
        submittingLabel={t("submitting")}
        submitting={submitting}
        onSubmit={() => void handleSubmit(false)}
        footerStart={
          <Button type="button" variant="ghost" onClick={() => void handleSubmit(true)} disabled={submitting}>
            <Save className="me-1 h-4 w-4" aria-hidden="true" /> {t("saveDraft")}
          </Button>
        }
        steps={[
          {
            label: t("stepEventDetails"),
            validate: validateDetailsStep,
            content: (
              <>
                <div>
                  <Label htmlFor="exhibition-title" required>{t("exhibitionTitleLabel")}</Label>
                  <Input
                    id="exhibition-title"
                    value={form.eventName}
                    onChange={(event) => updateForm("eventName", event.target.value)}
                    placeholder={t("eventNamePlaceholder")}
                  />
                </div>

                <div>
                  <Label htmlFor="exhibition-description">{t("description")}</Label>
                  <Textarea
                    id="exhibition-description"
                    value={form.description}
                    onChange={(event) => updateForm("description", event.target.value)}
                    placeholder={t("descriptionPlaceholder")}
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{t("startDate")}</Label>
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
                      placeholder={t("selectStartDate")}
                      minDate={startDateMin}
                      container={dialogContainer}
                      modal
                    />
                  </div>
                  <div>
                    <Label>{t("endDate")}</Label>
                    <DateTimePicker
                      value={form.eventEndDate}
                      onChange={(value) => updateForm("eventEndDate", value)}
                      mode="date"
                      placeholder={t("selectEndDate")}
                      minDate={endDateMin}
                      container={dialogContainer}
                      modal
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="exhibition-venue">{t("venue")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
                  <Input
                    id="exhibition-venue"
                    value={form.venue}
                    onChange={(event) => updateForm("venue", event.target.value)}
                    placeholder={t("locationPlaceholder")}
                  />
                </div>

                {/* Client check 2026-10-30: requests had no city, so lists read "TBD · IN". */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="exhibition-city">{t("eventLocation")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
                    <Input
                      id="exhibition-city"
                      value={form.eventLocation}
                      onChange={(event) => updateForm("eventLocation", event.target.value)}
                      placeholder={t("eventLocationPlaceholder")}
                      maxLength={300}
                    />
                  </div>
                  <div>
                    <Label htmlFor="exhibition-country">{t("country")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
                    <Input
                      id="exhibition-country"
                      value={form.country}
                      onChange={(event) => updateForm("country", event.target.value)}
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="exhibition-organizer">{t("organizerName")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
                    <Input
                      id="exhibition-organizer"
                      value={form.organizerName}
                      onChange={(event) => updateForm("organizerName", event.target.value)}
                      placeholder={t("organizerPlaceholder")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="exhibition-contact">{t("organizerContactShort")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
                    <Input
                      id="exhibition-contact"
                      value={form.organizerContact}
                      onChange={(event) => updateForm("organizerContact", event.target.value)}
                      placeholder={t("contactPlaceholder")}
                    />
                  </div>
                </div>
              </>
            ),
          },
          {
            label: t("stepBudgetSupport"),
            validate: validateSupportStep,
            content: (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="exhibition-budget">{t("estimatedBudget")}</Label>
                    <Input
                      id="exhibition-budget"
                      type="text"
                      inputMode="decimal"
                      className={SPINNERLESS_INPUT_CLASS}
                      value={form.estimatedBudget}
                      onChange={(event) => handleBudgetChange(event.target.value)}
                      placeholder={t("budgetPlaceholder")}
                    />
                  </div>
                  <div>
                    <Label>{t("currency")}</Label>
                    <SearchableSelect
                      options={CURRENCY_OPTIONS}
                      value={form.budgetCurrency}
                      onValueChange={handleCurrencyChange}
                      placeholder={t("selectCurrency")}
                      container={dialogContainer}
                      modal
                    />
                  </div>
                </div>

                {/* Participation styles. The request model has carried this field
                    all along and the super-agent participation-mix chart reports on
                    it. A dropdown, not a wall of chips: the step has to fit. */}
                <div>
                  <Label htmlFor="participation-types">
                    {t("participationStyle")} <span className="text-muted-foreground text-xs">({t("optional")})</span>
                  </Label>
                  <MultiSelect
                    id="participation-types"
                    options={participationTypes}
                    values={form.participationTypes}
                    onValuesChange={(values) => updateForm("participationTypes", values)}
                    placeholder={t("participationPickPlaceholder")}
                    ariaLabel={t("participationStyle")}
                    container={dialogContainer}
                    modal
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="exhibition-expected-leads">
                      {t("detailExpectedLeads")} <span className="text-muted-foreground text-xs">({t("optional")})</span>
                    </Label>
                    <Input
                      id="exhibition-expected-leads"
                      inputMode="numeric"
                      value={form.expectedLeads}
                      onChange={(event) => updateForm("expectedLeads", event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={t("expectedLeadsPlaceholder")}
                    />
                  </div>
                  <PriorityFormField
                    value={form.priority || "medium"}
                    onChange={(value) => updateForm("priority", value)}
                    eventStartDate={form.eventStartDate}
                    expectedLeads={form.expectedLeads}
                    container={dialogContainer}
                  />
                </div>

                <SupportItemsFormSection
                  supportItems={form.supportItems}
                  additionalRequirements={form.additionalRequirements}
                  onSupportItemsChange={(items) => setForm((previous) => ({ ...previous, supportItems: items }))}
                  onAdditionalRequirementsChange={(value) => updateForm("additionalRequirements", value)}
                  container={dialogContainer}
                />
              </>
            ),
          },
          {
            // Client feedback 2026-10-14: "option to upload the attachment
            // file or image related to event".
            label: t("stepFiles"),
            content: (
              <>
                {existingFiles.filter((a) => !removedFileIds.includes(a._id)).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{t("attachedFiles")}</p>
                    <AttachmentList
                      attachments={existingFiles.filter((a) => !removedFileIds.includes(a._id))}
                      onRemove={(a) => setRemovedFileIds((prev) => [...prev, a._id])}
                    />
                  </div>
                )}
                <PendingFilesField
                  kind="event"
                  files={pendingFiles}
                  onChange={setPendingFiles}
                  existingCount={existingFiles.length - removedFileIds.length}
                  label={t("attachmentsTitle")}
                  hint={t("attachmentsHint")}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
