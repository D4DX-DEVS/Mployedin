import { validatePasswordForForm } from "@/lib/security/passwordPolicy";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AccountFields {
  name: string;
  email: string;
  /** Omit on edit forms, where the password is not changed here. */
  password?: string;
}

/**
 * The first problem with a staff account's name / email / password, as one
 * `formErrors` sentence — or null when the account step may be left.
 *
 * Shared by the Add/Edit Agent and Super Agent step dialogs so that a user who
 * clicks Next gets the specific reason ("Enter a valid email address") on the
 * step that holds the field, instead of a generic "required" line or a 400
 * from the server after they have already moved on to the region step.
 */
export function accountFieldsError(
  { name, email, password }: AccountFields,
  { t, locale }: { t: Translate; locale: string },
): string | null {
  if (!name.trim()) return t("nameRequired");
  if (!email.trim()) return t("emailRequired");
  if (!EMAIL_PATTERN.test(email.trim())) return t("emailInvalid");
  if (password !== undefined) return validatePasswordForForm(password, { t, locale });
  return null;
}
