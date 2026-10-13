/** The `badges[]` entry that makes a job seeker Premium (staff grant it; a referral sign-up gets it). */
export const PREMIUM_BADGE = "premium";

export function isPremiumSeeker(seeker: { badges?: string[] | null } | null | undefined): boolean {
  return (seeker?.badges ?? []).includes(PREMIUM_BADGE);
}
