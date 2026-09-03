/**
 * Centralized environment-variable validation.
 *
 * Call validateEnv() once at server startup (see src/instrumentation.ts) so the
 * process fails fast with a clear message instead of throwing deep inside a
 * request handler when a required secret is missing or malformed.
 */

interface EnvCheck {
  name: string;
  required: boolean;
  /** Optional extra validation; return an error message string when invalid. */
  validate?: (value: string) => string | null;
}

const CHECKS: EnvCheck[] = [
  { name: "MONGODB_URI", required: true },
  {
    name: "NEXTAUTH_SECRET",
    required: true,
    validate: (v) =>
      v.length < 32
        ? "NEXTAUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 32"
        : null,
  },
  {
    name: "ENCRYPTION_KEY",
    required: true,
    validate: (v) =>
      !/^[0-9a-fA-F]{64}$/.test(v)
        ? "ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        : null,
  },
  {
    // All 16 cron routes reject every call when this is unset (verifyCronRequest
    // fails closed with 500). Validate at boot so a missing secret surfaces at
    // deploy time instead of silently breaking scheduled jobs in production.
    name: "CRON_SECRET",
    required: true,
    validate: (v) =>
      v.length < 16
        ? "CRON_SECRET must be at least 16 characters. Generate with: openssl rand -base64 24"
        : null,
  },
  // Storage creds: spaces.ts falls back to "" so a missing key only surfaces as
  // runtime upload failures deep in request handlers. Required in production
  // (CV upload is a core flow); optional in dev where storage may be absent.
  { name: "SPACES_ACCESS_KEY_ID", required: process.env.NODE_ENV === "production" },
  { name: "SPACES_SECRET_ACCESS_KEY", required: process.env.NODE_ENV === "production" },
  // Rate limiting silently degrades to a per-instance in-memory store when
  // Upstash is unset — fine for dev/test, but in production that means login
  // and API throttles reset on every instance and never apply across replicas.
  // Fail at boot instead of shipping with no effective rate limit.
  { name: "UPSTASH_REDIS_REST_URL", required: process.env.NODE_ENV === "production" },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: process.env.NODE_ENV === "production" },
];

let validated = false;

/**
 * Validates required environment variables. Throws an aggregated error listing
 * every problem so misconfiguration is fixed in one pass. Idempotent.
 */
export function validateEnv(): void {
  if (validated) return;

  const errors: string[] = [];

  for (const check of CHECKS) {
    const value = process.env[check.name];
    if (!value) {
      if (check.required) errors.push(`Missing required env var: ${check.name}`);
      continue;
    }
    const msg = check.validate?.(value);
    if (msg) errors.push(msg);
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n  - ${errors.join("\n  - ")}`,
    );
  }

  validated = true;
}
