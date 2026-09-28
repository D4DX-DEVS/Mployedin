import { formatCount } from "@/lib/ui/intlFormat";

export interface ExhibitionRequest {
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
  /** What the super-agent advised at operational approval. Advisory only. */
  recommendedBudget?: number;
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

export interface MatchedResource {
  _id: string;
  title: string;
  category: string;
  files: { fileName: string; url: string; size: number }[];
}

/** Values the status filter offers — a `?status=` outside these falls back to all. */
export const EXHIBITION_STATUS_FILTER_VALUES = [
  "submitted",
  "under_review",
  "approved",
  "revision_requested",
  "budget_approved",
  "resources_assigned",
  "active",
  "completed",
  "rejected",
  "archived",
] as const;

export const SORT_FIELDS = ["createdAt", "eventStartDate", "estimatedBudget", "eventName"] as const;

export const STATUS_BADGES: Record<string, string> = {
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

/* One status-to-key map. The status text used to be spelled out three times —
   as English literals and as two inline `t()` maps — which is how the table
   kept printing "Pending Review" to an Arabic admin. Every status has its own
   name: "active" used to read "Completed" and "archived" "Cancelled". */
export const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "draft",
  submitted: "submitted",
  under_review: "underReview",
  approved: "financeReviewStatus",
  revision_requested: "needsRevision",
  budget_approved: "statusBudgetApproved",
  resources_assigned: "statusResourcesAssigned",
  active: "statusActive",
  completed: "completedStatus",
  rejected: "rejected",
  archived: "statusArchived",
  cancelled: "cancelledStatus",
};

export const CATEGORY_LABEL_KEYS: Record<string, string> = {
  career_fair: "careerFair",
  recruitment_expo: "recruitmentExpo",
  employer_branding: "employerBranding",
  hiring_drive: "hiringDrive",
  university_event: "universityEvent",
  gcc_recruitment: "gccRecruitment",
  job_fair: "jobFair",
  other: "otherCategory",
};

export const PRIORITY_BADGES: Record<string, string> = {
  low: "border-border bg-muted text-muted-foreground",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

export const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

export const RESOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
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

export const RESOURCE_LABEL_KEYS: Record<string, string> = {
  brochures: "brochures",
  standee: "standeeResource",
  flyers: "flyersResource",
  presentation_deck: "presentationDeck",
  employer_catalog: "employerCatalog",
  candidate_forms: "candidateForms",
  branding_banners: "brandingBanners",
  video_assets: "videoAssets",
  business_cards: "businessCards",
  booth_design: "boothDesign",
};

export function formatDate(date: string | undefined | null, locale: string): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(date: string | undefined | null, locale: string): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dayCount(start: string | undefined | null, end: string | undefined | null): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

export function formatMoney(amount: number | undefined | null, currency = "AED"): string {
  if (amount == null) return "-";
  return `${currency} ${formatCount(amount)}`;
}

/** The event's dates as one range, or "-" when neither is set. */
export function formatDateRange(item: ExhibitionRequest, locale: string): string {
  const start = formatDate(item.eventStartDate, locale);
  const end = formatDate(item.eventEndDate, locale);
  if (start === "-" && end === "-") return "-";
  return start === end ? start : `${start} – ${end}`;
}

// Both helpers return a message key plus its values rather than a finished
// string: the table, the inspector and the export all consume the same result.
export function getStage(item: ExhibitionRequest): { value: string; labelKey: string } {
  if (item.status === "submitted" || item.status === "under_review") return { value: "team_leader", labelKey: "teamLeaderReview" };
  if (item.status === "approved") return { value: "finance", labelKey: "financeReviewStage" };
  if (item.status === "budget_approved") return { value: "super_agent", labelKey: "stageResourcing" };
  if (item.status === "resources_assigned" || item.status === "active") return { value: "admin", labelKey: "stageDelivery" };
  if (item.status === "completed") return { value: "completed", labelKey: "completedStage" };
  if (item.status === "rejected") return { value: "completed", labelKey: "rejected" };
  return { value: "team_leader", labelKey: "underReview" };
}

export function getSla(item: ExhibitionRequest): { labelKey: string; days: number; className: string; tone: string } {
  if (["completed", "rejected", "archived"].includes(item.status)) {
    return {
      labelKey: item.status === "rejected" ? "slaStopped" : "slaClosed",
      days: 0,
      className: "text-muted-foreground",
      tone: "bg-muted",
    };
  }
  const created = new Date(item.createdAt);
  const ageDays = Number.isNaN(created.getTime()) ? 0 : Math.floor((Date.now() - created.getTime()) / 86400000);
  const remaining = 5 - ageDays;
  if (remaining < 0) {
    return { labelKey: "slaOverdueByDays", days: Math.abs(remaining), className: "text-status-rejected", tone: "bg-status-rejected" };
  }
  if (remaining <= 1) {
    return { labelKey: "slaDaysRemaining", days: remaining, className: "text-status-shortlisted", tone: "bg-status-shortlisted" };
  }
  return { labelKey: "slaDaysRemaining", days: remaining, className: "text-status-selected", tone: "bg-status-selected" };
}
