/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used here to fail fast on missing/invalid environment configuration.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only validate in the Node.js runtime (skip Edge, where some secrets are absent).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
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
}

