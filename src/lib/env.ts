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
  // Client-IP trust (src/lib/security/clientIp.ts). Both optional; without
  // either (or VERCEL=1) IP rate limits fall back to spoofable per-client keys.
  // TRUST_CLOUDFLARE=1 only when the origin is reachable solely via Cloudflare.
  {
    name: "TRUST_CLOUDFLARE",
    required: false,
    validate: (v) => (v === "0" || v === "1" ? null : 'TRUST_CLOUDFLARE must be "0" or "1".'),
  },
  {
    // Number of reverse proxies in front of the app that append to X-Forwarded-For.
    name: "TRUSTED_PROXY_HOPS",
    required: false,
    validate: (v) => (/^\d+$/.test(v) ? null : "TRUSTED_PROXY_HOPS must be a non-negative integer."),
  },
  // ── Online payments (docs/PAYMENTS.md) — all optional. With no provider
  // selected (or its keys missing) billing stays manual and checkout answers
  // 503 "payment_gateway_not_configured". Only the SHAPE is checked here so a
  // pasted publishable key in a secret slot fails at boot, not at checkout.
  {
    name: "PAYMENT_PROVIDER",
    required: false,
    validate: (v) =>
      ["stripe", "razorpay", "manual"].includes(v.trim().toLowerCase())
        ? null
        : 'PAYMENT_PROVIDER must be "stripe", "razorpay" or "manual".',
  },
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    validate: (v) => (/^(sk|rk)_(test|live)_/.test(v) ? null : "STRIPE_SECRET_KEY must start with sk_test_ / sk_live_ (or rk_ for a restricted key)."),
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: false,
    validate: (v) => (v.startsWith("whsec_") ? null : "STRIPE_WEBHOOK_SECRET must start with whsec_."),
  },
  {
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    required: false,
    validate: (v) => (/^pk_(test|live)_/.test(v) ? null : "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must start with pk_test_ / pk_live_."),
  },
  {
    name: "RAZORPAY_KEY_ID",
    required: false,
    validate: (v) => (/^rzp_(test|live)_/.test(v) ? null : "RAZORPAY_KEY_ID must start with rzp_test_ / rzp_live_."),
  },
  { name: "RAZORPAY_KEY_SECRET", required: false },
  { name: "RAZORPAY_WEBHOOK_SECRET", required: false },
  {
    name: "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    required: false,
    validate: (v) => (/^rzp_(test|live)_/.test(v) ? null : "NEXT_PUBLIC_RAZORPAY_KEY_ID must start with rzp_test_ / rzp_live_."),
  },
  {
    name: "DEFAULT_CURRENCY",
    required: false,
    validate: (v) => (/^[A-Z]{3}$/.test(v) ? null : "DEFAULT_CURRENCY must be a 3-letter ISO code, e.g. AED."),
  },
  {
    name: "PAYMENT_PAST_DUE_GRACE_DAYS",
    required: false,
    validate: (v) => (/^\d+$/.test(v) && Number(v) <= 60 ? null : "PAYMENT_PAST_DUE_GRACE_DAYS must be an integer between 0 and 60."),
  },
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
