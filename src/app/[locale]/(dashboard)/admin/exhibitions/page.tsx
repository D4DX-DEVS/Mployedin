"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Building2,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Download,
  FileImage,
  FileText,
  Flag,
  FolderOpen,
  Hotel,
  Inbox,
  Megaphone,
  Package,
  Paperclip,
  Percent,
  Plane,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Target,
  Undo2,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

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
  budgetBreakdown?: {
    travel: number;
    accommodation: number;
    marketingMaterial: number;
    stallCost: number;
    miscellaneous: number;
  };
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
  statusHistory?: {
    status: string;
    changedAt: string;
    changedBy?: { _id: string; name: string };
    note?: string;
    approverRole?: string;
    statusReason?: string;
  }[];
  createdAt: string;
}

interface MatchedResource {
  _id: string;
  title: string;
  category: string;
  files: { fileName: string; url: string; size: number }[];
}

const STATUS_BADGES: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-700",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  under_review: "border-orange-200 bg-orange-50 text-orange-700",
  approved: "border-purple-200 bg-purple-50 text-purple-700",
  revision_requested: "border-amber-200 bg-amber-50 text-amber-700",
  budget_approved: "border-green-200 bg-green-50 text-green-700",
  resources_assigned: "border-emerald-200 bg-emerald-50 text-emerald-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  archived: "border-gray-200 bg-gray-50 text-gray-600",
  cancelled: "border-gray-200 bg-gray-50 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Pending Review",
  approved: "Finance Review",
  revision_requested: "Needs Revision",
  budget_approved: "Approved",
  resources_assigned: "Approved",
  active: "Completed",
  completed: "Completed",
  rejected: "Rejected",
  archived: "Cancelled",
  cancelled: "Cancelled",
};

const PRIORITY_BADGES: Record<string, string> = {
  low: "border-border bg-muted text-muted-foreground",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  career_fair: "Career Fair",
  recruitment_expo: "Recruitment Expo",
  employer_branding: "Employer Branding",
  hiring_drive: "Hiring Drive",
  university_event: "University Event",
  gcc_recruitment: "GCC Recruitment",
  job_fair: "Job Fair",
  other: "Other",
};

const PARTICIPATION_LABELS: Record<string, string> = {
  standee: "Standee",
  stall: "Stall",
  booth: "Booth",
  sponsorship: "Sponsorship",
  flyers: "Flyers",
  recruitment_desk: "Recruitment Desk",
  branding_package: "Branding Package",
  other: "Other",
};

const RESOURCE_LABELS: Record<string, string> = {
  brochures: "Brochures",
  standee: "Standee",
  flyers: "Flyers",
  presentation_deck: "Presentation Deck",
  employer_catalog: "Employer Catalog",
  candidate_forms: "Candidate Forms",
  branding_banners: "Branding Banners",
  video_assets: "Video Assets",
  business_cards: "Business Cards",
  booth_design: "Booth Design",
};

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
  { value: "all", label: "All Status" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Pending Review" },
  { value: "approved", label: "Finance Review" },
  { value: "revision_requested", label: "Needs Revision" },
  { value: "budget_approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "team_leader", label: "Team Leader Review" },
  { value: "finance", label: "Finance Review" },
  { value: "super_agent", label: "Super Agent Approval" },
  { value: "admin", label: "Admin Approval" },
  { value: "completed", label: "Completed" },
];

const DATE_OPTIONS = [
  { value: "all", label: "Any Date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const BUDGET_OPTIONS = [
  { value: "all", label: "Any Budget" },
  { value: "0-10000", label: "Under 10K" },
  { value: "10000-50000", label: "10K-50K" },
  { value: "50000-999999999", label: "50K+" },
];

const REVIEWER_OPTIONS = [
  { value: "all", label: "Any Reviewer" },
  { value: "unassigned", label: "Unassigned" },
  { value: "assigned", label: "Assigned" },
];

const ADMIN_TRANSITIONS: Record<string, { label: string; value: string; variant: "default" | "destructive" | "outline" }[]> = {
  submitted: [
    { label: "Start Review", value: "under_review", variant: "default" },
    { label: "Approve", value: "approved", variant: "default" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  under_review: [
    { label: "Approve", value: "approved", variant: "default" },
    { label: "Request Changes", value: "revision_requested", variant: "outline" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  revision_requested: [{ label: "Re-review", value: "under_review", variant: "default" }],
  approved: [
    { label: "Approve Budget", value: "budget_approved", variant: "default" },
    { label: "Reject", value: "rejected", variant: "destructive" },
  ],
  budget_approved: [{ label: "Assign Resources", value: "resources_assigned", variant: "default" }],
  resources_assigned: [{ label: "Mark Active", value: "active", variant: "default" }],
  active: [{ label: "Complete", value: "completed", variant: "default" }],
  completed: [{ label: "Archive", value: "archived", variant: "outline" }],
  rejected: [{ label: "Archive", value: "archived", variant: "outline" }],
};

function formatDate(date: string | undefined | null) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(date: string | undefined | null) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(date: string | undefined | null) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / 3600000));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

function dayCount(start: string | undefined | null, end: string | undefined | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function formatMoney(amount: number | undefined | null, currency = "AED") {
  if (amount == null) return "-";
  return `${currency} ${formatCount(amount)}`;
}

function initials(name?: string) {
  return (name ?? "NA")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStage(item: ExhibitionRequest) {
  if (item.status === "submitted" || item.status === "under_review") return { value: "team_leader", label: "Team Leader Review" };
  if (item.status === "approved") return { value: "finance", label: "Finance Review" };
  if (item.status === "budget_approved") return { value: "super_agent", label: "Super Agent Approval" };
  if (item.status === "resources_assigned" || item.status === "active") return { value: "admin", label: "Admin Approval" };
  if (item.status === "completed") return { value: "completed", label: "Completed" };
  if (item.status === "rejected") return { value: "completed", label: "Rejected" };
  return { value: "team_leader", label: "Pending Review" };
}

function getSla(item: ExhibitionRequest) {
  if (["completed", "rejected", "archived"].includes(item.status)) {
    return { label: item.status === "rejected" ? "Stopped" : "Closed", className: "text-muted-foreground", tone: "bg-muted" };
  }
  const created = new Date(item.createdAt);
  const ageDays = Number.isNaN(created.getTime()) ? 0 : Math.floor((Date.now() - created.getTime()) / 86400000);
  const remaining = 5 - ageDays;
  if (remaining < 0) return { label: `Overdue by ${Math.abs(remaining)}d`, className: "text-red-600", tone: "bg-red-500" };
  if (remaining <= 1) return { label: `${remaining}d remaining`, className: "text-orange-600", tone: "bg-orange-500" };
  return { label: `${remaining}d remaining`, className: "text-emerald-600", tone: "bg-emerald-500" };
}

function quoteCsv(value: string | number | undefined | null) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminExhibitionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminExhibitions");
  const { confirm } = useConfirm();
  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    pendingReview: 0,
    financeReview: 0,
    awaitingApproval: 0,
    approved: 0,
    rejected: 0,
    budgetRequested: 0,
    budgetApproved: 0,
    budgetUtilized: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [budgetRange, setBudgetRange] = useState("all");
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionItem, setActionItem] = useState<ExhibitionRequest | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [matchedResources, setMatchedResources] = useState<MatchedResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const fetchMatchedResources = useCallback(async (requiredResources: string[]) => {
    if (!requiredResources?.length) {
      setMatchedResources([]);
      return;
    }
    setResourcesLoading(true);
    try {
      const categories = [...new Set(requiredResources.map((resource) => RESOURCE_TYPE_TO_CATEGORY[resource]).filter(Boolean))];
      const results = await Promise.all(
        categories.map((category) =>
          fetch(`/api/resources?category=${category}&limit=10`).then((response) => (response.ok ? response.json() : { items: [] })),
        ),
      );
      const seen = new Set<string>();
      const unique = results
        .flatMap((result) => result.items ?? [])
        .filter((resource: MatchedResource) => {
          if (seen.has(resource._id)) return false;
          seen.add(resource._id);
          return true;
        });
      setMatchedResources(unique);
    } catch {
      setMatchedResources([]);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const handleDetailOpen = useCallback(
    (item: ExhibitionRequest) => {
      setDetailItem(item);
      fetchMatchedResources(item.requiredResources);
    },
    [fetchMatchedResources],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (dateRange !== "all") params.set("dateRange", dateRange);
      if (countryFilter !== "all") params.set("country", countryFilter);
      if (budgetRange !== "all") params.set("budgetRange", budgetRange);
      if (reviewerFilter !== "all") params.set("reviewer", reviewerFilter);
      if (search) params.set("search", search);
      const response = await fetch(`/api/exhibitions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items ?? []);
        setTotalItems(data.total ?? 0);
        setServerTotalPages(data.totalPages ?? 1);
        setSummary((current) => ({ ...current, ...(data.summary ?? {}) }));
        setCountryOptions(data.countries ?? []);
      }
    } catch {
      toast.error(t("couldNotLoadExhibitionRequests"));
    } finally {
      setLoading(false);
    }
  }, [budgetRange, countryFilter, dateRange, page, priorityFilter, reviewerFilter, search, stageFilter, statusFilter, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter, stageFilter, dateRange, countryFilter, budgetRange, reviewerFilter, search]);

  const pageSize = 10;
  const totalPages = serverTotalPages;
  const visibleItems = items;
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item._id));
  const partiallySelected = visibleItems.some((item) => selectedIds.has(item._id)) && !allVisibleSelected;
  const selectedItems = items.filter((item) => selectedIds.has(item._id));
  const detailIndex = detailItem ? items.findIndex((item) => item._id === detailItem._id) : -1;
  const previousDetailItem = detailIndex > 0 ? items[detailIndex - 1] : null;
  const nextDetailItem = detailIndex >= 0 && detailIndex < items.length - 1 ? items[detailIndex + 1] : null;

  const totalBudgetReq = summary.budgetRequested;
  const totalBudgetApp = summary.budgetApproved;
  const totalBudgetUsed = summary.budgetUtilized;

  const kpis = [
    { label: "Total Requests", value: summary.total, trend: "+8.4%", subtitle: "All time", icon: ClipboardCheck, tone: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending Review", value: summary.pendingReview, trend: "-2.1%", subtitle: "Needs first action", icon: Clock, tone: "text-orange-600", bg: "bg-orange-50" },
    { label: "Finance Review", value: summary.financeReview, trend: "+3", subtitle: "In finance queue", icon: CircleDollarSign, tone: "text-purple-600", bg: "bg-purple-50" },
    { label: "Awaiting Approval", value: summary.awaitingApproval, trend: "Stable", subtitle: "Final approvers", icon: ShieldAlert, tone: "text-blue-600", bg: "bg-blue-50" },
    { label: "Approved", value: summary.approved, trend: "+5.2%", subtitle: "Ready or active", icon: CheckCircle2, tone: "text-green-600", bg: "bg-green-50" },
    { label: "Rejected", value: summary.rejected, trend: "-1", subtitle: "Declined requests", icon: XCircle, tone: "text-red-600", bg: "bg-red-50" },
    { label: "Budget Requested", value: formatMoney(totalBudgetReq, "AED"), trend: "+12%", subtitle: "Pipeline total", icon: Wallet, tone: "text-blue-600", bg: "bg-blue-50" },
    { label: "Budget Approved", value: formatMoney(totalBudgetApp, "AED"), trend: "+9%", subtitle: "Approved total", icon: Target, tone: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Budget Utilized", value: formatMoney(totalBudgetUsed, "AED"), trend: `${totalBudgetApp ? Math.round((totalBudgetUsed / totalBudgetApp) * 100) : 0}%`, subtitle: "Actual spend", icon: Percent, tone: "text-purple-600", bg: "bg-purple-50" },
  ];

  const openAction = (item: ExhibitionRequest, status: string) => {
    setActionItem(item);
    setActionStatus(status);
    setReviewNote("");
    setApprovedBudget(item.approvedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
    setBudgetNotes(item.budgetNotes ?? "");
    setAssignedTeam(item.assignedTeam?.join(", ") ?? "");
  };

  const handleAction = async () => {
    if (!actionItem) return;
    try {
      const trimmedNote = reviewNote.trim() || undefined;
      const payload: Record<string, unknown> = {
        status: actionStatus,
        reviewNote: trimmedNote,
        statusReason: trimmedNote,
      };
      if (["budget_approved", "approved"].includes(actionStatus) && approvedBudget) {
        payload.approvedBudget = Number(approvedBudget);
        payload.budgetNotes = budgetNotes;
      }
      if (actionStatus === "resources_assigned" && assignedTeam) {
        payload.assignedTeam = assignedTeam.split(",").map((member) => member.trim()).filter(Boolean);
      }
      const response = await csrfFetch(`/api/exhibitions/${actionItem._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const statusMap: Record<string, string> = {
          draft: t("draft"),
          submitted: t("submitted"),
          under_review: t("underReview"),
          approved: t("financeReviewStatus"),
          revision_requested: t("needsRevision"),
          budget_approved: t("approved"),
          resources_assigned: t("approved"),
          active: t("completedStatus"),
          completed: t("completedStatus"),
          rejected: t("rejected"),
          archived: t("archivedStatus"),
          cancelled: t("cancelledStatus"),
        };
        toast.success(t("requestMovedTo", { status: statusMap[actionStatus] ?? actionStatus }));
        setActionItem(null);
        fetchItems();
      } else {
        const error = await response.json();
        toast.error(error.error ?? t("failedToUpdateRequest"));
      }
    } catch {
      toast.error(t("failedToUpdateRequest"));
    }
  };

  const handleDelete = async (item: ExhibitionRequest) => {
    if (!(await confirm({ message: t("requestDeletedConfirm", { eventName: item.eventName }) }))) return;
    try {
      const response = await csrfFetch(`/api/exhibitions/${item._id}`, { method: "DELETE" });
      if (response.ok) {
        toast.success(t("requestDeleted"));
        fetchItems();
      }
    } catch {
      toast.error(t("failedToDeleteRequest"));
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!selectedItems.length) {
      toast.info(t("selectAtLeastOneRequest"));
      return;
    }
    if (status === "rejected" && !(await confirm({ message: t("rejectSelectedRequests", { count: selectedItems.length }) }))) return;
    try {
      await Promise.all(
        selectedItems.map((item) =>
          csrfFetch(`/api/exhibitions/${item._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status,
              reviewNote: status === "rejected" ? t("bulkRejectedFromAdminQueue") : t("bulkApprovedFromAdminQueue"),
              statusReason: status === "rejected" ? t("bulkRejectedFromAdminQueue") : t("bulkApprovedFromAdminQueue"),
            }),
          }),
        ),
      );
      toast.success(t("bulkActionsCompleted", { count: selectedItems.length }));
      setSelectedIds(new Set());
      fetchItems();
    } catch {
      toast.error(t("bulkActionFailed"));
    }
  };

  const handleExport = () => {
    const rows = [
      [t("requestIdHeader"), t("eventHeader"), t("agentHeader"), t("locationHeader"), t("datesHeader"), t("stageHeader"), t("budgetRequestedHeader"), t("budgetApprovedHeader"), t("priorityHeader"), t("submittedHeader"), t("slaHeader")],
      ...items.map((item) => {
        const sla = getSla(item);
        return [
          item._id,
          item.eventName,
          item.agentId?.name,
          `${item.eventLocation}${item.country ? `, ${item.country}` : ""}`,
          `${formatDate(item.eventStartDate)} - ${formatDate(item.eventEndDate)}`,
          getStage(item).label,
          item.estimatedBudget,
          item.approvedBudget ?? "",
          item.priority,
          formatDate(item.createdAt),
          sla.label,
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(quoteCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = t("exhibitionRequests");
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleVisibleSelection = (checked: boolean | "indeterminate") => {
    const next = new Set(selectedIds);
    visibleItems.forEach((item) => {
      if (checked) next.add(item._id);
      else next.delete(item._id);
    });
    setSelectedIds(next);
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setStageFilter("all");
    setDateRange("all");
    setCountryFilter("all");
    setBudgetRange("all");
    setReviewerFilter("all");
  };

  useEffect(() => {
    if (!detailItem || actionItem) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setDetailItem(null);
      } else if (event.key === "ArrowLeft" && previousDetailItem) {
        event.preventDefault();
        handleDetailOpen(previousDetailItem);
      } else if (event.key === "ArrowRight" && nextDetailItem) {
        event.preventDefault();
        handleDetailOpen(nextDetailItem);
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        openAction(detailItem, detailItem.status === "approved" ? "budget_approved" : "approved");
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        openAction(detailItem, "rejected");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionItem, detailItem, handleDetailOpen, nextDetailItem, previousDetailItem]);

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={CalendarDays}
        eyebrow={t("adminOperations")}
        title={t("exhibitionOperationsCenter")}
        description={t("manageExhibitionRequests")}
        summary={{
          label: t("queueHealth"),
          value: items.filter((item) => !["completed", "rejected", "archived"].includes(item.status)).length,
          note: t("openOperationalRequests"),
        }}
        actions={(
            <a href="exhibitions/analytics" className="self-start">
              <Button variant="outline" className="h-10 rounded-xl border-border/70 bg-background/90">
                <BarChart2 className="h-4 w-4" />
                {t("analytics")}
              </Button>
            </a>
        )}
        metricsClassName="xl:grid-cols-9"
        metrics={[
          { label: t("totalRequests"), value: summary.total, note: t("allTime"), icon: ClipboardCheck, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
          { label: t("pendingReview"), value: summary.pendingReview, note: t("needsFirstAction"), icon: Clock, iconClassName: "text-orange-600", iconSurfaceClassName: "bg-orange-50" },
          { label: t("financeReview"), value: summary.financeReview, note: t("inFinanceQueue"), icon: CircleDollarSign, iconClassName: "text-purple-600", iconSurfaceClassName: "bg-purple-50" },
          { label: t("awaitingApproval"), value: summary.awaitingApproval, note: t("finalApprovers"), icon: ShieldAlert, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
          { label: t("approved"), value: summary.approved, note: t("readyOrActive"), icon: CheckCircle2, iconClassName: "text-green-600", iconSurfaceClassName: "bg-green-50" },
          { label: t("rejected"), value: summary.rejected, note: t("declinedRequests"), icon: XCircle, iconClassName: "text-red-600", iconSurfaceClassName: "bg-red-50" },
          { label: t("budgetRequested"), value: formatMoney(totalBudgetReq, "AED"), note: t("pipelineTotal"), icon: Wallet, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
          { label: t("budgetApproved"), value: formatMoney(totalBudgetApp, "AED"), note: t("approvedTotal"), icon: Target, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("budgetUtilized"), value: formatMoney(totalBudgetUsed, "AED"), note: t("actualSpend"), icon: Percent, iconClassName: "text-purple-600", iconSurfaceClassName: "bg-purple-50" },
        ]}
      />

      <section className="workspace-panel-surface rounded-[28px] panel-body">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("requestQueue")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("allExhibitionRequests")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("reviewAssignApproveAndExport")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              {t("resetFilters")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t("export")}
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border/60 bg-background p-3 shadow-sm shadow-black/[0.03]">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(240px,1.5fr)_repeat(7,minmax(130px,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchRequestsAgentsEvents")}
                className="h-9 rounded-lg pl-9 text-sm"
              />
            </div>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
              { value: "all", label: t("allStatus") },
              { value: "submitted", label: t("submitted") },
              { value: "under_review", label: t("underReview") },
              { value: "approved", label: t("financeReviewStatus") },
              { value: "revision_requested", label: t("needsRevision") },
              { value: "budget_approved", label: t("approved") },
              { value: "completed", label: t("completedStatus") },
              { value: "rejected", label: t("rejected") },
              { value: "archived", label: t("archivedStatus") },
            ]} placeholder={t("status")} />
            <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={[
              { value: "all", label: t("allPriority") },
              { value: "low", label: t("low") },
              { value: "medium", label: t("medium") },
              { value: "high", label: t("high") },
              { value: "critical", label: t("critical") },
            ]} placeholder={t("priority")} />
            <FilterSelect value={stageFilter} onChange={setStageFilter} options={[
              { value: "all", label: t("allStages") },
              { value: "team_leader", label: t("teamLeaderReview") },
              { value: "finance", label: t("financeReviewStage") },
              { value: "super_agent", label: t("superAgentApproval") },
              { value: "admin", label: t("adminApproval") },
              { value: "completed", label: t("completedStage") },
            ]} placeholder={t("approvalStage")} />
            <FilterSelect value={dateRange} onChange={setDateRange} options={[
              { value: "all", label: t("anyDate") },
              { value: "7", label: t("last7Days") },
              { value: "30", label: t("last30Days") },
              { value: "90", label: t("last90Days") },
            ]} placeholder={t("dateRange")} />
            <FilterSelect
              value={countryFilter}
              onChange={setCountryFilter}
              options={[
                { value: "all", label: "All Countries" },
                ...countryOptions.map((country) => ({ value: country, label: country })),
              ]}
              placeholder={t("country")}
            />
            <FilterSelect value={budgetRange} onChange={setBudgetRange} options={[
              { value: "all", label: t("anyBudget") },
              { value: "0-10000", label: t("under10k") },
              { value: "10000-50000", label: t("from10kTo50k") },
              { value: "50000-999999999", label: t("from50kPlus") },
            ]} placeholder={t("budgetRange")} />
            <FilterSelect value={reviewerFilter} onChange={setReviewerFilter} options={[
              { value: "all", label: t("anyReviewer") },
              { value: "unassigned", label: t("unassigned") },
              { value: "assigned", label: t("assignedStatus") },
            ]} placeholder={t("assignedReviewer")} />
          </div>
        </div>

        {selectedItems.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">{selectedItems.length} {t("selected")}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleBulkStatus("approved")}>
                <CheckCheck className="h-4 w-4" />
                {t("bulkApprove")}
              </Button>
              <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={() => handleBulkStatus("rejected")}>
                <XCircle className="h-4 w-4" />
                {t("bulkReject")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => toast.info(t("reviewerAssignmentWorkflowQueued"))}>
                <UserPlus className="h-4 w-4" />
                {t("assignReviewer")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={handleExport}>
                <Download className="h-4 w-4" />
                {t("export")}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5">
          {loading ? (
            <div className="workspace-panel-surface overflow-hidden rounded-2xl">
              <div className="border-b bg-muted/40 px-4 py-3.5">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              </div>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-9 animate-pulse rounded-full bg-muted/70" />
                  <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
                  <div className="hidden h-4 w-28 animate-pulse rounded bg-muted/40 md:block" />
                  <div className="ml-auto h-7 w-24 animate-pulse rounded-lg bg-muted/30" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="workspace-empty-state flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
              <div className="workspace-muted-pill rounded-[20px] p-3">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("noExhibitionRequestsFound")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t("adjustFiltersOrResetTheQueue")}</p>
            </div>
          ) : (
            <div className="workspace-panel-surface overflow-hidden rounded-2xl">
              <div>
                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted/50">
                      <TableHead className="w-[52px]">
                        <Checkbox
                          checked={partiallySelected ? "indeterminate" : allVisibleSelected}
                          onCheckedChange={toggleVisibleSelection}
                          aria-label={t("selectVisibleRows")}
                        />
                      </TableHead>
                      <TableHead className="w-[28%]">{t("event")}</TableHead>
                      <TableHead className="w-[19%]">{t("agent")}</TableHead>
                      <TableHead className="w-[17%]">{t("currentStage")}</TableHead>
                      <TableHead className="w-[13%]">{t("budget")}</TableHead>
                      <TableHead className="w-[10%]">{t("priority")}</TableHead>
                      <TableHead className="w-[13%]">{t("sla")}</TableHead>
                      <TableHead className="w-[112px] text-right">{t("action")}</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleItems.map((item, index) => {
                      const stage = getStage(item);
                      const sla = getSla(item);
                      const isSelected = detailItem?._id === item._id;
                      return (
                        <tr
                          key={item._id}
                          className={`transition-colors hover:bg-primary/[0.035] ${
                            isSelected
                              ? "bg-blue-50/80 shadow-[inset_4px_0_0_hsl(var(--primary))]"
                              : index % 2 === 0
                                ? "bg-background"
                                : "bg-muted/15"
                          }`}
                        >
                          <td className="px-4 py-4 align-middle">
                            <Checkbox
                              checked={selectedIds.has(item._id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedIds);
                                if (checked) next.add(item._id);
                                else next.delete(item._id);
                                setSelectedIds(next);
                              }}
                              aria-label={`Select ${item.eventName}`}
                            />
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <button className="block min-w-0 text-left" onClick={() => handleDetailOpen(item)}>
                              <span className="block truncate font-semibold text-foreground hover:text-primary">{item.eventName}</span>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {t(`${Object.entries({ career_fair: "careerFair", recruitment_expo: "recruitmentExpo", employer_branding: "employerBranding", hiring_drive: "hiringDrive", university_event: "universityEvent", gcc_recruitment: "gccRecruitment", job_fair: "jobFair", other: "otherCategory" }).find(([k]) => k === item.eventCategory)?.[1] || "otherCategory"}`)} · {item._id.slice(-12).toUpperCase()}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 ring-1 ring-border">
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(item.agentId?.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{item.agentId?.name ?? t("agentRole")}</p>
                                <p className="truncate text-xs text-muted-foreground">{item.agentId?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <Badge className={`${STATUS_BADGES[item.status]} rounded-md px-2.5 py-1 text-[11px] font-semibold`} dot>
                              {stage.label}
                            </Badge>
                            <p className="mt-1 text-[11px] text-muted-foreground">{STATUS_LABELS[item.status] ?? item.status}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <p className="font-semibold text-foreground">{formatMoney(item.estimatedBudget, item.budgetCurrency)}</p>
                            <p className={item.approvedBudget ? "mt-1 text-xs font-medium text-emerald-600" : "mt-1 text-xs text-muted-foreground"}>
                              Approved: {formatMoney(item.approvedBudget, item.budgetCurrency)}
                            </p>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <Badge className={`${PRIORITY_BADGES[item.priority] ?? PRIORITY_BADGES.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize`}>
                              {item.priority}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${sla.tone}`} />
                              <span className={`text-xs font-semibold ${sla.className}`}>{sla.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right align-middle">
                            <Button variant={isSelected ? "default" : "outline"} size="sm" className="h-8 rounded-lg" onClick={() => handleDetailOpen(item)}>
                              {t("review")}
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("showing", { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, totalItems), total: totalItems })}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage(Math.max(1, page - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="rounded-lg border border-border/60 bg-background px-3 py-1 text-xs font-semibold">
                    {page} / {totalPages}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <DetailDrawer
        item={detailItem}
        matchedResources={matchedResources}
        resourcesLoading={resourcesLoading}
        onClose={() => setDetailItem(null)}
        onAction={openAction}
        previousItem={previousDetailItem}
        nextItem={nextDetailItem}
        onPrevious={() => previousDetailItem && handleDetailOpen(previousDetailItem)}
        onNext={() => nextDetailItem && handleDetailOpen(nextDetailItem)}
      />

      <Dialog open={!!actionItem} onOpenChange={() => setActionItem(null)}>
        <DialogContent className="max-w-md">
          {actionItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionStatus === "rejected"
                    ? t("confirmRejection")
                    : actionStatus === "revision_requested"
                      ? t("requestChanges")
                      : actionStatus === "archived"
                        ? t("archiveRequest")
                        : t("moveTo", { status: (() => {
                          const statusMap: Record<string, string> = {
                            draft: t("draft"),
                            submitted: t("submitted"),
                            under_review: t("underReview"),
                            approved: t("financeReviewStatus"),
                            revision_requested: t("needsRevision"),
                            budget_approved: t("approved"),
                            resources_assigned: t("approved"),
                            active: t("completedStatus"),
                            completed: t("completedStatus"),
                            rejected: t("rejected"),
                            archived: t("archivedStatus"),
                            cancelled: t("cancelledStatus"),
                          };
                          return statusMap[actionStatus] ?? actionStatus;
                        })() })}
                </DialogTitle>
                <DialogDescription>
                  {actionItem.eventName} by {actionItem.agentId?.name}. {t("addAnAuditNoteBeforeConfirming")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {["approved", "budget_approved"].includes(actionStatus) && (
                  <div>
                    <Label>{t("approvedBudget", { currency: actionItem.budgetCurrency })}</Label>
                    <Input type="number" value={approvedBudget} onChange={(event) => setApprovedBudget(event.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">{t("requested")}: {formatMoney(actionItem.estimatedBudget, actionItem.budgetCurrency)}</p>
                  </div>
                )}
                {actionStatus === "resources_assigned" && (
                  <div>
                    <Label>{t("assignedTeam")}</Label>
                    <Input value={assignedTeam} onChange={(event) => setAssignedTeam(event.target.value)} placeholder={t("egJohnSarahAhmed")} />
                  </div>
                )}
                <div>
                  <Label>{["rejected", "revision_requested"].includes(actionStatus) ? t("reason") : t("reviewNotes")}</Label>
                  <Textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder={actionStatus === "revision_requested" ? t("whatNeedsToChange") : t("addAConciseAuditNote")}
                    rows={3}
                  />
                </div>
                {["rejected", "archived"].includes(actionStatus) && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {t("thisIsADestructiveWorkflowAction")}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setActionItem(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleAction}
                  variant={actionStatus === "rejected" ? "destructive" : "default"}
                  className={actionStatus !== "rejected" ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
                  disabled={["rejected", "revision_requested"].includes(actionStatus) && !reviewNote.trim()}
                >
                  {t("confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 rounded-lg text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TableHead({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <th className={`px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground ${className}`}>{children}</th>;
}

function DetailDrawer({
  item,
  matchedResources,
  resourcesLoading,
  onClose,
  onAction,
  previousItem,
  nextItem,
  onPrevious,
  onNext,
}: {
  item: ExhibitionRequest | null;
  matchedResources: MatchedResource[];
  resourcesLoading: boolean;
  onClose: () => void;
  onAction: (item: ExhibitionRequest, status: string) => void;
  previousItem: ExhibitionRequest | null;
  nextItem: ExhibitionRequest | null;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const tr = useTranslations("adminExhibitions");
  const budgetApproved = item?.approvedBudget ?? 0;
  const actualSpend = item?.actualSpend ?? 0;
  const variance = budgetApproved ? ((budgetApproved - actualSpend) / budgetApproved) * 100 : 0;
  const utilization = budgetApproved ? Math.min(100, Math.round((actualSpend / budgetApproved) * 100)) : 0;

  if (!item) return null;

  return (
    <aside
      aria-label={tr("exhibitionRequestInspector")}
      className="fixed bottom-0 right-0 top-[72px] z-[70] flex w-full md:max-w-[700px] animate-in slide-in-from-right-8 flex-col border-l border-t border-border bg-background shadow-2xl shadow-black/15 duration-200"
    >
      <div className="border-b bg-background px-6 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/60 pb-3">
          <Button variant="ghost" size="sm" className="h-8 justify-self-start rounded-lg px-2 text-primary" disabled={!previousItem} onClick={onPrevious}>
            <ChevronLeft className="h-4 w-4" />
            {tr("previous")}
          </Button>
          <p className="truncate text-sm font-semibold text-foreground">{item._id.slice(-12).toUpperCase()}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-primary" disabled={!nextItem} onClick={onNext}>
              {tr("next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={tr("closeInspector")}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{item.eventName}</h2>
            <Badge className={`${STATUS_BADGES[item.status]} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
              {(() => {
                const statusMap: Record<string, string> = {
                  draft: tr("draft"),
                  submitted: tr("submitted"),
                  under_review: tr("underReview"),
                  approved: tr("financeReviewStatus"),
                  revision_requested: tr("needsRevision"),
                  budget_approved: tr("approved"),
                  resources_assigned: tr("approved"),
                  active: tr("completedStatus"),
                  completed: tr("completedStatus"),
                  rejected: tr("rejected"),
                  archived: tr("archivedStatus"),
                  cancelled: tr("cancelledStatus"),
                };
                return statusMap[item.status] ?? item.status;
              })()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(`${Object.entries({ career_fair: "careerFair", recruitment_expo: "recruitmentExpo", employer_branding: "employerBranding", hiring_drive: "hiringDrive", university_event: "universityEvent", gcc_recruitment: "gccRecruitment", job_fair: "jobFair", other: "otherCategory" }).find(([k]) => k === item.eventCategory)?.[1] || "otherCategory"}`)}
            {item.eventLocation ? ` · ${item.eventLocation}` : ""}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <InfoChip icon={<Flag className="h-3.5 w-3.5" />} label={tr("priority")} value={item.priority} />
          <InfoChip icon={<Clock className="h-3.5 w-3.5" />} label={tr("sla")} value={getSla(item).label} />
          <InfoChip icon={<CalendarDays className="h-3.5 w-3.5" />} label={tr("submittedHeader")} value={formatDate(item.createdAt)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-3 sm:space-y-6">
          <RequestSummaryCard item={item} tr={tr} />

          <SectionBlock title={tr("workflow")} tr={tr}>
            <WorkflowTimeline item={item} compact tr={tr} />
          </SectionBlock>

          <SectionBlock title={tr("overview")} tr={tr}>
            <div className="grid grid-cols-1 sm:grid-cols-2 overflow-hidden rounded-xl border border-border/60 text-sm">
              <DetailCell label={tr("location")} value={item.eventLocation || "-"} />
              <DetailCell label={tr("organizer")} value={item.organizerName || item.agentId?.name || "-"} />
              <DetailCell label={tr("dates")} value={`${formatDate(item.eventStartDate)} - ${formatDate(item.eventEndDate)}`} />
              <DetailCell label={tr("expectedLeads")} value={String(item.expectedLeads ?? "-")} />
              <DetailCell label={tr("duration")} value={`${dayCount(item.eventStartDate, item.eventEndDate) ?? 1} ${tr("days")}`} />
              <DetailCell label={tr("participants")} value={String(item.assignedTeam?.length ?? 1)} />
              <DetailCell label={tr("booths")} value={item.participationTypes?.includes("booth") ? tr("requested") : tr("notRequested")} />
              <DetailCell label={tr("venue")} value={item.venue ?? tr("tbd")} />
            </div>
            <div className="mt-4">
              <p className="text-sm leading-6 text-muted-foreground">{item.description || item.executionPlan || tr("noDescriptionProvided")}</p>
            </div>
          </SectionBlock>

          <SectionBlock title={tr("budget")} tr={tr}>
            <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{tr("financialOverview")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tr("approvedBudgetUtilizationAndVariance")}</p>
                </div>
                <div
                  className="grid h-20 w-20 place-items-center rounded-full text-xs font-semibold text-foreground"
                  style={{ background: `conic-gradient(hsl(var(--primary)) ${utilization}%, hsl(var(--muted)) 0)` }}
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-background">{utilization}%</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MetricTile label={tr("requestedLabel")} value={formatMoney(item.estimatedBudget, item.budgetCurrency)} />
                <MetricTile label={tr("approvedLabel")} value={formatMoney(item.approvedBudget, item.budgetCurrency)} accent="text-emerald-600" />
                <MetricTile label={tr("actualLabel")} value={formatMoney(item.actualSpend, item.budgetCurrency)} />
                <MetricTile label={tr("variance")} value={`${Math.round(variance)}%`} accent={variance >= 0 ? "text-emerald-600" : "text-red-600"} />
                <MetricTile label={tr("savings")} value={formatMoney(Math.max(0, budgetApproved - actualSpend), item.budgetCurrency)} accent="text-emerald-600" />
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{tr("utilized")}</span>
                  <span className="font-semibold text-foreground">{formatMoney(actualSpend, item.budgetCurrency)}</span>
                </div>
                <Progress value={utilization} className="h-2" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <BudgetLine icon={<Building2 className="h-4 w-4" />} label={tr("venueCost")} value={item.budgetBreakdown?.stallCost ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Megaphone className="h-4 w-4" />} label={tr("marketingMaterial")} value={item.budgetBreakdown?.marketingMaterial ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Plane className="h-4 w-4" />} label={tr("travel")} value={item.budgetBreakdown?.travel ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Hotel className="h-4 w-4" />} label={tr("accommodation")} value={item.budgetBreakdown?.accommodation ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Package className="h-4 w-4" />} label={tr("miscellaneous")} value={item.budgetBreakdown?.miscellaneous ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
            </div>
          </SectionBlock>

          <SectionBlock title={tr("riskIndicators")} tr={tr}>
            <div className="flex flex-wrap gap-2">
              <RiskBadge ok={!!item.venue} label={item.venue ? tr("venueConfirmed") : tr("venuePending")} />
              <RiskBadge ok={!!item.assignedTeam?.length} label={item.assignedTeam?.length ? tr("vendorAssigned") : tr("vendorPending")} />
              <RiskBadge ok={!!item.requiredResources?.length} label={item.requiredResources?.length ? tr("documentsComplete") : tr("documentsMissing")} />
              <RiskBadge ok={false} label={tr("insurancePending")} />
            </div>
          </SectionBlock>

          <SectionBlock title={tr("resources")} tr={tr}>
            <div className="flex flex-wrap gap-2">
              {item.requiredResources?.map((resource) => {
                const resourceMap: Record<string, string> = {
                  brochures: tr("brochures"),
                  standee: tr("standeeResource"),
                  flyers: tr("flyersResource"),
                  presentation_deck: tr("presentationDeck"),
                  employer_catalog: tr("employerCatalog"),
                  candidate_forms: tr("candidateForms"),
                  branding_banners: tr("brandingBanners"),
                  video_assets: tr("videoAssets"),
                  business_cards: tr("businessCards"),
                  booth_design: tr("boothDesign"),
                };
                return (
                  <Badge key={resource} variant="outline" className="rounded-md">
                    {resourceMap[resource] ?? resource}
                  </Badge>
                );
              })}
            </div>
            <div className="mt-3 space-y-2">
              {resourcesLoading ? (
                <p className="text-sm text-muted-foreground">{tr("loadingMatchingResources")}</p>
              ) : matchedResources.length > 0 ? (
                matchedResources.map((resource) => (
                  <FileCard key={resource._id} title={resource.title} subtitle={resource.category?.replace(/_/g, " ")} icon={<FolderOpen className="h-4 w-4" />} actionLabel="Open" onClick={() => resource.files?.[0]?.url && window.open(resource.files[0].url, "_blank")} />
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-center text-sm text-muted-foreground">{tr("noMatchingResourcesUploaded")}</div>
              )}
            </div>
          </SectionBlock>

          <SectionBlock title={tr("attachments")} tr={tr}>
            <div className="space-y-2">
              {[
                ["Proposal.pdf", tr("proposal"), FileText],
                ["Quotation.pdf", tr("quotation"), ReceiptText],
                ["Venue.pdf", tr("venueContract"), Building2],
                ["Images", tr("eventPhotos"), FileImage],
                ["Brochure", tr("marketingCollateral"), Megaphone],
                ["Invoice", tr("financeDocument"), ReceiptText],
              ].map(([title, subtitle, Icon]) => (
                <FileCard key={title as string} title={title as string} subtitle={subtitle as string} icon={<Icon className="h-4 w-4" />} actionLabel={tr("preview")} onClick={() => toast.info(tr("previewWillOpenWhenTheFile"))} />
              ))}
            </div>
          </SectionBlock>

          <SectionBlock title={tr("comments")} tr={tr}>
            <div className="space-y-4">
              <ThreadedComment role={tr("agentRole")} name={item.agentId?.name ?? tr("agentRole")} time={relativeTime(item.createdAt)} text={tr("submitTheExhibitionRequest")} />
              <ThreadedComment role={tr("financeReviewerRole")} name={tr("financeReviewer")} time="1d ago" text={tr("pleaseConfirmWhetherVenue")} />
              <ThreadedComment role={tr("adminOpsRole")} name={tr("adminOps")} time="4h ago" text={tr("resourcesTeamIsChecking")} />
              <div className="rounded-2xl border border-border/60 p-3">
                <Textarea rows={3} placeholder={tr("writeAComment")} />
                <div className="mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg">
                    <Paperclip className="h-4 w-4" />
                    {tr("attach")}
                  </Button>
                  <Button size="sm" className="h-8 rounded-lg">
                    <Send className="h-4 w-4" />
                    {tr("comment")}
                  </Button>
                </div>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title={tr("activity")} tr={tr}>
            <WorkflowTimeline item={item} tr={tr} />
          </SectionBlock>
        </div>
      </div>

      <div className="border-t bg-background px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button className="h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onAction(item, item.status === "approved" ? "budget_approved" : "approved")}>
            <CheckCircle2 className="h-4 w-4" />
            {tr("approveButton")}
          </Button>
          <Button variant="outline" className="h-9 rounded-lg border-red-200 bg-red-50/40 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onAction(item, "rejected")}>
            <XCircle className="h-4 w-4" />
            {tr("rejectButton")}
          </Button>
          <Button variant="outline" className="h-9 rounded-lg bg-muted/30" onClick={() => onAction(item, "revision_requested")}>
            <Undo2 className="h-4 w-4" />
            {tr("sendBackButton")}
          </Button>
          <Button variant="secondary" className="h-9 rounded-lg" onClick={() => toast.info(tr("reviewerAssignmentWorkflowQueued"))}>
            <UserPlus className="h-4 w-4" />
            {tr("assignReviewerButton")}
          </Button>
          <Button variant="ghost" className="h-9 rounded-lg" onClick={() => toast.info(tr("pdfGenerationQueued"))}>
            <Download className="h-4 w-4" />
            {tr("downloadPdfButton")}
          </Button>
          <Button variant="ghost" className="h-9 rounded-lg" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {tr("printButton")}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <button className="inline-flex items-center gap-1 disabled:opacity-40" disabled={!previousItem} onClick={onPrevious}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {tr("previous")}
          </button>
          <span>{tr("escCloseLeftRightNavigateAApproveRReject")}</span>
          <button className="inline-flex items-center gap-1 disabled:opacity-40" disabled={!nextItem} onClick={onNext}>
            {tr("next")}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-border/60 pr-2 last:border-r-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate font-semibold capitalize text-foreground">{value}</p>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode; tr?: any }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RequestSummaryCard({ item, tr }: { item: ExhibitionRequest; tr?: any }) {
  const t = tr || useTranslations("adminExhibitions");
  const categoryMap: Record<string, string> = {
    career_fair: t("careerFair"),
    recruitment_expo: t("recruitmentExpo"),
    employer_branding: t("employerBranding"),
    hiring_drive: t("hiringDrive"),
    university_event: t("universityEvent"),
    gcc_recruitment: t("gccRecruitment"),
    job_fair: t("jobFair"),
    other: t("otherCategory"),
  };
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <span>{categoryMap[item.eventCategory] ?? item.eventCategory}</span>
        <span className="text-muted-foreground">·</span>
        <span>{item.country || item.eventLocation || t("locationTbd")}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryMetric label={t("budget")} value={formatMoney(item.estimatedBudget, item.budgetCurrency)} />
        <SummaryMetric label={t("dates")} value={`${formatDate(item.eventStartDate)} - ${formatDate(item.eventEndDate)}`} />
        <SummaryMetric label={t("agent")} value={item.agentId?.name ?? t("agentRole")} />
        <SummaryMetric label={t("expectedLeads")} value={String(item.expectedLeads ?? "-")} />
        <SummaryMetric label={t("duration")} value={`${dayCount(item.eventStartDate, item.eventEndDate) ?? 1} ${t("days")}`} />
        <SummaryMetric label={t("priority")} value={item.priority} />
        <SummaryMetric label={t("venue")} value={item.venue ?? t("tbd")} />
        <SummaryMetric label={t("submittedHeader")} value={formatDate(item.createdAt)} />
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-border/60 p-3 last:border-r-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function MetricTile({ label, value, accent = "text-foreground" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function RiskBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge className={`${ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-700"} rounded-md px-2.5 py-1 text-[11px] font-semibold`}>
      {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}

function BudgetLine({ icon, label, value, total, currency }: { icon: React.ReactNode; label: string; value: number; total: number; currency: string }) {
  const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
          <span className="font-medium">{label}</span>
        </div>
        <span className="font-semibold">{formatMoney(value, currency)}</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}

function FileCard({ title, subtitle, icon, actionLabel, onClick }: { title: string; subtitle: string; icon: React.ReactNode; actionLabel: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background p-3 shadow-sm shadow-black/[0.02]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={onClick}>
        {actionLabel}
      </Button>
    </div>
  );
}

function WorkflowTimeline({ item, compact = false, tr }: { item: ExhibitionRequest; compact?: boolean; tr?: any }) {
  const t = tr || useTranslations("adminExhibitions");
  const workflowIndexByStatus: Record<string, number> = {
    draft: 0,
    submitted: 1,
    under_review: 1,
    revision_requested: 1,
    approved: 2,
    budget_approved: 3,
    resources_assigned: 4,
    active: 4,
    completed: 5,
  };
  const currentIndex = item.status === "rejected" ? 5 : (workflowIndexByStatus[item.status] ?? 1);
  const historyByStatus = new Map((item.statusHistory ?? []).map((entry) => [entry.status, entry]));
  const steps = [
    { key: "submitted", label: t("agentSubmitted"), owner: item.agentId?.name ?? t("agentRole") },
    { key: "under_review", label: t("teamLeaderReviewLabel"), owner: "Team Leader" },
    { key: "approved", label: t("financeBudgetReview"), owner: "Finance" },
    { key: "budget_approved", label: t("superAgentApprovalLabel"), owner: "Super Agent" },
    { key: "resources_assigned", label: t("adminVerification"), owner: "Admin" },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const history = historyByStatus.get(step.key);
        const isRejected = item.status === "rejected" && index >= currentIndex;
        const isDone = index < currentIndex || item.status === "completed";
        const isCurrent = item.status !== "completed" && item.status !== "rejected" && index === currentIndex;
        const tone = isRejected ? "border-red-500 bg-red-50 text-red-600" : isCurrent ? "border-primary bg-primary/10 text-primary" : isDone ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-border bg-muted text-muted-foreground";
        const statusLabel = isRejected ? t("rejectedStatusLabel") : isCurrent ? t("currentStatusLabel") : isDone ? t("doneStatusLabel") : t("waitingStatusLabel");
        const timestamp = history?.changedAt ?? (isDone ? item.createdAt : isCurrent ? item.reviewedAt ?? item.createdAt : null);

        if (compact) {
          return (
            <div key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
              {index < steps.length - 1 && <div className="absolute left-[13px] top-7 h-[calc(100%-1.4rem)] w-px bg-border" />}
              <span className={`z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${tone}`}>
                {isDone ? "✓" : isCurrent ? "●" : "○"}
              </span>
              <div className="min-w-0 flex-1 border-b border-border/50 pb-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{step.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {timestamp ? formatDateTime(timestamp) : t("pendingAction")} · {history?.changedBy?.name ?? step.owner}
                    </p>
                  </div>
                  <Badge className={`${isRejected ? "border-red-200 bg-red-50 text-red-700" : isCurrent ? "border-blue-200 bg-blue-50 text-blue-700" : isDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"} rounded-md px-2 py-0.5 text-[10px]`}>
                    {statusLabel}
                  </Badge>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 && <div className="absolute left-4 top-9 h-[calc(100%-2rem)] w-px bg-border" />}
            <Avatar className={`z-10 h-8 w-8 border ${tone} ring-4 ring-background`}>
              <AvatarFallback className="bg-transparent text-xs font-semibold">{initials(history?.changedBy?.name ?? step.owner)}</AvatarFallback>
            </Avatar>
            <div className={`min-w-0 flex-1 rounded-2xl border border-border/60 bg-background p-3 ${isCurrent ? "shadow-sm shadow-primary/10" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{history?.changedBy?.name ?? step.owner}</p>
                </div>
                <Badge className={`${isRejected ? "border-red-200 bg-red-50 text-red-700" : isCurrent ? "border-blue-200 bg-blue-50 text-blue-700" : isDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"} rounded-md px-2 py-0.5 text-[10px]`}>
                  {statusLabel}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{timestamp ? formatDateTime(timestamp) : t("pendingAction")}</p>
              <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {history?.note || history?.statusReason || (isCurrent ? t("currentApprovalOwnerIsReviewing") : isDone ? t("stepCompletedWithoutBlockingNotes") : t("noActivityRecordedYet"))}
              </p>
            </div>
          </div>
        );
      })}
      {item.status === "rejected" && (
        <div className="relative flex gap-3">
          <Avatar className="z-10 h-8 w-8 border border-red-500 bg-red-50 text-red-600 ring-4 ring-background">
            <AvatarFallback className="bg-transparent text-xs font-semibold">RJ</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 rounded-2xl border border-red-200 bg-red-50/60 p-3">
            <p className="text-sm font-semibold text-red-700">{t("rejectedStatusLabel")}</p>
            <p className="mt-1 text-xs text-red-600">{item.reviewNote || t("requestRejected")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadedComment({ role, name, time, text }: { role: string; name: string; time: string; text: string }) {
  const t = useTranslations("adminExhibitions");
  return (
    <div className="flex gap-3 rounded-2xl border border-border/60 p-3">
      <Avatar className="h-8 w-8 ring-1 ring-border">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <Badge variant="outline" className="rounded-md px-2 py-0.5 text-[10px]">
            {role}
          </Badge>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          {t("supportsAndAttachments")}
        </div>
      </div>
    </div>
  );
}
