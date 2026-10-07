/**
 * Last line of defence for MCP reports. Every report is already built from an
 * explicit list of aggregate fields; this pass runs on the finished object
 * anyway, so a field added upstream later (a populated name, an id, a link,
 * an amount) can never reach the AI client.
 *
 * Owner rule (2026-10-07): reports carry numbers, statuses, dates and job
 * titles — never a person's or company's name, contact detail, id, link or
 * any money figure.
 */

/** Keys ending in a word that identifies or contacts a person or company: fullName, cvUrl, username. */
const PERSONAL_KEY = /(name|address|avatar|photo|logo|resume|url|link|token|password)$/i;
/** Contact fields under any spelling: phoneNumber, mobileNo, whatsappVerified, emailAddress… */
const CONTACT_KEY = /phone|mobile|whatsapp|email/i;

/** `id`, `_id`, and camelCase `...Id` / `...Ids` (capital I, so "paid" survives). */
const ID_KEY = /^_?id$|Ids?$/;

/** The same personal words anywhere in a camelCase key: nameAr, addressLine1, tokenHash. */
const PERSONAL_WORDS = new Set([
  "name", "names", "address", "addresses", "avatar", "photo", "logo", "resume", "url", "link", "links",
  "token", "password",
]);
/** Money words anywhere in a camelCase key: pendingCommissions, revenueThisMonth, avgSalary. */
const MONEY_WORDS = new Set([
  "revenue", "commission", "commissions", "amount", "amounts", "currency", "salary", "salaries", "price",
  "prices", "invoice", "invoices", "mrr", "payout", "payouts", "payment", "payments", "earning", "earnings",
  "fee", "fees", "cost", "costs", "budget", "budgets", "refund", "refunds", "wage", "wages", "balance",
  "collected", "outstanding",
]);

/** Job titles are the one kind of name the owner allowed. */
const ALLOWED_KEYS = new Set(["jobTitle", "title"]);

const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** A digit, six or more digits or separators (space, dash, dot, brackets), then a digit. */
const PHONE_VALUE = /\+?\d[\d\s().-]{6,}\d/g;
/** "2024-2025" and "2024/25" match the phone pattern but are intake years, not numbers to hide. */
const YEAR_RANGE = /^(19|20)\d{2}\s*[-/]\s*((19|20)\d{2}|\d{2})$/;
/** Web addresses. `.net` is left out on purpose: "ASP.NET Developer" is a job title. */
const LINK_VALUE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(?:com|org|io|ae|sa|qa|co|in|uk)\b(?:\/\S*)?/gi;
const CURRENCY = "(?:AED|USD|SAR|QAR|KWD|OMR|BHD|EUR|GBP|INR|PKR|EGP|Dhs?)";
/** "AED 3,000", "$5k", "3000 AED". */
const MONEY_VALUE = new RegExp(
  `(?:\\b${CURRENCY}\\.?|[$€£₹])\\s?\\d[\\d,.]*\\s?[km]?\\b|\\b\\d[\\d,.]*\\s?[km]?\\s?${CURRENCY}\\b`,
  "gi",
);
/** ISO dates and timestamps look like phone numbers to the pattern above. */
const ISO_DATE_VALUE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const HIDDEN = "[hidden]";
const REMOVED = Symbol("removed");

/** camelCase / snake_case / digit-separated words of a key, lower-cased: "addressLine1" → ["address", "line"]. */
function keyWords(key: string): string[] {
  return key
    .split(/(?<=[a-z0-9])(?=[A-Z])|[^A-Za-z]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function isBlockedKey(key: string): boolean {
  if (ALLOWED_KEYS.has(key)) return false;
  if (PERSONAL_KEY.test(key) || CONTACT_KEY.test(key) || ID_KEY.test(key)) return true;
  return keyWords(key).some((word) => PERSONAL_WORDS.has(word) || MONEY_WORDS.has(word));
}

/** Masks contact details, links and amounts inside free text such as a job title. */
function maskText(value: string): string {
  return value
    .replace(EMAIL_VALUE, HIDDEN)
    .replace(LINK_VALUE, HIDDEN)
    .replace(MONEY_VALUE, HIDDEN)
    .replace(PHONE_VALUE, (match) => (YEAR_RANGE.test(match.trim()) ? match : HIDDEN));
}

function clean(value: unknown): unknown {
  // A section left out (undefined) is dropped; null means "no data yet" and is kept.
  if (value === undefined) return REMOVED;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return ISO_DATE_VALUE.test(value) ? value : maskText(value);
  if (Array.isArray(value)) {
    return value.map(clean).filter((item) => item !== REMOVED);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isBlockedKey(key)) continue;
      const cleaned = clean(child);
      if (cleaned !== REMOVED) out[key] = cleaned;
    }
    return out;
  }
  // Functions, symbols, bigint: nothing a report should carry.
  return REMOVED;
}

/**
 * Deep copy of `value` without personal or money keys, with email addresses,
 * phone numbers, links and amounts inside text replaced by "[hidden]". Dates
 * become ISO strings; nulls are kept (they mean "no data yet"); undefined
 * fields are dropped.
 */
export function sanitizeReport(value: unknown): unknown {
  const cleaned = clean(value);
  return cleaned === REMOVED ? null : cleaned;
}
