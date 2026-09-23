/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used here to fail fast on missing/invalid environment configuration.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only validate in the Node.js runtime (skip Edge, where some secrets are absent).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    const { default: logger } = await import("@/lib/logger");

    // Validate critical environment variables at boot
    validateEnv();

    // Warn if optional rate-limiting configuration is missing
    if (!process.env.UPSTASH_REDIS_REST_URL) {
      logger.warn(
        "UPSTASH_REDIS_REST_URL not configured — rate limiting degraded"
      );
    }

    // Optional in production, but each gap should be a conscious choice.
    if (process.env.NODE_ENV === "production") {
      if (!process.env.MALWARE_SCAN_URL) {
        logger.warn("MALWARE_SCAN_URL not configured — uploads only get the local EICAR check");
      }
      if (!process.env.ERROR_ALERT_WEBHOOK_URL) {
        logger.warn("ERROR_ALERT_WEBHOOK_URL not configured — errors are logged but nobody is alerted");
      }
    }
  }
}

/**
 * Centralized server-side error reporting for the App Router.
 * Next.js invokes this for every uncaught error in Server Components, route
 * handlers, and middleware. Logged via the structured pino logger (with PII
 * redaction); forward to an error-tracking SDK here when one is configured.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; renderSource?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { default: logger } = await import("@/lib/logger");
  logger.error(
    {
      err,
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      renderSource: context.renderSource,
    },
    "Unhandled server request error",
  );
  const { sendErrorAlert } = await import("@/lib/observability/alert");
  const name = err instanceof Error ? err.name : "Error";
  const message = err instanceof Error ? err.message : String(err);
  // Not awaited: Next waits for this hook before sending the error response,
  // and a slow webhook must not add latency to every 500 during an incident.
  void sendErrorAlert(
    `server:${request.method} ${context.routePath} ${name}`,
    `Server error: ${request.method} ${context.routePath} — ${name}: ${message}`,
  );
}

