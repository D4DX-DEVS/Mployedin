/**
 * What a lead has to carry before it may sit in a stage.
 *
 * Moving a card used to change only its column, so a "Won" lead could have no
 * value and a "Lost" one no reason. Each stage now names the details that make
 * it true, and the Move dialog (client) and the stage route (server) both read
 * this file, so the form and the API cannot disagree about what is required.
 *
 * Plain data and pure functions only: this module is imported by client
 * components as well as API routes.
 */

export const LEAD_STAGES = ["new", "contacted", "interested", "negotiating", "converted", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** How the agent reached the contact. The first four double as follow-up types. */
export const CONTACT_METHODS = ["call", "whatsapp", "email", "meeting", "site_visit"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const FOLLOW_UP_TYPES = ["call", "whatsapp", "email", "meeting"] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

/** Size of the hiring need, as ranges an agent can pick in a conversation. */
export const HIRING_RANGES = ["1-5", "6-10", "11-25", "26-50", "50+"] as const;
export type HiringRange = (typeof HIRING_RANGES)[number];

export const LOST_REASONS = ["price", "no_requirement", "competitor", "not_responding", "other"] as const;
export type LostReasonCode = (typeof LOST_REASONS)[number];

/** A detail the Move dialog collects. `wonAt` is stored as the lead's `convertedAt`. */
export type StageField =
  | "contactMethod"
  | "contactedAt"
  | "requirement"
  | "expectedHiring"
  | "expectedRevenue"
  | "followUpAt"
  | "wonValue"
  | "wonAt"
  | "lostReasonCode";

export const STAGE_REQUIRED_FIELDS: Record<LeadStage, readonly StageField[]> = {
  new: [],
  contacted: ["contactMethod", "contactedAt"],
  interested: ["requirement", "expectedHiring"],
  negotiating: ["expectedRevenue", "followUpAt"],
  converted: ["wonValue", "wonAt"],
  lost: ["lostReasonCode"],
};

/**
 * Whether moving `from` → `to` has to collect the target stage's details.
 *
 * Won and Lost always do: they are outcomes, and each carries its own record
 * (final value and date, or the reason). Any other forward move does. A move
 * back (Negotiating → Interested, or reopening a Lost lead) asks for nothing:
 * the agent is correcting the pipeline, not claiming progress.
 */
export function stageNeedsDetails(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return false;
  if (to === "converted" || to === "lost") return true;
  return LEAD_STAGES.indexOf(to) > LEAD_STAGES.indexOf(from);
}

export type StageDetails = Partial<Record<StageField, unknown>>;

const present = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return true;
};

/** Won and Lost are records of an outcome, made at the moment of the move. */
const OUTCOME_STAGES: readonly LeadStage[] = ["converted", "lost"];

/**
 * The target stage's required details that neither the move nor the lead
 * already holds. `known` is what is on the lead now (its saved requirement,
 * value, follow-up…), so an agent is not made to retype a value they entered
 * when they created the lead.
 *
 * Won and Lost never accept a known value: a reopened lead that is lost again
 * needs this loss's reason, and a final value must be stated, not inherited.
 */
export function missingStageFields(
  from: LeadStage,
  to: LeadStage,
  provided: StageDetails,
  known: StageDetails = {},
): StageField[] {
  if (!stageNeedsDetails(from, to)) return [];
  const usable = OUTCOME_STAGES.includes(to) ? {} : known;
  return STAGE_REQUIRED_FIELDS[to].filter((field) => !present(provided[field]) && !present(usable[field]));
}

/** Human-readable English names, for API and Copilot messages (the UI has its own labels). */
export const STAGE_FIELD_NAMES: Record<StageField, string> = {
  contactMethod: "how the contact was made",
  contactedAt: "when the contact was made",
  requirement: "the hiring requirement",
  expectedHiring: "the expected number of hires",
  expectedRevenue: "the proposal value",
  followUpAt: "the next follow-up date",
  wonValue: "the final value",
  wonAt: "the won date",
  lostReasonCode: "the reason it was lost",
};

/** The lead's current values, keyed the way the Move dialog asks for them. */
export function knownStageDetails(lead: {
  requirement?: unknown;
  expectedHiring?: unknown;
  expectedRevenue?: unknown;
  followUpAt?: unknown;
  lastContactedAt?: unknown;
  lastContactMethod?: unknown;
  wonValue?: unknown;
  convertedAt?: unknown;
  lostReasonCode?: unknown;
}): StageDetails {
  const followUp = lead.followUpAt ? new Date(lead.followUpAt as string | Date) : null;
  return {
    requirement: lead.requirement,
    expectedHiring: lead.expectedHiring,
    expectedRevenue: lead.expectedRevenue,
    // A past follow-up is not a "next" one: Negotiating would otherwise accept
    // a date that is already overdue.
    followUpAt: followUp && followUp.getTime() > Date.now() ? followUp : undefined,
    // A contact the agent already logged satisfies "Contacted"; a new move
    // there does not have to invent a second one.
    contactMethod: lead.lastContactMethod,
    contactedAt: lead.lastContactedAt,
    wonValue: lead.wonValue,
    wonAt: lead.convertedAt,
    lostReasonCode: lead.lostReasonCode,
  };
}
