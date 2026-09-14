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
export type OtpPurpose = "verify" | "signin";

export function hashOtp(otp: string, purpose: OtpPurpose = "verify"): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // env.ts validates this at boot; guard here so a misconfig fails loudly
    // instead of silently falling back to a weaker unpeppered hash.
    throw new Error("NEXTAUTH_SECRET is not configured");
  }
  // The purpose is mixed into the digest so a code minted for one flow can never
  // satisfy the other's lookup. Both flows write the same User field, so without
  // this a low-stakes "confirm your address" code would also be a valid login
  // credential for the passwordless quick-apply provider, and the two flows'
  // separate rate limiters would each grant a full guess budget against the same
  // 6 digits.
  //
  // "verify" keeps the original unprefixed digest on purpose: codes already
  // issued and sitting in the database were hashed that way, and changing it
  // would invalidate every in-flight verification email with no migration.
  if (purpose === "verify") {
    return crypto.createHmac("sha256", secret).update(otp).digest("hex");
  }
  return crypto.createHmac("sha256", secret).update(`${purpose}:${otp}`).digest("hex");
}

/**
 * Constant-time comparison of two hex digests (e.g. a submitted code's hash
 * against the stored one). A plain `===` short-circuits on the first differing
 * byte, which leaks how much of the digest matched. Length mismatch is an
 * immediate false: both sides are always SHA-256 (64 hex chars) here.
 */
export function otpHashesMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
