/**
 * Shapes and parsers for the cookie-choice parts of Admin > GDPR > Consent
 * Logs: the count cards (GET /api/admin/gdpr/consent/summary), the grouped
 * choices table (GET /api/admin/gdpr/consent/choices), one consent record
 * (GET /api/admin/gdpr/consent/choices/[ref]) and the lookup of one choice by
 * its reference (GET /api/admin/gdpr/consent/receipt).
 *
 * Accepted all / Rejected all / custom is decided once, by the server's
 * cookieChoiceOutcome (lib/gdpr/cookieChoiceOutcome); the browser shows it.
 */
import {
  COOKIE_CHOICE_OUTCOMES,
  asCookieChoiceSource,
  cookieChoiceOutcome,
  type CookieChoiceOutcome,
  type CookieChoiceSource,
} from "@/lib/gdpr/cookieChoiceOutcome";

export type { CookieChoiceOutcome, CookieChoiceSource };
export { cookieChoiceOutcome };

/** One stored choice. The server never sends the text hash, an IP address or a user agent. */
export interface CookieChoiceReceipt {
  receiptId: string;
  preferences: boolean;
  media: boolean;
  version: number;
  locale: string;
  createdAt: string;
  /** Whether the banner text then shown is still today's text in that language. */
  wordingMatchesCurrent: boolean;
  /** Null on receipts written before the source was stored. */
  source: CookieChoiceSource | null;
}

export interface LinkedAccount {
  userId: string;
  userName: string;
  /** Null once the account has been erased; the log row keeps the name. */
  userEmail: string | null;
  /** Where the choice was made, from the account's log row. */
  source: CookieChoiceSource | null;
  /** False when the account had chosen before (this one changed it). */
  firstChoice: boolean;
}

export interface CookieChoiceLookupResult {
  receipts: CookieChoiceReceipt[];
  linkedAccount: LinkedAccount | null;
}

export interface CookieChoiceSummaryData {
  days: number;
  total: number;
  acceptedAll: number;
  rejectedAll: number;
  custom: number;
}

/** A click on a reference in the table. `nonce` makes a second click on the same reference run again. */
export interface CookieChoiceLookupRequest {
  reference: string;
  nonce: number;
}

/** One saved choice of a signed-in user: the two category rows folded into one. */
export interface CookieChoiceRow {
  userId: string;
  userName: string;
  userEmail: string | null;
  /** Null for a choice written before choice references existed. */
  receiptId: string | null;
  recordedAt: string;
  source: string | null;
  policyVersion: string | null;
  /** Null: that category was not recorded. */
  preferences: boolean | null;
  media: boolean | null;
  outcome: CookieChoiceOutcome;
}

export interface CookieChoicesPage {
  data: CookieChoiceRow[];
  total: number;
}

/** Another cookie choice by the same account, made before or after the one on show. */
export interface OtherCookieChoice {
  recordedAt: string;
  relation: "earlier" | "later";
  outcome: CookieChoiceOutcome;
  preferences: boolean | null;
  media: boolean | null;
  source: string | null;
}

export type ShownWording = "same" | "older" | "unknown";

export interface ConsentRecordDetails {
  record: CookieChoiceRow;
  status: "current" | "replaced";
  otherChoices: OtherCookieChoice[];
  wording: ShownWording;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBoolOrNull = (value: unknown): value is boolean | null => value === null || typeof value === "boolean";
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
const isOutcome = (value: unknown): value is CookieChoiceOutcome =>
  typeof value === "string" && (COOKIE_CHOICE_OUTCOMES as readonly string[]).includes(value);

function parseReceipt(raw: unknown): CookieChoiceReceipt | null {
  if (!isRecord(raw)) return null;
  const { receiptId, preferences, media, version, locale, createdAt, wordingMatchesCurrent, source } = raw;
  if (
    typeof receiptId !== "string" ||
    typeof preferences !== "boolean" ||
    typeof media !== "boolean" ||
    typeof version !== "number" ||
    typeof locale !== "string" ||
    typeof createdAt !== "string" ||
    typeof wordingMatchesCurrent !== "boolean"
  ) {
    return null;
  }
  return { receiptId, preferences, media, version, locale, createdAt, wordingMatchesCurrent, source: asCookieChoiceSource(source) };
}

/** Null for anything that is not the lookup answer, so a wrong answer shows as an error, not as "not found". */
export function parseLookupResult(raw: unknown): CookieChoiceLookupResult | null {
  if (!isRecord(raw) || !Array.isArray(raw.receipts)) return null;
  const receipts = raw.receipts.map(parseReceipt);
  if (receipts.some((r) => r === null)) return null;

  let linkedAccount: LinkedAccount | null = null;
  if (raw.linkedAccount != null) {
    const account = raw.linkedAccount;
    if (!isRecord(account) || typeof account.userId !== "string" || typeof account.userName !== "string") return null;
    linkedAccount = {
      userId: account.userId,
      userName: account.userName,
      userEmail: typeof account.userEmail === "string" ? account.userEmail : null,
      source: asCookieChoiceSource(account.source),
      firstChoice: account.firstChoice !== false,
    };
  }
  return { receipts: receipts as CookieChoiceReceipt[], linkedAccount };
}

/** Null for anything that is not the counts, so a wrong answer shows as an error, not as zeros. */
export function parseSummary(raw: unknown): CookieChoiceSummaryData | null {
  if (!isRecord(raw)) return null;
  const { days, total, acceptedAll, rejectedAll, custom } = raw;
  if (
    typeof days !== "number" ||
    typeof total !== "number" ||
    typeof acceptedAll !== "number" ||
    typeof rejectedAll !== "number" ||
    typeof custom !== "number"
  ) {
    return null;
  }
  return { days, total, acceptedAll, rejectedAll, custom };
}

function parseChoiceRow(raw: unknown): CookieChoiceRow | null {
  if (!isRecord(raw)) return null;
  const { userId, userName, userEmail, receiptId, recordedAt, source, policyVersion, preferences, media, outcome } = raw;
  if (
    typeof userId !== "string" ||
    typeof userName !== "string" ||
    !isStringOrNull(userEmail) ||
    !isStringOrNull(receiptId) ||
    typeof recordedAt !== "string" ||
    !isStringOrNull(source) ||
    !isStringOrNull(policyVersion) ||
    !isBoolOrNull(preferences) ||
    !isBoolOrNull(media) ||
    !isOutcome(outcome)
  ) {
    return null;
  }
  return { userId, userName, userEmail, receiptId, recordedAt, source, policyVersion, preferences, media, outcome };
}

/** Null for anything that is not a page of choices. */
export function parseChoicesPage(raw: unknown): CookieChoicesPage | null {
  if (!isRecord(raw) || !Array.isArray(raw.data) || typeof raw.total !== "number") return null;
  const data = raw.data.map(parseChoiceRow);
  if (data.some((row) => row === null)) return null;
  return { data: data as CookieChoiceRow[], total: raw.total };
}

function parseOtherChoice(raw: unknown): OtherCookieChoice | null {
  if (!isRecord(raw)) return null;
  const { recordedAt, relation, outcome, preferences, media, source } = raw;
  if (
    typeof recordedAt !== "string" ||
    (relation !== "earlier" && relation !== "later") ||
    !isOutcome(outcome) ||
    !isBoolOrNull(preferences) ||
    !isBoolOrNull(media) ||
    !isStringOrNull(source)
  ) {
    return null;
  }
  return { recordedAt, relation, outcome, preferences, media, source };
}

/** Null for anything that is not one consent record. */
export function parseConsentRecord(raw: unknown): ConsentRecordDetails | null {
  if (!isRecord(raw) || !Array.isArray(raw.otherChoices)) return null;
  const record = parseChoiceRow(raw.record);
  const otherChoices = raw.otherChoices.map(parseOtherChoice);
  const { status, wording } = raw;
  if (!record || otherChoices.some((c) => c === null)) return null;
  if (status !== "current" && status !== "replaced") return null;
  if (wording !== "same" && wording !== "older" && wording !== "unknown") return null;
  return { record, status, otherChoices: otherChoices as OtherCookieChoice[], wording };
}
