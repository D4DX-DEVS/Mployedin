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

const WHATSAPP_GROUP = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
] as const;

/**
 * WhatsApp keys are all-or-nothing: with only some of them set the adapter
 * would run live and fail on its first call (or accept unsigned webhooks).
 * WHATSAPP_BUSINESS_ACCOUNT_ID is deliberately not in the group — without it
 * only template sync is unavailable (instrumentation warns).
 */
function whatsAppGroupErrors(env: Record<string, string | undefined>): string[] {
  const anySet = Object.keys(env).some((k) => k.startsWith("WHATSAPP_") && env[k]);
  if (!anySet) return [];
  return WHATSAPP_GROUP.filter((k) => !env[k]).map(
    (k) => `WhatsApp is partially configured: missing ${k} (set all of ${WHATSAPP_GROUP.join(", ")} or none)`,
  );
}

const SES_GROUP = ["SES_REGION", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_FROM_EMAIL"] as const;

/**
 * EMAIL_PROVIDER=ses with a SES_* value missing (or blank) does not stop the
 * server: mail falls back to the SMTP env chain (resolveTransport step 4), and
 * the env SES tier only applies when the admin saved no provider anyway. So it
 * is a warning, read the way resolveTransport reads it: trimmed, in any case.
 */
function sesGroupWarnings(env: Record<string, string | undefined>): string[] {
  if (env.EMAIL_PROVIDER?.trim().toLowerCase() !== "ses") return [];
  return SES_GROUP.filter((k) => !env[k]?.trim()).map(
    (k) => `EMAIL_PROVIDER=ses but ${k} is missing: the env SES fallback is off until all of ${SES_GROUP.join(", ")} are set`,
  );
}

/** Configuration gaps that do not stop the server; instrumentation logs them at boot. */
export function collectEnvWarnings(env: Record<string, string | undefined> = process.env): string[] {
  return sesGroupWarnings(env);
}

/** Every configuration problem, so misconfiguration is fixed in one pass. */
export function collectEnvErrors(env: Record<string, string | undefined> = process.env): string[] {
  const errors: string[] = [];
  for (const check of CHECKS) {
    const value = env[check.name];
    if (!value) {
      if (check.required) errors.push(`Missing required env var: ${check.name}`);
      continue;
    }
    const msg = check.validate?.(value);
    if (msg) errors.push(msg);
  }
  errors.push(...whatsAppGroupErrors(env));
  return errors;
}

/**
 * Validates required environment variables. Throws an aggregated error listing
 * every problem. Idempotent.
 */
export function validateEnv(): void {
  if (validated) return;
  const errors = collectEnvErrors();
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join("\n  - ")}`);
  }
  validated = true;
}
