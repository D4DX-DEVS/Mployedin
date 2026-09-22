/**
 * Client-side notification text resolver.
 *
 * Notifications are stored with an English literal `title`/`body` (used for
 * email/WhatsApp and as a fallback) plus optional `meta.titleKey`,
 * `meta.bodyKey`, and `meta.params` for localized rendering.
 *
 * This resolver translates the keys via the `notificationContent` namespace and
 * falls back to the stored literal text when keys are missing (legacy docs).
 */

import {
  FALLBACK_TIME_ZONE,
  formatZonedDateTime,
  isValidTimeZone,
} from "@/lib/datetime/zone";

type Translator = {
  (key: string, values?: Record<string, string | number | Date>): string;
  has: (key: string) => boolean;
};

interface RawNotification {
  title: string;
  body: string;
  meta?: Record<string, unknown> | null;
}

export function resolveNotificationText(
  n: RawNotification,
  tc: Translator,
  locale: string,
): { title: string; body: string } {
  const meta = (n.meta ?? {}) as Record<string, unknown>;
  const titleKey = typeof meta.titleKey === "string" ? meta.titleKey : undefined;
  const bodyKey = typeof meta.bodyKey === "string" ? meta.bodyKey : undefined;

  if (!titleKey && !bodyKey) {
    return { title: n.title, body: n.body };
  }

  const rawParams = (meta.params ?? {}) as Record<string, unknown>;
  const params: Record<string, string | number | Date> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string" || typeof value === "number") {
      params[key] = value;
    }
  }

  // Localize a raw status id (e.g. "shortlisted" -> translated label)
  if (typeof rawParams.status === "string") {
    const statusKey = `status_${rawParams.status}`;
    params.status = tc.has(statusKey) ? tc(statusKey) : rawParams.status.replace(/_/g, " ");
  }

  // Localize a score-label key (e.g. "scoreExcellent")
  if (typeof rawParams.scoreLabelKey === "string" && tc.has(rawParams.scoreLabelKey)) {
    params.scoreLabel = tc(rawParams.scoreLabelKey);
  }

  // Format an ISO date param in the zone the notification recorded for its
  // recipient. Rows written before that param existed were composed in
  // FALLBACK_TIME_ZONE, so falling back to it keeps them reading as written —
  // and keeps this deterministic, which the server pre-render requires.
  if (typeof rawParams.dateIso === "string") {
    const timeZone =
      typeof rawParams.timeZone === "string" && isValidTimeZone(rawParams.timeZone)
        ? rawParams.timeZone
        : FALLBACK_TIME_ZONE;
    // Only assign on success: an unparseable value leaves `date` unset, which
    // is what this did before. Changing that copy is a separate question.
    const formatted = formatZonedDateTime(rawParams.dateIso, { timeZone, locale });
    if (formatted) params.date = formatted;
  }

  const title = titleKey && tc.has(titleKey) ? tc(titleKey, params) : n.title;
  const body = bodyKey && tc.has(bodyKey) ? tc(bodyKey, params) : n.body;
  return { title, body };
}

/**
 * Notification `actionUrl`s are stored without a locale segment ("/agent/leads").
 * Prefixing keeps the reader in the language they were already using instead of
 * bouncing through the locale redirect.
 */
export function localizeActionUrl(actionUrl: string | undefined, locale: string): string | null {
  if (!actionUrl) return null;
  if (!actionUrl.startsWith("/")) return null;
  if (actionUrl === `/${locale}` || actionUrl.startsWith(`/${locale}/`)) return actionUrl;
  return `/${locale}${actionUrl}`;
}
