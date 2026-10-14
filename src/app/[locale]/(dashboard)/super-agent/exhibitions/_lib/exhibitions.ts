import type { useTranslations } from "next-intl";
import type { SupportItemView } from "@/components/features/exhibitions/SupportItemsSummary";
import type { TimelineEntry } from "@/components/features/exhibitions/ApprovalTimeline";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExhibitionRequest {
  _id: string;
  agentId: { _id: string; name: string; email: string };
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  venue?: string;
  country?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  organizerName?: string;
  organizerContact?: string;
  participationTypes: string[];
  participationDetails?: string;
  objectives: string[];
  estimatedBudget: number;
  /** Advisory figure from this role's operational approval; admin sets the binding one. */
  recommendedBudget?: number;
  approvedBudget?: number;
  budgetBreakdown?: { travel: number; accommodation: number; marketingMaterial: number; stallCost: number; miscellaneous: number };
  budgetCurrency: string;
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;
  requiredResources: string[];
  supportItems?: SupportItemView[];
  additionalRequirements?: string;
  priority: string;
  status: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  statusHistory?: TimelineEntry[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const STATUS_COLORS: Record<string, string> = {
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

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "statusDraft", submitted: "statusSubmitted", under_review: "statusUnderReview",
  approved: "statusApproved", revision_requested: "statusRevisionRequested",
  budget_approved: "statusBudgetApproved", resources_assigned: "statusResourcesAssigned",
  active: "statusActive", completed: "statusCompleted", rejected: "statusRejected", archived: "statusArchived",
};

// Helper to resolve status labels with translations
export function getStatusLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(STATUS_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "priorityLow", medium: "priorityMedium",
  high: "priorityHigh", critical: "priorityCritical",
};

// Helper to resolve priority labels with translations
export function getPriorityLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PRIORITY_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  career_fair: "categoryCareerFair", recruitment_expo: "categoryRecruitmentExpo",
  employer_branding: "categoryEmployerBranding", hiring_drive: "categoryHiringDrive",
  university_event: "categoryUniversityEvent", gcc_recruitment: "categoryGccRecruitment",
  job_fair: "categoryJobFair", other: "categoryOther",
};

// Helper to resolve category labels with translations
export function getCategoryLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(CATEGORY_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const OBJECTIVE_LABEL_KEYS: Record<string, string> = {
  employer_acquisition: "objectiveEmployerAcquisition", candidate_sourcing: "objectiveCandidateSourcing",
  brand_awareness: "objectiveBrandAwareness", lead_generation: "objectiveLeadGeneration",
  direct_hiring: "objectiveDirectHiring", market_expansion: "objectiveMarketExpansion",
};

// Helper to resolve objective labels with translations
export function getObjectiveLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(OBJECTIVE_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const RESOURCE_LABEL_KEYS: Record<string, string> = {
  brochures: "resourceBrochures", standee: "resourceStandee", flyers: "resourceFlyers",
  presentation_deck: "resourcePresentationDeck", employer_catalog: "resourceEmployerCatalog",
  candidate_forms: "resourceCandidateForms", branding_banners: "resourceBrandingBanners",
  video_assets: "resourceVideoAssets", business_cards: "resourceBusinessCards", booth_design: "resourceBoothDesign",
};

// Helper to resolve resource labels with translations
export function getResourceLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(RESOURCE_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const PARTICIPATION_LABEL_KEYS: Record<string, string> = {
  standee: "participationStandee", stall: "participationStall", booth: "participationBooth", sponsorship: "participationSponsorship",
  flyers: "participationFlyers", recruitment_desk: "participationRecruitmentDesk", branding_package: "participationBrandingPackage", other: "participationOther",
};

// Helper to resolve participation labels with translations
export function getParticipationLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PARTICIPATION_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

/* ------------------------------------------------------------------ */
/*  Review actions                                                     */
/* ------------------------------------------------------------------ */

export type ReviewAction = "under_review" | "approved" | "revision_requested" | "rejected";

/**
 * What a super agent can do from each status — the same moves
 * VALID_TRANSITIONS.super_agent allows, minus revision_requested → under_review,
 * which would start a review the agent has not resubmitted yet. The row, the
 * phone card and the detail footer all read this, so they never disagree.
 */
export function reviewActionsFor(status: string): { primary?: ReviewAction; secondary: ReviewAction[] } {
  if (status === "submitted") return { primary: "under_review", secondary: ["rejected"] };
  if (status === "under_review") return { primary: "approved", secondary: ["revision_requested", "rejected"] };
  return { secondary: [] };
}

/** The stored default for "no location yet" — shown as not specified, not as a place. */
export function locationText(item: Pick<ExhibitionRequest, "eventLocation" | "country">): string {
  const place = item.eventLocation && item.eventLocation.trim().toUpperCase() !== "TBD" ? item.eventLocation.trim() : "";
  return [place, item.country?.trim()].filter(Boolean).join(", ");
}

/** A zero or missing request budget means the agent did not give one. */
export function hasBudget(value: number | undefined | null): value is number {
  return typeof value === "number" && value > 0;
}
