import crypto from "crypto";

/**
 * Hash a 6-digit email-verification OTP for storage/lookup.
 *
 * Uses HMAC-SHA256 keyed with NEXTAUTH_SECRET (a server-side pepper) rather
 * than a bare SHA-256. A 6-digit code only has 1M possible values, so a plain
 * hash is trivially reversible from a DB dump by precomputing all 1M digests.
 * The pepper defeats that: without the secret an attacker can't build the table.
 *
 * The result is still deterministic given the secret, so the email-scoped
 * `findOne({ email, emailVerificationOtp })` lookup keeps working unchanged.
 */
export function hashOtp(otp: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // env.ts validates this at boot; guard here so a misconfig fails loudly
    // instead of silently falling back to a weaker unpeppered hash.
    throw new Error("NEXTAUTH_SECRET is not configured");
  }
  return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}
