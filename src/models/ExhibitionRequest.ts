import mongoose, { Document, Schema } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Status                                                             */
/* ------------------------------------------------------------------ */

export type ExhibitionRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "revision_requested"
  | "rejected"
  | "budget_approved"
  | "resources_assigned"
  | "active"
  | "completed"
  | "archived";

export const EXHIBITION_STATUSES: ExhibitionRequestStatus[] = [
  "draft", "submitted", "under_review", "approved", "revision_requested",
  "rejected", "budget_approved", "resources_assigned", "active",
  "completed", "archived",
];

/* ------------------------------------------------------------------ */
/*  Event category                                                     */
/* ------------------------------------------------------------------ */

export type ExhibitionCategory =
  | "career_fair"
  | "recruitment_expo"
  | "employer_branding"
  | "hiring_drive"
  | "university_event"
  | "gcc_recruitment"
  | "job_fair"
  | "other";

export const EXHIBITION_CATEGORIES: ExhibitionCategory[] = [
  "career_fair", "recruitment_expo", "employer_branding", "hiring_drive",
  "university_event", "gcc_recruitment", "job_fair", "other",
];

/* ------------------------------------------------------------------ */
/*  Participation types (multi-select)                                 */
/* ------------------------------------------------------------------ */

export type ExhibitionParticipationType =
  | "standee"
  | "stall"
  | "booth"
  | "sponsorship"
  | "flyers"
  | "recruitment_desk"
  | "branding_package"
  | "other";

export const EXHIBITION_PARTICIPATION_TYPES: ExhibitionParticipationType[] = [
  "standee", "stall", "booth", "sponsorship", "flyers",
  "recruitment_desk", "branding_package", "other",
];

/* ------------------------------------------------------------------ */
/*  Business objectives (multi-select)                                 */
/* ------------------------------------------------------------------ */

export type ExhibitionObjective =
  | "employer_acquisition"
  | "candidate_sourcing"
  | "brand_awareness"
  | "lead_generation"
  | "direct_hiring"
  | "market_expansion";

export const EXHIBITION_OBJECTIVES: ExhibitionObjective[] = [
  "employer_acquisition", "candidate_sourcing", "brand_awareness",
  "lead_generation", "direct_hiring", "market_expansion",
];

/* ------------------------------------------------------------------ */
/*  Required resources (multi-select)                                  */
/* ------------------------------------------------------------------ */

export type ExhibitionResourceType =
  | "brochures"
  | "standee"
  | "flyers"
  | "presentation_deck"
  | "employer_catalog"
  | "candidate_forms"
  | "branding_banners"
  | "video_assets"
  | "business_cards"
  | "booth_design";

export const EXHIBITION_RESOURCE_TYPES: ExhibitionResourceType[] = [
  "brochures", "standee", "flyers", "presentation_deck", "employer_catalog",
  "candidate_forms", "branding_banners", "video_assets", "business_cards", "booth_design",
];

/* ------------------------------------------------------------------ */
/*  Support items and inventory                                       */
/* ------------------------------------------------------------------ */

export type SupportItemType = "tv" | "rollup_banner" | "visiting_cards" | "volunteers" | "other";

export const SUPPORT_ITEM_TYPES: SupportItemType[] = [
  "tv", "rollup_banner", "visiting_cards", "volunteers", "other",
];

export type DeliveryStatus = "pending" | "ready" | "dispatched" | "delivered" | "issue";

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending", "ready", "dispatched", "delivered", "issue",
];

export interface ISupportItem {
  _id?: mongoose.Types.ObjectId;
  item: SupportItemType;
  label?: string; // Required when item = "other", max 120 chars
  requestedQty: number; // min 1, max 100000
  allocatedQty?: number; // min 0, max requestedQty
  responsiblePerson?: string; // max 120 chars
  allocationNote?: string; // max 500 chars
  deliveryStatus: DeliveryStatus;
  deliveredQty?: number; // min 0, max allocatedQty
  deliveryNote?: string; // max 500 chars
  updatedAt?: Date;
  updatedBy?: mongoose.Types.ObjectId;
}

/* ------------------------------------------------------------------ */
/*  Attachments                                                        */
/* ------------------------------------------------------------------ */

/**
 * "event": files the agent attaches to the request (brochure, floor plan,
 * organiser's invitation). "completion": photos from the finished event.
 * Stored private; the API hands out signed URLs.
 */
export type ExhibitionAttachmentKind = "event" | "completion";

export const EXHIBITION_ATTACHMENT_KINDS: ExhibitionAttachmentKind[] = ["event", "completion"];

export interface IExhibitionAttachment {
  _id?: mongoose.Types.ObjectId;
  kind: ExhibitionAttachmentKind;
  fileName: string;
  key: string;
  contentType: string;
  size: number;
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

/** What the agent reports when they mark the event completed. */
export interface ICompletionReport {
  actualLeads?: number;
  summary?: string;
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
}

/* ------------------------------------------------------------------ */
/*  Priority                                                           */
/* ------------------------------------------------------------------ */

export type ExhibitionPriority = "low" | "medium" | "high" | "critical";

export const EXHIBITION_PRIORITIES: ExhibitionPriority[] = ["low", "medium", "high", "critical"];

/* ------------------------------------------------------------------ */
/*  Budget breakdown                                                   */
/* ------------------------------------------------------------------ */

export interface IBudgetBreakdown {
  travel: number;
  accommodation: number;
  marketingMaterial: number;
  stallCost: number;
  miscellaneous: number;
}

/* ------------------------------------------------------------------ */
/*  Interface                                                          */
/* ------------------------------------------------------------------ */

export interface IExhibitionRequest extends Document {
  _id: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;

  /* Step 1 — Event details */
  eventName: string;
  eventCategory: ExhibitionCategory;
  eventLocation: string;
  venue?: string;
  country?: string;
  eventStartDate?: Date;
  eventEndDate?: Date;
  organizerName?: string;
  organizerContact?: string;

  /* Step 2 — Participation */
  participationTypes: ExhibitionParticipationType[];
  participationDetails?: string;

  /* Step 3 — Business objectives */
  objectives: ExhibitionObjective[];

  /* Step 4 — Budget */
  estimatedBudget: number;
  budgetBreakdown?: IBudgetBreakdown;
  /**
   * What the super-agent advised at operational approval. Advisory only — the
   * binding figure is `approvedBudget`, which only an admin sets. Without a
   * field of its own the super-agent's dialog collected a number and threw it
   * away, leaving no record that any figure had been proposed.
   */
  recommendedBudget?: number;
  recommendedBudgetBy?: mongoose.Types.ObjectId;
  recommendedBudgetAt?: Date;
  approvedBudget?: number;
  actualSpend?: number;
  budgetCurrency: string;
  budgetNotes?: string;

  /* Step 5 — Description */
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;

  /* Step 6 — Required resources */
  requiredResources: ExhibitionResourceType[];

  /* Team assignment */
  assignedTeam?: string[];

  /* Logistics */
  venueNotes?: string;

  /* Support items and inventory */
  supportItems?: ISupportItem[];
  additionalRequirements?: string; // max 2000 chars

  /* Attachments and completion */
  attachments?: IExhibitionAttachment[];
  completionReport?: ICompletionReport;

  /* Priority */
  priority: ExhibitionPriority;

  /* Status */
  status: ExhibitionRequestStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  budgetApprovedBy?: mongoose.Types.ObjectId;
  budgetApprovedAt?: Date;
  statusHistory: {
    status: ExhibitionRequestStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    note?: string;
    approverRole?: string;
    statusReason?: string;
  }[];
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const BudgetBreakdownSchema = new Schema<IBudgetBreakdown>(
  {
    travel: { type: Number, default: 0, min: 0 },
    accommodation: { type: Number, default: 0, min: 0 },
    marketingMaterial: { type: Number, default: 0, min: 0 },
    stallCost: { type: Number, default: 0, min: 0 },
    miscellaneous: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const SupportItemSchema = new Schema<ISupportItem>(
  {
    item: { type: String, enum: SUPPORT_ITEM_TYPES, required: true },
    label: { type: String, trim: true, maxlength: 120 },
    requestedQty: { type: Number, required: true, min: 1, max: 100000 },
    allocatedQty: { type: Number, min: 0 },
    responsiblePerson: { type: String, trim: true, maxlength: 120 },
    allocationNote: { type: String, trim: true, maxlength: 500 },
    deliveryStatus: { type: String, enum: DELIVERY_STATUSES, default: "pending" },
    deliveredQty: { type: Number, min: 0 },
    deliveryNote: { type: String, trim: true, maxlength: 500 },
    updatedAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const AttachmentSchema = new Schema<IExhibitionAttachment>(
  {
    kind: { type: String, enum: EXHIBITION_ATTACHMENT_KINDS, required: true },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    key: { type: String, required: true, maxlength: 500 },
    contentType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const CompletionReportSchema = new Schema<ICompletionReport>(
  {
    actualLeads: { type: Number, min: 0, max: 100000 },
    summary: { type: String, trim: true, maxlength: 2000 },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const ExhibitionRequestSchema = new Schema<IExhibitionRequest>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    superAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    /* Step 1 — Event details */
    eventName: { type: String, required: true, trim: true, maxlength: 200 },
    eventCategory: {
      type: String,
      enum: EXHIBITION_CATEGORIES,
      required: true,
      index: true,
    },
    eventLocation: { type: String, trim: true, maxlength: 300, default: "TBD" },
    venue: { type: String, trim: true, maxlength: 300 },
    country: { type: String, trim: true, maxlength: 100 },
    eventStartDate: { type: Date },
    eventEndDate: { type: Date },
    organizerName: { type: String, trim: true, maxlength: 200 },
    organizerContact: { type: String, trim: true, maxlength: 200 },

    /* Step 2 — Participation */
    participationTypes: [{ type: String, enum: EXHIBITION_PARTICIPATION_TYPES }],
    participationDetails: { type: String, trim: true, maxlength: 1000 },

    /* Step 3 — Objectives */
    objectives: [{ type: String, enum: EXHIBITION_OBJECTIVES }],

    /* Step 4 — Budget */
    estimatedBudget: { type: Number, min: 0, default: 0 },
    budgetBreakdown: { type: BudgetBreakdownSchema },
    recommendedBudget: { type: Number, min: 0 },
    recommendedBudgetBy: { type: Schema.Types.ObjectId, ref: "User" },
    recommendedBudgetAt: { type: Date },
    approvedBudget: { type: Number, min: 0 },
    actualSpend: { type: Number, min: 0 },
    budgetCurrency: { type: String, default: "USD", maxlength: 5 },
    budgetNotes: { type: String, trim: true, maxlength: 1000 },

    /* Step 5 — Description */
    description: { type: String, trim: true, maxlength: 5000 },
    executionPlan: { type: String, trim: true, maxlength: 5000 },
    expectedOutcome: { type: String, trim: true, maxlength: 2000 },
    expectedLeads: { type: Number, min: 0 },

    /* Step 6 — Required resources */
    requiredResources: [{ type: String, enum: EXHIBITION_RESOURCE_TYPES }],

    /* Team */
    assignedTeam: [{ type: String, trim: true, maxlength: 100 }],

    /* Logistics */
    venueNotes: { type: String, trim: true, maxlength: 1000 },

    /* Support items and inventory */
    supportItems: [SupportItemSchema],
    additionalRequirements: { type: String, trim: true, maxlength: 2000 },

    /* Attachments and completion */
    attachments: [AttachmentSchema],
    completionReport: { type: CompletionReportSchema },

    /* Priority */
    priority: {
      type: String,
      enum: EXHIBITION_PRIORITIES,
      default: "medium",
    },

    /* Status */
    status: {
      type: String,
      enum: EXHIBITION_STATUSES,
      default: "draft",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 2000 },
    budgetApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    budgetApprovedAt: { type: Date },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: EXHIBITION_STATUSES },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        note: { type: String, maxlength: 500 },
        approverRole: { type: String, maxlength: 50 },
        statusReason: { type: String, trim: true, maxlength: 1000 },
      },
    ],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

ExhibitionRequestSchema.index({ status: 1, createdAt: -1 });
ExhibitionRequestSchema.index({ eventCategory: 1 });
ExhibitionRequestSchema.index({ priority: 1 });

export default mongoose.models.ExhibitionRequest ??
  mongoose.model<IExhibitionRequest>("ExhibitionRequest", ExhibitionRequestSchema);
