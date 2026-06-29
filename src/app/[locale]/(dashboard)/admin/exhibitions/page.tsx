"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  draft: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
  submitted: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
  under_review: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300",
  approved: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300",
  revision_requested: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  budget_approved: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300",
  resources_assigned: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
  archived: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400",
  cancelled: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400",
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
  low: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  medium: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
  high: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300",
  critical: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
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
  return `${currency} ${amount.toLocaleString()}`;
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
  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [budgetRange, setBudgetRange] = useState("all");
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (search) params.set("search", search);
      const response = await fetch(`/api/exhibitions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items ?? []);
      }
    } catch {
      toast.error("Could not load exhibition requests");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, search, statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [statusFilter, priorityFilter, stageFilter, dateRange, countryFilter, budgetRange, reviewerFilter, search]);

  const countries = useMemo(() => {
    const values = [...new Set(items.map((item) => item.country).filter(Boolean))] as string[];
    return [{ value: "all", label: "All Countries" }, ...values.map((country) => ({ value: country, label: country }))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (stageFilter !== "all" && getStage(item).value !== stageFilter) return false;
      if (countryFilter !== "all" && item.country !== countryFilter) return false;
      if (reviewerFilter === "assigned" && !item.reviewedBy) return false;
      if (reviewerFilter === "unassigned" && item.reviewedBy) return false;
      if (dateRange !== "all") {
        const created = new Date(item.createdAt);
        const cutoff = Date.now() - Number(dateRange) * 86400000;
        if (Number.isNaN(created.getTime()) || created.getTime() < cutoff) return false;
      }
      if (budgetRange !== "all") {
        const [min, max] = budgetRange.split("-").map(Number);
        if ((item.estimatedBudget ?? 0) < min || (item.estimatedBudget ?? 0) > max) return false;
      }
      return true;
    });
  }, [budgetRange, countryFilter, dateRange, items, reviewerFilter, stageFilter]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item._id));
  const partiallySelected = visibleItems.some((item) => selectedIds.has(item._id)) && !allVisibleSelected;
  const selectedItems = filteredItems.filter((item) => selectedIds.has(item._id));
  const detailIndex = detailItem ? filteredItems.findIndex((item) => item._id === detailItem._id) : -1;
  const previousDetailItem = detailIndex > 0 ? filteredItems[detailIndex - 1] : null;
  const nextDetailItem = detailIndex >= 0 && detailIndex < filteredItems.length - 1 ? filteredItems[detailIndex + 1] : null;

  const totalBudgetReq = items.reduce((sum, item) => sum + (item.estimatedBudget ?? 0), 0);
  const totalBudgetApp = items.reduce((sum, item) => sum + (item.approvedBudget ?? 0), 0);
  const totalBudgetUsed = items.reduce((sum, item) => sum + (item.actualSpend ?? 0), 0);

  const kpis = [
    { label: "Total Requests", value: items.length, trend: "+8.4%", subtitle: "All time", icon: ClipboardCheck, tone: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Pending Review", value: items.filter((item) => ["submitted", "under_review"].includes(item.status)).length, trend: "-2.1%", subtitle: "Needs first action", icon: Clock, tone: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Finance Review", value: items.filter((item) => item.status === "approved").length, trend: "+3", subtitle: "In finance queue", icon: CircleDollarSign, tone: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
    { label: "Awaiting Approval", value: items.filter((item) => ["budget_approved", "resources_assigned"].includes(item.status)).length, trend: "Stable", subtitle: "Final approvers", icon: ShieldAlert, tone: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Approved", value: items.filter((item) => ["budget_approved", "resources_assigned", "active"].includes(item.status)).length, trend: "+5.2%", subtitle: "Ready or active", icon: CheckCircle2, tone: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
    { label: "Rejected", value: items.filter((item) => item.status === "rejected").length, trend: "-1", subtitle: "Declined requests", icon: XCircle, tone: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Budget Requested", value: formatMoney(totalBudgetReq, "AED"), trend: "+12%", subtitle: "Pipeline total", icon: Wallet, tone: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Budget Approved", value: formatMoney(totalBudgetApp, "AED"), trend: "+9%", subtitle: "Approved total", icon: Target, tone: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Budget Utilized", value: formatMoney(totalBudgetUsed, "AED"), trend: `${totalBudgetApp ? Math.round((totalBudgetUsed / totalBudgetApp) * 100) : 0}%`, subtitle: "Actual spend", icon: Percent, tone: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
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
        toast.success(`Request moved to ${STATUS_LABELS[actionStatus] ?? actionStatus}`);
        setActionItem(null);
        fetchItems();
      } else {
        const error = await response.json();
        toast.error(error.error ?? "Failed to update request");
      }
    } catch {
      toast.error("Failed to update request");
    }
  };

  const handleDelete = async (item: ExhibitionRequest) => {
    if (!window.confirm(`Delete ${item.eventName}? This action cannot be undone.`)) return;
    try {
      const response = await csrfFetch(`/api/exhibitions/${item._id}`, { method: "DELETE" });
      if (response.ok) {
        toast.success("Request deleted");
        fetchItems();
      }
    } catch {
      toast.error("Failed to delete request");
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!selectedItems.length) {
      toast.info("Select at least one request first");
      return;
    }
    if (status === "rejected" && !window.confirm(`Reject ${selectedItems.length} selected request(s)?`)) return;
    try {
      await Promise.all(
        selectedItems.map((item) =>
          csrfFetch(`/api/exhibitions/${item._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status,
              reviewNote: status === "rejected" ? "Bulk rejected from admin queue" : "Bulk approved from admin queue",
              statusReason: status === "rejected" ? "Bulk rejected from admin queue" : "Bulk approved from admin queue",
            }),
          }),
        ),
      );
      toast.success(`${selectedItems.length} request(s) updated`);
      setSelectedIds(new Set());
      fetchItems();
    } catch {
      toast.error("Bulk action failed");
    }
  };

  const handleExport = () => {
    const rows = [
      ["Request ID", "Event", "Agent", "Location", "Dates", "Stage", "Budget Requested", "Budget Approved", "Priority", "Submitted", "SLA"],
      ...filteredItems.map((item) => {
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
    link.download = "exhibition-requests.csv";
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
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <CalendarDays className="h-3.5 w-3.5" />
              Admin operations
            </div>
            <h1 className="mt-4 flex items-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              <CalendarDays className="h-7 w-7 text-primary" />
              Exhibition Operations Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage exhibition requests, approvals, budgets, resources, and operational risk from one controlled workspace.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:items-start">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[200px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Queue health</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {items.filter((item) => !["completed", "rejected", "archived"].includes(item.status)).length}
              </p>
              <p className="text-xs text-muted-foreground">Open operational requests</p>
            </div>
            <a href="exhibitions/analytics" className="self-start">
              <Button variant="outline" className="h-10 rounded-xl border-border/70 bg-background/90">
                <BarChart2 className="h-4 w-4" />
                Analytics
              </Button>
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
          {kpis.map(({ label, value, trend, subtitle, icon: Icon, tone, bg }) => (
            <div key={label} className="workspace-glass-panel min-h-[132px] rounded-2xl p-4">
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                    <Icon className={`h-5 w-5 ${tone}`} strokeWidth={1.8} />
                  </div>
                  <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {trend}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request queue</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">All exhibition requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review, assign, approve, and export requests from a single operational queue.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              Reset Filters
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border/60 bg-background p-3 shadow-sm shadow-black/[0.03]">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_repeat(7,minmax(130px,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search requests, agents, events..."
                className="h-9 rounded-lg pl-9 text-sm"
              />
            </div>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Status" />
            <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTIONS} placeholder="Priority" />
            <FilterSelect value={stageFilter} onChange={setStageFilter} options={STAGE_OPTIONS} placeholder="Approval Stage" />
            <FilterSelect value={dateRange} onChange={setDateRange} options={DATE_OPTIONS} placeholder="Date Range" />
            <FilterSelect value={countryFilter} onChange={setCountryFilter} options={countries} placeholder="Country" />
            <FilterSelect value={budgetRange} onChange={setBudgetRange} options={BUDGET_OPTIONS} placeholder="Budget Range" />
            <FilterSelect value={reviewerFilter} onChange={setReviewerFilter} options={REVIEWER_OPTIONS} placeholder="Assigned Reviewer" />
          </div>
        </div>

        {selectedItems.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">{selectedItems.length} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleBulkStatus("approved")}>
                <CheckCheck className="h-4 w-4" />
                Bulk Approve
              </Button>
              <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={() => handleBulkStatus("rejected")}>
                <XCircle className="h-4 w-4" />
                Bulk Reject
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => toast.info("Reviewer assignment workflow queued")}>
                <UserPlus className="h-4 w-4" />
                Assign Reviewer
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export
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
          ) : filteredItems.length === 0 ? (
            <div className="workspace-empty-state flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
              <div className="workspace-muted-pill rounded-[20px] p-3">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No exhibition requests found</p>
              <p className="max-w-md text-sm text-muted-foreground">Adjust the filters or reset the queue to see more requests.</p>
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
                          aria-label="Select visible rows"
                        />
                      </TableHead>
                      <TableHead className="w-[28%]">Event</TableHead>
                      <TableHead className="w-[19%]">Agent</TableHead>
                      <TableHead className="w-[17%]">Current Stage</TableHead>
                      <TableHead className="w-[13%]">Budget</TableHead>
                      <TableHead className="w-[10%]">Priority</TableHead>
                      <TableHead className="w-[13%]">SLA</TableHead>
                      <TableHead className="w-[112px] text-right">Action</TableHead>
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
                              ? "bg-blue-50/80 shadow-[inset_4px_0_0_hsl(var(--primary))] dark:bg-blue-950/20"
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
                                {CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory} · {item._id.slice(-12).toUpperCase()}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 ring-1 ring-border">
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(item.agentId?.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{item.agentId?.name ?? "Agent"}</p>
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
                              Review
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
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length} results
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="rounded-lg border border-border/60 bg-background px-3 py-1 text-xs font-semibold">
                    {page} / {totalPages}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
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
                    ? "Confirm rejection"
                    : actionStatus === "revision_requested"
                      ? "Request changes"
                      : actionStatus === "archived"
                        ? "Archive request"
                        : `Move to ${STATUS_LABELS[actionStatus] ?? actionStatus}`}
                </DialogTitle>
                <DialogDescription>
                  {actionItem.eventName} by {actionItem.agentId?.name}. Add an audit note before confirming.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {["approved", "budget_approved"].includes(actionStatus) && (
                  <div>
                    <Label>Approved Budget ({actionItem.budgetCurrency})</Label>
                    <Input type="number" value={approvedBudget} onChange={(event) => setApprovedBudget(event.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">Requested: {formatMoney(actionItem.estimatedBudget, actionItem.budgetCurrency)}</p>
                  </div>
                )}
                {actionStatus === "resources_assigned" && (
                  <div>
                    <Label>Assigned Team</Label>
                    <Input value={assignedTeam} onChange={(event) => setAssignedTeam(event.target.value)} placeholder="e.g. John, Sarah, Ahmed" />
                  </div>
                )}
                <div>
                  <Label>{["rejected", "revision_requested"].includes(actionStatus) ? "Reason *" : "Review Notes"}</Label>
                  <Textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder={actionStatus === "revision_requested" ? "What needs to change?" : "Add a concise audit note..."}
                    rows={3}
                  />
                </div>
                {["rejected", "archived"].includes(actionStatus) && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    This is a destructive workflow action and will be recorded in the request timeline.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setActionItem(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAction}
                  variant={actionStatus === "rejected" ? "destructive" : "default"}
                  className={actionStatus !== "rejected" ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
                  disabled={["rejected", "revision_requested"].includes(actionStatus) && !reviewNote.trim()}
                >
                  Confirm
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
  const budgetApproved = item?.approvedBudget ?? 0;
  const actualSpend = item?.actualSpend ?? 0;
  const variance = budgetApproved ? ((budgetApproved - actualSpend) / budgetApproved) * 100 : 0;
  const utilization = budgetApproved ? Math.min(100, Math.round((actualSpend / budgetApproved) * 100)) : 0;

  if (!item) return null;

  return (
    <aside
      aria-label="Exhibition request inspector"
      className="fixed bottom-0 right-0 top-[72px] z-[70] flex w-full max-w-[700px] animate-in slide-in-from-right-8 flex-col border-l border-t border-border bg-background shadow-2xl shadow-black/15 duration-200"
    >
      <div className="border-b bg-background px-6 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/60 pb-3">
          <Button variant="ghost" size="sm" className="h-8 justify-self-start rounded-lg px-2 text-primary" disabled={!previousItem} onClick={onPrevious}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <p className="truncate text-sm font-semibold text-foreground">{item._id.slice(-12).toUpperCase()}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-primary" disabled={!nextItem} onClick={onNext}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label="Close inspector">
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{item.eventName}</h2>
            <Badge className={`${STATUS_BADGES[item.status]} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
              {STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}
            {item.eventLocation ? ` · ${item.eventLocation}` : ""}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <InfoChip icon={<Flag className="h-3.5 w-3.5" />} label="Priority" value={item.priority} />
          <InfoChip icon={<Clock className="h-3.5 w-3.5" />} label="SLA" value={getSla(item).label} />
          <InfoChip icon={<CalendarDays className="h-3.5 w-3.5" />} label="Submitted" value={formatDate(item.createdAt)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <RequestSummaryCard item={item} />

          <SectionBlock title="Workflow">
            <WorkflowTimeline item={item} compact />
          </SectionBlock>

          <SectionBlock title="Overview">
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/60 text-sm">
              <DetailCell label="Location" value={item.eventLocation || "-"} />
              <DetailCell label="Organizer" value={item.organizerName || item.agentId?.name || "-"} />
              <DetailCell label="Dates" value={`${formatDate(item.eventStartDate)} - ${formatDate(item.eventEndDate)}`} />
              <DetailCell label="Expected Leads" value={String(item.expectedLeads ?? "-")} />
              <DetailCell label="Duration" value={`${dayCount(item.eventStartDate, item.eventEndDate) ?? 1} day(s)`} />
              <DetailCell label="Participants" value={String(item.assignedTeam?.length ?? 1)} />
              <DetailCell label="Booths" value={item.participationTypes?.includes("booth") ? "Requested" : "Not requested"} />
              <DetailCell label="Venue" value={item.venue ?? "TBD"} />
            </div>
            <div className="mt-4">
              <p className="text-sm leading-6 text-muted-foreground">{item.description || item.executionPlan || "No description provided."}</p>
            </div>
          </SectionBlock>

          <SectionBlock title="Budget">
            <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Financial Overview</p>
                  <p className="mt-1 text-xs text-muted-foreground">Approved budget utilization and variance</p>
                </div>
                <div
                  className="grid h-20 w-20 place-items-center rounded-full text-xs font-semibold text-foreground"
                  style={{ background: `conic-gradient(hsl(var(--primary)) ${utilization}%, hsl(var(--muted)) 0)` }}
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-background">{utilization}%</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MetricTile label="Requested" value={formatMoney(item.estimatedBudget, item.budgetCurrency)} />
                <MetricTile label="Approved" value={formatMoney(item.approvedBudget, item.budgetCurrency)} accent="text-emerald-600" />
                <MetricTile label="Actual" value={formatMoney(item.actualSpend, item.budgetCurrency)} />
                <MetricTile label="Variance" value={`${Math.round(variance)}%`} accent={variance >= 0 ? "text-emerald-600" : "text-red-600"} />
                <MetricTile label="Savings" value={formatMoney(Math.max(0, budgetApproved - actualSpend), item.budgetCurrency)} accent="text-emerald-600" />
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Utilized</span>
                  <span className="font-semibold text-foreground">{formatMoney(actualSpend, item.budgetCurrency)}</span>
                </div>
                <Progress value={utilization} className="h-2" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <BudgetLine icon={<Building2 className="h-4 w-4" />} label="Venue" value={item.budgetBreakdown?.stallCost ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Megaphone className="h-4 w-4" />} label="Marketing" value={item.budgetBreakdown?.marketingMaterial ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Plane className="h-4 w-4" />} label="Travel" value={item.budgetBreakdown?.travel ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Hotel className="h-4 w-4" />} label="Accommodation" value={item.budgetBreakdown?.accommodation ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
              <BudgetLine icon={<Package className="h-4 w-4" />} label="Miscellaneous" value={item.budgetBreakdown?.miscellaneous ?? 0} total={item.estimatedBudget} currency={item.budgetCurrency} />
            </div>
          </SectionBlock>

          <SectionBlock title="Risk Indicators">
            <div className="flex flex-wrap gap-2">
              <RiskBadge ok={!!item.venue} label={item.venue ? "Venue Confirmed" : "Venue Pending"} />
              <RiskBadge ok={!!item.assignedTeam?.length} label={item.assignedTeam?.length ? "Vendor Assigned" : "Vendor Pending"} />
              <RiskBadge ok={!!item.requiredResources?.length} label={item.requiredResources?.length ? "Documents Complete" : "Documents Missing"} />
              <RiskBadge ok={false} label="Insurance Pending" />
            </div>
          </SectionBlock>

          <SectionBlock title="Resources">
            <div className="flex flex-wrap gap-2">
              {item.requiredResources?.map((resource) => (
                <Badge key={resource} variant="outline" className="rounded-md">
                  {RESOURCE_LABELS[resource] ?? resource}
                </Badge>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {resourcesLoading ? (
                <p className="text-sm text-muted-foreground">Loading matching resources...</p>
              ) : matchedResources.length > 0 ? (
                matchedResources.map((resource) => (
                  <FileCard key={resource._id} title={resource.title} subtitle={resource.category?.replace(/_/g, " ")} icon={<FolderOpen className="h-4 w-4" />} actionLabel="Open" onClick={() => resource.files?.[0]?.url && window.open(resource.files[0].url, "_blank")} />
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-center text-sm text-muted-foreground">No matching resources uploaded yet.</div>
              )}
            </div>
          </SectionBlock>

          <SectionBlock title="Attachments">
            <div className="space-y-2">
              {[
                ["Proposal.pdf", "Event proposal", FileText],
                ["Quotation.pdf", "Vendor quotation", ReceiptText],
                ["Venue.pdf", "Venue contract", Building2],
                ["Images", "Event photos", FileImage],
                ["Brochure", "Marketing collateral", Megaphone],
                ["Invoice", "Finance document", ReceiptText],
              ].map(([title, subtitle, Icon]) => (
                <FileCard key={title as string} title={title as string} subtitle={subtitle as string} icon={<Icon className="h-4 w-4" />} actionLabel="Preview" onClick={() => toast.info("Preview will open when the file is attached")} />
              ))}
            </div>
          </SectionBlock>

          <SectionBlock title="Comments">
            <div className="space-y-4">
              <ThreadedComment role="Agent" name={item.agentId?.name ?? "Agent"} time={relativeTime(item.createdAt)} text="Submitted the exhibition request with initial budget and expected lead targets." />
              <ThreadedComment role="Finance" name="Finance Reviewer" time="1d ago" text="Please confirm whether venue deposit is included in the approved amount." />
              <ThreadedComment role="Admin" name="Admin Ops" time="4h ago" text="Resources team is checking booth collateral availability." />
              <div className="rounded-2xl border border-border/60 p-3">
                <Textarea rows={3} placeholder="Write a comment, use @ to mention teammates, or attach supporting files..." />
                <div className="mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg">
                    <Paperclip className="h-4 w-4" />
                    Attach
                  </Button>
                  <Button size="sm" className="h-8 rounded-lg">
                    <Send className="h-4 w-4" />
                    Comment
                  </Button>
                </div>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title="Activity">
            <WorkflowTimeline item={item} />
          </SectionBlock>
        </div>
      </div>

      <div className="border-t bg-background px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onAction(item, item.status === "approved" ? "budget_approved" : "approved")}>
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button variant="outline" className="h-9 rounded-lg border-red-200 bg-red-50/40 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onAction(item, "rejected")}>
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
          <Button variant="outline" className="h-9 rounded-lg bg-muted/30" onClick={() => onAction(item, "revision_requested")}>
            <Undo2 className="h-4 w-4" />
            Send Back
          </Button>
          <Button variant="secondary" className="h-9 rounded-lg" onClick={() => toast.info("Reviewer assignment workflow queued")}>
            <UserPlus className="h-4 w-4" />
            Assign Reviewer
          </Button>
          <Button variant="ghost" className="h-9 rounded-lg" onClick={() => toast.info("PDF generation queued")}>
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="ghost" className="h-9 rounded-lg" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <button className="inline-flex items-center gap-1 disabled:opacity-40" disabled={!previousItem} onClick={onPrevious}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <span>Esc close · ←/→ navigate · A approve · R reject</span>
          <button className="inline-flex items-center gap-1 disabled:opacity-40" disabled={!nextItem} onClick={onNext}>
            Next
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

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RequestSummaryCard({ item }: { item: ExhibitionRequest }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <span>{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</span>
        <span className="text-muted-foreground">·</span>
        <span>{item.country || item.eventLocation || "Location TBD"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryMetric label="Budget" value={formatMoney(item.estimatedBudget, item.budgetCurrency)} />
        <SummaryMetric label="Dates" value={`${formatDate(item.eventStartDate)} - ${formatDate(item.eventEndDate)}`} />
        <SummaryMetric label="Agent" value={item.agentId?.name ?? "Agent"} />
        <SummaryMetric label="Expected Leads" value={String(item.expectedLeads ?? "-")} />
        <SummaryMetric label="Duration" value={`${dayCount(item.eventStartDate, item.eventEndDate) ?? 1} day(s)`} />
        <SummaryMetric label="Priority" value={item.priority} />
        <SummaryMetric label="Venue" value={item.venue ?? "TBD"} />
        <SummaryMetric label="Submitted" value={formatDate(item.createdAt)} />
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

function WorkflowTimeline({ item, compact = false }: { item: ExhibitionRequest; compact?: boolean }) {
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
    { key: "submitted", label: "Agent Submitted", owner: item.agentId?.name ?? "Agent" },
    { key: "under_review", label: "Team Leader Review", owner: "Team Leader" },
    { key: "approved", label: "Finance Budget Review", owner: "Finance" },
    { key: "budget_approved", label: "Super Agent Approval", owner: "Super Agent" },
    { key: "resources_assigned", label: "Admin Verification", owner: "Admin" },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const history = historyByStatus.get(step.key);
        const isRejected = item.status === "rejected" && index >= currentIndex;
        const isDone = index < currentIndex || item.status === "completed";
        const isCurrent = item.status !== "completed" && item.status !== "rejected" && index === currentIndex;
        const tone = isRejected ? "border-red-500 bg-red-50 text-red-600" : isCurrent ? "border-primary bg-primary/10 text-primary" : isDone ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-border bg-muted text-muted-foreground";
        const statusLabel = isRejected ? "Rejected" : isCurrent ? "Current" : isDone ? "Done" : "Waiting";
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
                      {timestamp ? formatDateTime(timestamp) : "Pending"} · {history?.changedBy?.name ?? step.owner}
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
              <p className="mt-2 text-xs text-muted-foreground">{timestamp ? formatDateTime(timestamp) : "Awaiting action"}</p>
              <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {history?.note || history?.statusReason || (isCurrent ? "Current approval owner is reviewing this request." : isDone ? "Step completed without blocking notes." : "No activity recorded yet.")}
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
            <p className="text-sm font-semibold text-red-700">Rejected</p>
            <p className="mt-1 text-xs text-red-600">{item.reviewNote || "Request rejected by an approver."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadedComment({ role, name, time, text }: { role: string; name: string; time: string; text: string }) {
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
          Supports mentions and attachments
        </div>
      </div>
    </div>
  );
}
