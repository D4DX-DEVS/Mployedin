/**
 * FAQ categories. Free text let "General", "general" and "Generals" become
 * three public tabs; these six are the values live FAQs already use, and each
 * has a label under `landing.faqCategory.*`.
 */
export const FAQ_CATEGORIES = ["general", "job_seeker", "employer", "agent", "billing", "privacy"] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export function isFaqCategory(value: unknown): value is FaqCategory {
  return typeof value === "string" && (FAQ_CATEGORIES as readonly string[]).includes(value);
}
