import type { useTranslations } from "next-intl";
import {
  Building2, Calendar, Mail, MapPin, MessageCircle, Phone, Sparkles,
  Target, TrendingUp, Users, XCircle, type LucideIcon,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";
import {
  LEAD_STAGES,
  type ContactMethod,
  type FollowUpType,
  type HiringRange,
  type LeadStage,
  type LostReasonCode,
  type StageField,
} from "@/lib/leads/stageRules";

/* Shared by the board, the table, the Lead Workspace and its dialogs. */

export type T = ReturnType<typeof useTranslations>;
export type LeadStatus = LeadStage;
export type LeadQualification = "cold" | "warm" | "hot" | "qualified";

export interface LeadActivity {
  action: string;
  note?: string;
  timestamp: string;
  by?: string;
  fromStatus?: LeadStatus;
  toStatus?: LeadStatus;
}

export interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  industry?: string;
  score?: number;
  qualificationLevel?: LeadQualification;
  expectedRevenue?: number;
  expectedRevenueCurrency?: string;
  source?: string;
  lostReason?: string;
  lostReasonCode?: LostReasonCode;
  lostAt?: string;
  exhibitionId?: string;
  autoRouted?: boolean;
  status: LeadStatus;
  notes?: string;
  requirement?: string;
  expectedHiring?: HiringRange;
  followUpAt?: string;
  followUpType?: FollowUpType;
  followUpNote?: string;
  lastContactedAt?: string;
  lastContactMethod?: ContactMethod;
  wonValue?: number;
  convertedAt?: string;
  convertedToEmployerId?: string;
  activityLog?: LeadActivity[];
  /** Only on GET /api/leads/[id]. */
  assignedAgentName?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export const STAGES: LeadStatus[] = [...LEAD_STAGES];

export interface StageStyle {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  description: string;
}

export function getStageConfig(t: T): Record<LeadStatus, StageStyle> {
  return {
    new: {
      label: t("stageNew"),
      color: "text-status-applied",
      bgColor: "bg-status-applied-bg",
      borderColor: "border-status-applied/20",
      icon: <Sparkles className="h-4 w-4" />,
      description: t("stageNewDescription"),
    },
    contacted: {
      label: t("stageContacted"),
      color: "text-status-interview",
      bgColor: "bg-status-interview-bg",
      borderColor: "border-status-interview/20",
      icon: <Phone className="h-4 w-4" />,
      description: t("stageContactedDescription"),
    },
    interested: {
      label: t("stageInterested"),
      color: "text-status-shortlisted",
      bgColor: "bg-status-shortlisted-bg",
      borderColor: "border-status-shortlisted/20",
      icon: <TrendingUp className="h-4 w-4" />,
      description: t("stageInterestedDescription"),
    },
    negotiating: {
      label: t("stageNegotiating"),
      color: "text-status-interview",
      bgColor: "bg-status-interview-bg",
      borderColor: "border-status-interview/20",
      icon: <Target className="h-4 w-4" />,
      description: t("stageNegotiatingDescription"),
    },
    converted: {
      label: t("stageWon"),
      color: "text-status-selected",
      bgColor: "bg-status-selected-bg",
      borderColor: "border-status-selected/20",
      icon: <Building2 className="h-4 w-4" />,
      description: t("stageWonDescription"),
    },
    lost: {
      label: t("stageLost"),
      color: "text-status-rejected",
      bgColor: "bg-status-rejected-bg",
      borderColor: "border-status-rejected/20",
      icon: <XCircle className="h-4 w-4" />,
      description: t("stageLostDescription"),
    },
  };
}

export const TEMP_STYLES: Record<string, string> = {
  hot: "border-status-rejected/20 bg-status-rejected-bg text-status-rejected",
  warm: "border-status-shortlisted/20 bg-status-shortlisted-bg text-status-shortlisted",
  cold: "border-status-applied/20 bg-status-applied-bg text-status-applied",
  qualified: "border-status-selected/20 bg-status-selected-bg text-status-selected",
};

/* Label keys as static maps, never `t(\`prefix${value}\`)`: a value the map
   lacks then fails in review and in leadLabelKeys.test, not as a runtime
   MISSING_MESSAGE crash on one agent's card. */
export const CONTACT_METHOD_KEYS: Record<ContactMethod, string> = {
  call: "methodCall",
  whatsapp: "methodWhatsapp",
  email: "methodEmail",
  meeting: "methodMeeting",
  site_visit: "methodSiteVisit",
};

export const HIRING_RANGE_KEYS: Record<HiringRange, string> = {
  "1-5": "hiring1to5",
  "6-10": "hiring6to10",
  "11-25": "hiring11to25",
  "26-50": "hiring26to50",
  "50+": "hiring50plus",
};

export const LOST_REASON_KEYS: Record<LostReasonCode, string> = {
  price: "lostPrice",
  no_requirement: "lostNoRequirement",
  competitor: "lostCompetitor",
  not_responding: "lostNotResponding",
  other: "lostOther",
};

/** The Move dialog's field labels, also used to name what a refused move lacked. */
export const STAGE_FIELD_KEYS: Record<StageField, string> = {
  contactMethod: "moveFieldContactMethod",
  contactedAt: "moveFieldContactedAt",
  requirement: "moveFieldRequirement",
  expectedHiring: "moveFieldExpectedHiring",
  expectedRevenue: "moveFieldProposalValue",
  followUpAt: "moveFieldNextFollowUp",
  wonValue: "moveFieldFinalValue",
  wonAt: "moveFieldWonDate",
  lostReasonCode: "moveFieldLostReason",
};

export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  site_visit: MapPin,
  follow_up: Calendar,
  note: MessageCircle,
  stage_change: TrendingUp,
  converted_to_employer: Building2,
};

/** "AED 89,000". Currency code first, as the rest of the pipeline writes it. */
export function formatMoney(value: number, currency?: string): string {
  return `${currency ?? "AED"} ${formatCount(value)}`;
}

/** The figure a card leads with: the final value once Won, else the estimate. */
export function leadValue(lead: Pick<Lead, "status" | "wonValue" | "expectedRevenue">): number | null {
  if (lead.status === "converted" && lead.wonValue != null) return lead.wonValue;
  return lead.expectedRevenue != null && lead.expectedRevenue > 0 ? lead.expectedRevenue : null;
}

/**
 * Follow-ups saved from the old date-only field are stored at 00:00 UTC; a
 * time on those would be invented ("4:00 AM" in Dubai), so only a follow-up
 * scheduled with a time shows one.
 */
export function followUpHasTime(iso: string): boolean {
  const date = new Date(iso);
  return date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
}

export const isOpenStage = (status: LeadStatus) => status !== "converted" && status !== "lost";

/** wa.me wants the number in international form, digits only. */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}
