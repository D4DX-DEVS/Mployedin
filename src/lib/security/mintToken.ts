import crypto from "crypto";

/**
 * Generate an opaque bearer token and the SHA-256 hash stored alongside it.
 * Only the hash is persisted, so a database read cannot recover the token.
 */
export function mintToken(prefix: string) {
  const token = `${prefix}${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
