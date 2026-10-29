/** What GET /api/admin/gdpr/consent/entries/[id] sends, checked before the details dialog shows it. */

export interface OtherConsentEntry {
  _id: string;
  userName: string;
  userEmail: string | null;
  consentType: string;
  granted: boolean;
  timestamp: string;
  source: string | null;
  policyVersion: string | null;
}

export interface OtherConsentHistoryItem {
  _id: string;
  timestamp: string;
  relation: "earlier" | "later";
  granted: boolean;
  source: string | null;
  policyVersion: string | null;
}

export interface OtherConsentDetails {
  entry: OtherConsentEntry;
  status: "current" | "replaced";
  /** Terms rows only: whether it accepted the version in force today. */
  termsVersion: "current" | "older" | null;
  history: OtherConsentHistoryItem[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function parseHistoryItem(value: unknown): OtherConsentHistoryItem | null {
  if (!isObject(value) || typeof value._id !== "string" || typeof value.timestamp !== "string") return null;
  return {
    _id: value._id,
    timestamp: value.timestamp,
    relation: value.relation === "later" ? "later" : "earlier",
    granted: value.granted === true,
    source: text(value.source),
    policyVersion: text(value.policyVersion),
  };
}

/** The response, or null when it is not the expected shape (the dialog then shows its error state). */
export function parseOtherConsentDetails(value: unknown): OtherConsentDetails | null {
  if (!isObject(value) || !isObject(value.entry) || !Array.isArray(value.history)) return null;
  const e = value.entry;
  if (typeof e._id !== "string" || typeof e.consentType !== "string" || typeof e.timestamp !== "string") return null;
  const history = value.history.map(parseHistoryItem);
  if (history.some((item) => item === null)) return null;
  return {
    entry: {
      _id: e._id,
      userName: text(e.userName) ?? "Unknown",
      userEmail: text(e.userEmail),
      consentType: e.consentType,
      granted: e.granted === true,
      timestamp: e.timestamp,
      source: text(e.source),
      policyVersion: text(e.policyVersion),
    },
    status: value.status === "replaced" ? "replaced" : "current",
    termsVersion: value.termsVersion === "current" || value.termsVersion === "older" ? value.termsVersion : null,
    history: history as OtherConsentHistoryItem[],
  };
}
