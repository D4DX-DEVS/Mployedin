import { formatList } from "@/lib/i18n/formatList";

/**
 * An error whose message was written for the person on screen: translated,
 * specific, actionable ("Password must be at least 12 characters long. This
 * one has 8."). Form shells such as CrudModal display it verbatim.
 *
 * Any other exception (network failure, JSON parse, bug) keeps the generic
 * "We couldn't save your changes" copy, so raw stack text never reaches the UI.
 */
export class FormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isFormError(error: unknown): error is FormError {
  return error instanceof FormError;
}

/** Translator scoped to the shared `formErrors` message namespace. */
export type FormErrorTranslate = (key: string, vars?: Record<string, string | number>) => string;

export interface FormErrorOptions {
  /** `useTranslations("formErrors")`. */
  t: FormErrorTranslate;
  /** Active locale, for list joining ("a, b, and c" vs "a وb وc"). */
  locale: string;
  /**
   * Field name → translated label, used to say *which* fields the server
   * rejected. Accepts a CrudModal `fields` array or a plain record.
   */
  fieldLabels?: Record<string, string> | ReadonlyArray<{ name: string; label: string }>;
  /** Copy for a 409, e.g. `t("emailInUse")`. Defaults to `t("conflict")`. */
  conflict?: string;
}

interface ApiErrorBody {
  error?: unknown;
  details?: unknown;
}

function toLabelMap(labels: FormErrorOptions["fieldLabels"]): Record<string, string> {
  if (!labels) return {};
  if (Array.isArray(labels)) {
    return Object.fromEntries((labels as ReadonlyArray<{ name: string; label: string }>).map((f) => [f.name, f.label]));
  }
  return labels as Record<string, string>;
}

/** "currencyCode" → "Currency code"; "address.city" → "Address". */
function humanizePath(path: string): string {
  const head = path.split(".")[0] ?? path;
  const spaced = head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function rejectedFields(details: unknown, labels: Record<string, string>): string[] {
  if (!Array.isArray(details)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of details) {
    const path = item && typeof item === "object" ? (item as { path?: unknown }).path : undefined;
    if (typeof path !== "string" || !path) continue;
    const head = path.split(".")[0] ?? path;
    const label = labels[path] ?? labels[head] ?? humanizePath(path);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Turn a failed fetch Response into a FormError with translated, actionable
 * copy chosen by status:
 *   409 → conflict (or the caller's specific copy, e.g. "email already used")
 *   400/422 → "Check these fields: Phone, Email" using the form's own labels
 *   401/403 → permission · 404 → notFound · 429 → rateLimit · else → fallback
 *
 * Raw server strings are never shown; the server's zod messages are English
 * and would be wrong in an Arabic UI.
 */
export async function formErrorFromResponse(res: Response, opts: FormErrorOptions): Promise<FormError> {
  const { t, locale } = opts;
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  const status = res.status;

  if (status === 409) return new FormError(opts.conflict ?? t("conflict"));
  if (status === 401 || status === 403) return new FormError(t("permission"));
  if (status === 404) return new FormError(t("notFound"));
  if (status === 429) return new FormError(t("rateLimit"));
  if (status === 400 || status === 422) {
    const fields = rejectedFields(body.details, toLabelMap(opts.fieldLabels));
    return new FormError(fields.length > 0 ? t("invalidFields", { fields: formatList(fields, locale) }) : t("invalid"));
  }
  return new FormError(t("fallback"));
}
