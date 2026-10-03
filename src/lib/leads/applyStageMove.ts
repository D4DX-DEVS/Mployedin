import type { Types } from "mongoose";
import type { ILead } from "@/models/Lead";
import { calculateLeadScore, deriveQualification } from "./scoring";
import {
  knownStageDetails,
  missingStageFields,
  type ContactMethod,
  type FollowUpType,
  type HiringRange,
  type LeadStage,
  type LostReasonCode,
  type StageField,
} from "./stageRules";

/** A stage move and the details it carries (the stage route's body). */
export interface StageMove {
  status: LeadStage;
  contactMethod?: ContactMethod;
  contactedAt?: string;
  requirement?: string;
  expectedHiring?: HiringRange;
  expectedRevenue?: number;
  followUpAt?: string;
  followUpType?: FollowUpType;
  followUpNote?: string;
  wonValue?: number;
  wonAt?: string;
  lostReasonCode?: LostReasonCode;
  note?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Lead.lostReason's schema limit; the move's note itself may be longer. */
const LOST_REASON_MAX = 500;

/**
 * Dates a move cannot carry: a contact or a win that has not happened yet, or
 * a "next" follow-up already behind us. Contact and win dates get a day of
 * slack, because a date-only pick ("2026-10-02") parses as UTC midnight and
 * the agent's own "today" can sit on either side of it. A follow-up carries a
 * time, so an hour covers clock skew and a slow submit.
 */
export function invalidStageDates(move: Partial<StageMove>, now = new Date()): StageField[] {
  const at = (value?: string) => (value ? new Date(value).getTime() : null);
  const bad: StageField[] = [];
  const contacted = at(move.contactedAt);
  const won = at(move.wonAt);
  const followUp = at(move.followUpAt);
  if (contacted !== null && contacted > now.getTime() + DAY_MS) bad.push("contactedAt");
  if (won !== null && won > now.getTime() + DAY_MS) bad.push("wonAt");
  if (followUp !== null && followUp < now.getTime() - HOUR_MS) bad.push("followUpAt");
  return bad;
}

/** What stops this move: missing details, or dates that cannot be right. */
export function stageMoveProblems(
  lead: ILead,
  move: StageMove,
  now = new Date(),
): { missing: StageField[]; invalid: StageField[] } {
  const from = lead.status as LeadStage;
  return {
    missing: missingStageFields(from, move.status, move, knownStageDetails(lead)),
    invalid: invalidStageDates(move, now),
  };
}

/**
 * Apply a checked move to a lead document (the caller saves it). Shared by the
 * stage route, the bulk route and the Copilot tool, so a move made anywhere
 * leaves the same record: the details, a contact entry when one was made, the
 * outcome fields, a "stage_change" activity and a fresh score.
 */
export function applyStageMove(
  lead: ILead,
  move: StageMove,
  by?: Types.ObjectId,
  now = new Date(),
): { from: LeadStage; to: LeadStage } {
  const from = lead.status as LeadStage;
  const to = move.status;

  // Details the move carried are kept even where the stage did not insist on
  // them: the dialog only shows fields worth saving.
  if (move.requirement !== undefined) lead.requirement = move.requirement;
  if (move.expectedHiring !== undefined) lead.expectedHiring = move.expectedHiring;
  if (move.expectedRevenue !== undefined) lead.expectedRevenue = move.expectedRevenue;
  if (move.followUpAt !== undefined) {
    lead.followUpAt = new Date(move.followUpAt);
    // A new date alone (Copilot's "follow up in 3 days") keeps what the
    // follow-up is for; the dialog always sends both.
    if (move.followUpType !== undefined) lead.followUpType = move.followUpType;
    if (move.followUpNote !== undefined) lead.followUpNote = move.followUpNote;
    // A new date is a new reminder; the 20-hour cool-down belonged to the old one.
    lead.lastFollowupReminderAt = undefined;
  }
  if (move.contactMethod !== undefined) {
    const contactedAt = move.contactedAt ? new Date(move.contactedAt) : now;
    lead.lastContactedAt = contactedAt;
    lead.lastContactMethod = move.contactMethod;
    lead.activityLog.push({ action: move.contactMethod, timestamp: contactedAt, by });
  }

  // Leaving an outcome undoes it. A reopened Lost lead keeps no old reason
  // (its card would still say "Price"), and a lead taken back out of Won has
  // no final value or date — unless its employer account exists, which is a
  // conversion that happened whatever the board now says.
  if (from === "lost" && to !== "lost") {
    lead.lostReasonCode = undefined;
    lead.lostReason = undefined;
    lead.lostAt = undefined;
  }
  if (from === "converted" && to !== "converted" && !lead.convertedToEmployerId) {
    lead.wonValue = undefined;
    lead.convertedAt = undefined;
  }

  if (to === "converted") {
    if (move.wonValue !== undefined) lead.wonValue = move.wonValue;
    lead.convertedAt = move.wonAt ? new Date(move.wonAt) : (lead.convertedAt ?? now);
  }
  if (to === "lost") {
    if (move.lostReasonCode !== undefined) lead.lostReasonCode = move.lostReasonCode;
    // The field holds 500 characters; the whole note is on the stage_change entry.
    if (move.note !== undefined) lead.lostReason = move.note.slice(0, LOST_REASON_MAX);
    lead.lostAt = now;
  }

  lead.status = to;
  lead.activityLog.push({ action: "stage_change", fromStatus: from, toStatus: to, note: move.note, timestamp: now, by });

  lead.score = calculateLeadScore({
    status: to,
    hasEmail: Boolean(lead.contactEmail),
    hasPhone: Boolean(lead.contactPhone),
    hasExpectedRevenue: Boolean(lead.expectedRevenue),
    hasIndustry: Boolean(lead.industry),
    activityCount: lead.activityLog.length,
  });
  lead.qualificationLevel = deriveQualification(lead.score);

  return { from, to };
}
