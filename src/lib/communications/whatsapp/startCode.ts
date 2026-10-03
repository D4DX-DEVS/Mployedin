/**
 * The personal START code. Each account's "Message us on WhatsApp" button
 * types `START <code>`, and that START verifies only the account holding the
 * code, and only when it comes from the phone on that account's profile
 * (webhookHandlers.ts). Without it, one START verified every account whose
 * profile carried the sender's number, including someone else's account with
 * that number typed in.
 *
 * Six characters from upper-case letters and digits without the look-alikes
 * O/0 and I/1/L, so a code read off the settings page cannot be mistyped.
 * Pure on purpose (the webhook parser uses it): ensureStartCode (startLink.ts)
 * stores one per account, unique across accounts (indexes.ts).
 */
import { randomInt } from "crypto";

export const START_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const START_CODE_LENGTH = 6;

const START_CODE = new RegExp(`^[${START_CODE_ALPHABET}]{${START_CODE_LENGTH}}$`);

/** A fresh code; uniqueness is the database's job (the retry lives in ensureStartCode). */
export function generateStartCode(): string {
  let code = "";
  for (let i = 0; i < START_CODE_LENGTH; i += 1) code += START_CODE_ALPHABET[randomInt(START_CODE_ALPHABET.length)];
  return code;
}

/** True for a well-formed code: exactly START_CODE_LENGTH characters of the alphabet, upper case. */
export function isStartCode(value: string): boolean {
  return START_CODE.test(value);
}
