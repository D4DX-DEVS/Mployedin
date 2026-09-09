import { z } from "zod";
import { formatList } from "@/lib/i18n/formatList";

const COMMON_PASSWORDS = new Set([
  "password123!",
  "admin@1234",
  "qwerty123!",
  "welcome123!",
  "letmein123!",
]);

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character")
  .refine((password) => !COMMON_PASSWORDS.has(password.toLowerCase()), {
    message: "Choose a less common password",
  });

/**
 * One entry per rule the password breaks. Mirrors `strongPasswordSchema`
 * rule-for-rule so a form can explain *which* rule failed before the request
 * leaves the browser, in the user's language, instead of echoing a single
 * English zod message.
 */
export type PasswordIssue =
  | "tooShort"
  | "tooLong"
  | "noLowercase"
  | "noUppercase"
  | "noNumber"
  | "noSymbol"
  | "common";

export function getPasswordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("tooShort");
  if (password.length > PASSWORD_MAX_LENGTH) issues.push("tooLong");
  if (!/[a-z]/.test(password)) issues.push("noLowercase");
  if (!/[A-Z]/.test(password)) issues.push("noUppercase");
  if (!/[0-9]/.test(password)) issues.push("noNumber");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("noSymbol");
  if (issues.length === 0 && COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("common");
  return issues;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface FormatOptions {
  password: string;
  locale: string;
  /** `useTranslations("formErrors")` — holds the `password*` keys below. */
  t: Translate;
}

const RULE_KEYS: Partial<Record<PasswordIssue, string>> = {
  noLowercase: "passwordRuleLowercase",
  noUppercase: "passwordRuleUppercase",
  noNumber: "passwordRuleNumber",
  noSymbol: "passwordRuleSymbol",
};

/**
 * Turn issues into one or two plain sentences an admin can act on, e.g.
 * "Password must be at least 12 characters long. This one has 8. Password
 * must include an uppercase letter and a symbol such as ! @ #."
 * Returns null when there is nothing to say.
 *
 * Keys read from `formErrors`: passwordTooShort {min,count},
 * passwordTooLong {max}, passwordMissing {rules}, passwordTooCommon,
 * passwordRuleLowercase, passwordRuleUppercase, passwordRuleNumber,
 * passwordRuleSymbol.
 */
export function formatPasswordIssues(issues: PasswordIssue[], { password, locale, t }: FormatOptions): string | null {
  if (issues.length === 0) return null;
  if (issues.includes("common")) return t("passwordTooCommon");

  const sentences: string[] = [];
  if (issues.includes("tooShort")) {
    sentences.push(t("passwordTooShort", { min: PASSWORD_MIN_LENGTH, count: password.length }));
  }
  if (issues.includes("tooLong")) {
    sentences.push(t("passwordTooLong", { max: PASSWORD_MAX_LENGTH }));
  }
  const rules = issues.flatMap((issue) => {
    const key = RULE_KEYS[issue];
    return key ? [t(key)] : [];
  });
  if (rules.length > 0) {
    sentences.push(t("passwordMissing", { rules: formatList(rules, locale) }));
  }
  return sentences.join(" ");
}

/**
 * Convenience for forms: empty → `passwordRequired`, otherwise the issue
 * sentence(s), or null when the password passes the policy.
 */
export function validatePasswordForForm(password: string, opts: Omit<FormatOptions, "password">): string | null {
  const trimmed = password.trim();
  if (!trimmed) return opts.t("passwordRequired");
  return formatPasswordIssues(getPasswordIssues(trimmed), { ...opts, password: trimmed });
}
