/**
 * Ask for a seeker's feed to be scored in the background after their profile
 * changes, so the AI part of each match score is already stored by the time
 * they open the home page.
 *
 * Why: the home page never waits on Jev. A job with no stored verdict shows
 * the deterministic score and queues the verdict, so a new seeker saw 100% on
 * first load, then 97% or 92% on refresh once the verdicts landed. Every
 * profile edit changes the verdict key and started that over. Warming at save
 * time closes most of that gap.
 *
 * Kept free of Mongoose so every save route can import it cheaply.
 */
import { inngest } from "@/lib/inngest/client";
import logger from "@/lib/logger";

export const SEEKER_MATCH_WARM_EVENT = "matching/seeker.warm";

/**
 * Never throws: a profile save must succeed even when Inngest is unreachable.
 * The function is debounced per user, so a burst of saves (onboarding, then
 * the CV reader filling sections) scores once, against the final profile.
 */
export async function queueSeekerMatchWarm(userId: string): Promise<void> {
  try {
    await inngest.send({ name: SEEKER_MATCH_WARM_EVENT, data: { userId: String(userId) } });
  } catch (err) {
    logger.warn({ err, userId }, "[seeker-warm] could not queue match warm-up");
  }
}
