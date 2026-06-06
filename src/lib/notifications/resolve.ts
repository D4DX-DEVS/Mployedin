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

  // Format an ISO date param using the active locale
  if (typeof rawParams.dateIso === "string") {
    const parsed = new Date(rawParams.dateIso);
    if (!Number.isNaN(parsed.getTime())) {
      params.date = parsed.toLocaleString(locale === "ar" ? "ar" : "en-AE", {
        timeZone: "Asia/Dubai",
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
  }

  const title = titleKey && tc.has(titleKey) ? tc(titleKey, params) : n.title;
  const body = bodyKey && tc.has(bodyKey) ? tc(bodyKey, params) : n.body;
  return { title, body };
}
