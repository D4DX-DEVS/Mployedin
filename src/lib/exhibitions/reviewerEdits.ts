import { EXHIBITION_CATEGORIES, type ExhibitionCategory } from "@/models/ExhibitionRequest";

/**
 * Input checks for the two reviewer/agent writes added on 2026-10-14: a
 * reviewer correcting a request's facts, and the agent's completion report.
 * Each returns either the clean value or a message the caller shows as-is.
 */

type Result<T> = { value: T } | { error: string };

export interface ReviewerEdits {
  eventName?: string;
  eventCategory?: ExhibitionCategory;
  eventLocation?: string;
  venue?: string | null;
  country?: string | null;
  eventStartDate?: Date | null;
  eventEndDate?: Date | null;
  organizerName?: string | null;
  organizerContact?: string | null;
  description?: string | null;
  expectedLeads?: number | null;
}

const TEXT_LIMITS: Record<string, number> = {
  eventLocation: 300,
  venue: 300,
  country: 100,
  organizerName: 200,
  organizerContact: 200,
  description: 5000,
};

const MAX_LEADS = 100_000;

function parseLeads(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === "" || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_LEADS) return "invalid";
  return n;
}

function parseDate(raw: unknown): Date | null | "invalid" {
  if (raw === null || raw === "") return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** Only the listed fields; anything else in `details` is ignored. */
export function parseReviewerEdits(details: unknown): Result<ReviewerEdits> {
  if (!details || typeof details !== "object") return { error: "Nothing to save." };
  const input = details as Record<string, unknown>;
  const out: ReviewerEdits = {};

  if (input.eventName !== undefined) {
    const name = String(input.eventName ?? "").trim();
    if (!name) return { error: "The exhibition needs a title." };
    if (name.length > 200) return { error: "Keep the title under 200 characters." };
    out.eventName = name;
  }
  if (input.eventCategory !== undefined) {
    if (!EXHIBITION_CATEGORIES.includes(input.eventCategory as ExhibitionCategory)) return { error: "Choose a valid event type." };
    out.eventCategory = input.eventCategory as ExhibitionCategory;
  }
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (input[field] === undefined) continue;
    const text = String(input[field] ?? "").trim();
    if (text.length > max) return { error: `Keep ${field} under ${max} characters.` };
    (out as Record<string, unknown>)[field] = field === "eventLocation" ? text || "TBD" : text || null;
  }
  for (const field of ["eventStartDate", "eventEndDate"] as const) {
    if (input[field] === undefined) continue;
    const parsed = parseDate(input[field]);
    if (parsed === "invalid") return { error: "Enter a valid date." };
    out[field] = parsed;
  }
  if (out.eventStartDate && out.eventEndDate && out.eventEndDate < out.eventStartDate) {
    return { error: "The end date can't be before the start date." };
  }
  if (input.expectedLeads !== undefined) {
    const leads = parseLeads(input.expectedLeads);
    if (leads === "invalid") return { error: `Expected leads must be a whole number from 0 to ${MAX_LEADS.toLocaleString("en")}.` };
    out.expectedLeads = leads;
  }
  return { value: out };
}

export interface CompletionReportInput {
  actualLeads?: number;
  summary?: string;
}

export function parseCompletionReport(raw: unknown): Result<CompletionReportInput> {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: CompletionReportInput = {};
  const leads = parseLeads(input.actualLeads);
  if (leads === "invalid") return { error: `Leads collected must be a whole number from 0 to ${MAX_LEADS.toLocaleString("en")}.` };
  if (leads !== null) out.actualLeads = leads;
  if (input.summary !== undefined && input.summary !== null) {
    const summary = String(input.summary).trim();
    if (summary.length > 2000) return { error: "Keep the summary under 2000 characters." };
    if (summary) out.summary = summary;
  }
  return { value: out };
}
