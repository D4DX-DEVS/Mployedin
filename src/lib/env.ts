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
