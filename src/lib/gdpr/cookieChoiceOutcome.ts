/**
 * What a cookie choice was, in one place: Accepted all, Rejected all or a
 * custom choice. The admin counts (from ConsentReceipt), the grouped choices
 * table (from ConsentLog, as a database filter) and the browser all read it
 * from here, so the three can never disagree.
 *
 * Derived from the two optional categories only: a receipt does not record
 * which button was pressed, so "Save choices" with both off is Rejected all.
 * A category with no stored value (a signed-in choice whose second log row was
 * never written) is null, and such a choice is always custom.
 *
 * Also where a choice can be made and the periods the admin counts and table
 * can cover. Pure and client-safe.
 */

export const COOKIE_CHOICE_OUTCOMES = ["accepted", "rejected", "custom"] as const;
export type CookieChoiceOutcome = (typeof COOKIE_CHOICE_OUTCOMES)[number];

export interface CookieChoiceCategories {
  /** Display settings (Preferences); null when it was not recorded. */
  preferences: boolean | null;
  /** YouTube videos (Media); null when it was not recorded. */
  media: boolean | null;
}

export function cookieChoiceOutcome(choice: CookieChoiceCategories): CookieChoiceOutcome {
  if (choice.preferences === true && choice.media === true) return "accepted";
  if (choice.preferences === false && choice.media === false) return "rejected";
  return "custom";
}

const ACCEPTED = { preferences: true, media: true } as const;
const REJECTED = { preferences: false, media: false } as const;

/**
 * The same decision as a MongoDB filter on documents with `preferences` and
 * `media` fields (a ConsentReceipt, or a grouped ConsentLog choice), so a page
 * of one outcome can be cut in the database.
 */
export function cookieChoiceOutcomeFilter(outcome: CookieChoiceOutcome): Record<string, unknown> {
  if (outcome === "accepted") return { ...ACCEPTED };
  if (outcome === "rejected") return { ...REJECTED };
  return { $nor: [{ ...ACCEPTED }, { ...REJECTED }] };
}

/** Where a choice was made: the cookie banner or the Cookie settings dialog. */
export const COOKIE_CHOICE_SOURCES = ["banner", "settings"] as const;
export type CookieChoiceSource = (typeof COOKIE_CHOICE_SOURCES)[number];

/** A stored source, or null for anything else (receipts written before the source was stored have none). */
export function asCookieChoiceSource(value: unknown): CookieChoiceSource | null {
  return value === "banner" || value === "settings" ? value : null;
}

/** The windows the admin can pick: the last 7, 30 or 90 days, or 12 months. */
export const COOKIE_CHOICE_PERIODS = [7, 30, 90, 365] as const;
export type CookieChoicePeriod = (typeof COOKIE_CHOICE_PERIODS)[number];
export const DEFAULT_COOKIE_CHOICE_PERIOD: CookieChoicePeriod = 30;

export function isCookieChoicePeriod(days: number): days is CookieChoicePeriod {
  return (COOKIE_CHOICE_PERIODS as readonly number[]).includes(days);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of a rolling window: whole 24-hour days back from `now`. */
export function periodStart(days: CookieChoicePeriod, now: number = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}
