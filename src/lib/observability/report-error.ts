/**
 * Centralized client-side error reporting.
 *
 * Safe to import in Client Components (no Node-only deps). Always logs to the
 * console so failures are visible during development. When an error-tracking
 * SDK (e.g. Sentry) is wired up later, it is forwarded automatically — until
 * then this is a harmless no-op beyond the console log.
 *
 * To enable Sentry later:
 *   1. Install @sentry/nextjs and initialize it (sets window.Sentry).
 *   2. Set NEXT_PUBLIC_SENTRY_DSN.
 * No call sites need to change.
 */

interface SentryLike {
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
}

type GlobalWithSentry = typeof globalThis & { Sentry?: SentryLike };

export interface ErrorContext {
  /** Where the error was caught, e.g. "dashboard-boundary". */
  source?: string;
  /** Next.js error digest, when available. */
  digest?: string;
  /** Any additional structured context. */
  [key: string]: unknown;
}

/**
 * Report a client-side error. Logs to the console and forwards to an
 * error-tracking SDK when one is present and a DSN is configured.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const label = context.source ? `[${context.source}]` : "[error]";
   
  console.error(label, error, context);

  const sentry = (globalThis as GlobalWithSentry).Sentry;
  if (sentry && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      sentry.captureException(error, { extra: context });
    } catch {
      /* never let reporting throw */
    }
  }

  sendToServer(error, context);
}

// A boundary re-renders; report each distinct error once per page load.
const sent = new Set<string>();

/** Forward to /api/client-errors so the crash lands in the server log (and alerts). */
function sendToServer(error: unknown, context: ErrorContext): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const message = error instanceof Error ? error.message : String(error);
  const key = `${context.source ?? ""}|${context.digest ?? ""}|${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
    fetch("/api/client-errors", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(csrf) },
      body: JSON.stringify({
        message,
        stack: error instanceof Error ? error.stack : undefined,
        source: context.source,
        digest: context.digest,
        url: window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    /* never let reporting throw */
  }
}
