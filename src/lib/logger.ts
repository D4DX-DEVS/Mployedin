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

const logger = pino({
  level: isDev ? "debug" : "info",
  // In production emit JSON; in development use human-readable output
  ...(isDev && {
    transport: {
      target: "pino/file",
      options: { destination: 1 }, // stdout with newline-delimited JSON (pretty not available at runtime without pino-pretty)
    },
  }),
  base: { service: "mployedin" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Never log these fields — strip silently
    paths: ["password", "passwordHash", "token", "refreshToken", "idToken", "nationalId", "passportNumber", "iban", "bankAccountNumber"],
    censor: "[REDACTED]",
  },
});

export default logger;
