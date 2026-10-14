import type { ExhibitionPriority } from "@/models/ExhibitionRequest";

/**
 * How priority is set (client feedback 2026-10-14: "what is the criteria of
 * priority and who sets it?"). Every request used to be saved as Medium with
 * no field to change it. Now the agent picks it on the request, guided by the
 * suggestion below; the super agent and the admin can change it at review,
 * and each change is recorded in the request's history.
 *
 * The suggestion is a rule of thumb from the two facts the request carries:
 * how soon the event is and how many leads the agent expects.
 */
export const PRIORITY_ORDER: ExhibitionPriority[] = ["low", "medium", "high", "critical"];

export interface PrioritySuggestion {
  priority: ExhibitionPriority;
  /** Days until the event starts, when it has a date. */
  daysUntil: number | null;
  reason: "soon" | "thisMonth" | "manyLeads" | "noDate" | "standard";
}

export const CRITICAL_WITHIN_DAYS = 7;
export const HIGH_WITHIN_DAYS = 30;
export const HIGH_LEADS = 100;

export function suggestPriority(
  eventStartDate: string | Date | undefined | null,
  expectedLeads: number | string | undefined | null,
  now: Date = new Date(),
): PrioritySuggestion {
  const start = eventStartDate ? new Date(eventStartDate) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const daysUntil = valid ? Math.ceil((start.getTime() - now.getTime()) / 86_400_000) : null;
  const leads = Number(expectedLeads) || 0;

  if (daysUntil !== null && daysUntil <= CRITICAL_WITHIN_DAYS) return { priority: "critical", daysUntil, reason: "soon" };
  if (daysUntil !== null && daysUntil <= HIGH_WITHIN_DAYS) return { priority: "high", daysUntil, reason: "thisMonth" };
  if (leads >= HIGH_LEADS) return { priority: "high", daysUntil, reason: "manyLeads" };
  if (daysUntil === null) return { priority: "low", daysUntil, reason: "noDate" };
  return { priority: "medium", daysUntil, reason: "standard" };
}
