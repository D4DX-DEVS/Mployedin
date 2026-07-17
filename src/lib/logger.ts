/**
 * Structured logger using pino.
 *
 * Usage:
 *   import logger from "@/lib/logger";
 *   logger.info("connected");
 *   logger.warn({ userId }, "rate limit hit");
 *   logger.error({ err }, "unhandled error");
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

// Reuse a single logger across Next.js dev HMR reloads. Otherwise every hot reload
// re-evaluates this module and creates a new pino stream, stacking unpipe/error/close
// listeners on the stdout WriteStream until Node warns of a leak
// (MaxListenersExceededWarning). The default pino stream already writes newline-delimited
// JSON to stdout — no transport worker needed.
const globalForLogger = globalThis as unknown as { __mployedinLogger?: pino.Logger };

const logger =
  globalForLogger.__mployedinLogger ??
  pino({
    level: isDev ? "debug" : "info",
    base: { service: "mployedin" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      // Never log these fields — strip silently
      paths: ["password", "passwordHash", "token", "refreshToken", "idToken", "nationalId", "passportNumber", "iban", "bankAccountNumber"],
      censor: "[REDACTED]",
    },
  });

globalForLogger.__mployedinLogger = logger;

export default logger;
