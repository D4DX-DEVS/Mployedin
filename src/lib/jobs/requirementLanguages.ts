/**
 * Languages a job asks for count in matching only once the employer has
 * confirmed them on the job form (decided 2026-11-12, D14): 12 live jobs
 * carried "English, Malayalam" that no form ever set, and scoring them cost
 * seekers points for a requirement nobody stated. A save that sends
 * `requirements.languages` is that confirmation; the server stamps it, so no
 * client can backdate or forge it.
 */
export function stampLanguagesConfirmed<T extends Record<string, unknown>>(requirements: T, now = new Date()): T {
  if (!("languages" in requirements)) return requirements;
  const languages = requirements.languages;
  const confirmed = Array.isArray(languages) && languages.some((l) => typeof l === "string" && l.trim());
  return { ...requirements, languagesConfirmedAt: confirmed ? now : null };
}
