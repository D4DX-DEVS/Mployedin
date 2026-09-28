import { isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Normalise the shared component's display value into a stable international value. */
export function normalizePhoneValue(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw);
  return parsed?.number ?? raw.replace(/\s+/g, " ");
}

/** Validate an international number using libphonenumber's country metadata. */
export function isInternationalPhone(value: string): boolean {
  const normalized = normalizePhoneValue(value);
  if (!normalized.startsWith("+")) return false;
  const parsed = parsePhoneNumberFromString(normalized);
  return Boolean(parsed && isValidPhoneNumber(normalized, parsed.country as CountryCode | undefined));
}

export function isPhoneValueValid(value: string): boolean {
  return !value.trim() || isInternationalPhone(value);
}
