import crypto from "crypto";

/**
 * RFC 6238 TOTP implementation (SHA-1, 6 digits, 30s steps) using node:crypto.
 * No external dependency — compatible with Google Authenticator, Authy, 1Password, etc.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;

/** Encode a buffer as RFC 4648 base32 (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decode an RFC 4648 base32 string (case-insensitive, ignores padding/spaces). */
export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new 160-bit TOTP secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Compute the TOTP code for a given secret and time step. */
function totpAt(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a 6-digit TOTP code against a secret.
 * Accepts ±`window` time steps (default 1 → ±30s) for clock drift.
 * Constant-time comparison.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC);
  for (let i = -window; i <= window; i++) {
    const expected = totpAt(secretBase32, counter + i);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

/** Build the otpauth:// URI for authenticator apps / QR codes. */
export function totpAuthUri(email: string, secretBase32: string, issuer = "MPLOYEDIN"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SEC}`;
}

/** Generate `count` single-use recovery codes (returned plaintext, store only hashes). */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** SHA-256 hash of a recovery code for at-rest storage. */
export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}
