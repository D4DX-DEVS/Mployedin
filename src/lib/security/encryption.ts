import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const TAG_LENGTH = 16; // 128 bits auth tag

let keyCache: Buffer | null = null;
let keyValidated = false;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const key = Buffer.from(keyHex, "hex");
  // Lazy validation: assert key is exactly 32 bytes on first use, not module load
  if (!keyValidated) {
    keyValidated = true;
    if (key.length !== KEY_LENGTH) {
      throw new Error(`ENCRYPTION_KEY must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars); got ${key.length} bytes`);
    }
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 string in the format: iv:ciphertext:authTag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Combine iv + ciphertext + tag as base64
  const combined = Buffer.concat([iv, encrypted, tag]);
  return combined.toString("base64");
}

/**
 * Decrypts a base64 string previously encrypted with `encrypt()`.
 * Returns the original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");

  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Hash a value using SHA-256 (for non-reversible storage like passport numbers for lookup).
 */
export function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Encrypts a value only if it is not already encrypted.
 * Useful for idempotent field updates.
 */
export function encryptIfPlain(value: string): string {
  try {
    decrypt(value);
    return value; // already encrypted
  } catch {
    return encrypt(value);
  }
}

/**
 * Sensitive PII fields that should be encrypted at rest.
 */
export const SENSITIVE_FIELDS = [
  "passportNumber",
  "nationalId",
  "visaNumber",
  "bankAccountNumber",
  "iban",
] as const;

export type SensitiveField = typeof SENSITIVE_FIELDS[number];
