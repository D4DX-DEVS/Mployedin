import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * The Cloud API wants the recipient as country code + number, digits only.
 * `User.phone` is stored in E.164 with a leading "+" (normalizePhoneValue);
 * older rows may lack the plus. A national-format number cannot be resolved
 * without a country, so it is rejected rather than guessed.
 */
export function toWaRecipient(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  if (!raw) return null;
  const candidate = raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`;
  const parsed = parsePhoneNumberFromString(candidate);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number.slice(1);
}

/** Inbound webhooks give `wa_id` as digits; User.phone carries the plus. */
export function fromWaId(waId: string): string {
  return `+${waId.replace(/\D/g, "")}`;
}
