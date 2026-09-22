/**
 * Which timezone a notification's *recipient* reads times in.
 *
 * Interview bodies used to be composed with a literal `timeZone: "Asia/Dubai"`,
 * so a London candidate was emailed "14:00" for an interview their own calendar
 * showed at 10:00 — the in-app copy (rendered in the browser's zone) and the
 * email disagreed with each other.
 *
 * Order of preference:
 *   1. the role profile's zone — job seekers get theirs from browser detection
 *      on the settings page, so it is the closest thing to "where they are";
 *   2. `NotificationPreference.timezone`, which is where quiet hours live;
 *   3. `FALLBACK_TIME_ZONE`, preserving the historical behaviour for users who
 *      have never had a zone recorded.
 *
 * Note that (2) is *not* first even though it sounds more specific: its schema
 * default is Asia/Dubai, so a stored "Asia/Dubai" there is indistinguishable
 * from never having been set.
 */

import { connectDB } from "@/lib/db/mongoose";
import { FALLBACK_TIME_ZONE, isValidTimeZone } from "@/lib/datetime/zone";
import logger from "@/lib/logger";

/**
 * Re-exported so notification code has one import for zone resolution. Defined
 * in `lib/datetime/zone` because client components need it too, and this
 * module pulls in mongoose.
 */
export { FALLBACK_TIME_ZONE };

export interface RecipientZoneSources {
  profileTimeZone?: string | null;
  preferenceTimeZone?: string | null;
}

export function pickRecipientTimeZone({
  profileTimeZone,
  preferenceTimeZone,
}: RecipientZoneSources): string {
  if (isValidTimeZone(profileTimeZone)) return profileTimeZone as string;
  if (isValidTimeZone(preferenceTimeZone)) return preferenceTimeZone as string;
  return FALLBACK_TIME_ZONE;
}

/**
 * The recipient's zone, resolved from whichever profile they have.
 *
 * Never throws: a notification is a side effect of some other action, so a
 * failed lookup degrades to the fallback rather than taking that action down.
 */
export async function resolveRecipientTimeZone(userId: string): Promise<string> {
  try {
    await connectDB();

    const [{ default: JobSeeker }, { Agent }, { SuperAgent }, { default: NotificationPreference }] =
      await Promise.all([
        import("@/models/JobSeeker"),
        import("@/models/Agent"),
        import("@/models/SuperAgent"),
        import("@/models/NotificationPreference"),
      ]);

    const [seeker, agent, superAgent, preference] = await Promise.all([
      JobSeeker.findOne({ userId }).select("settings.timezone").lean(),
      Agent.findOne({ userId }).select("timezone").lean(),
      SuperAgent.findOne({ userId }).select("timezone").lean(),
      NotificationPreference.findOne({ userId }).select("timezone").lean(),
    ]);

    const seekerZone = (seeker as { settings?: { timezone?: string } } | null)?.settings?.timezone;
    const agentZone = (agent as { timezone?: string } | null)?.timezone;
    const superAgentZone = (superAgent as { timezone?: string } | null)?.timezone;

    return pickRecipientTimeZone({
      profileTimeZone: seekerZone ?? agentZone ?? superAgentZone,
      preferenceTimeZone: (preference as { timezone?: string } | null)?.timezone,
    });
  } catch (err) {
    logger.warn({ err, userId }, "Could not resolve recipient timezone; using fallback");
    return FALLBACK_TIME_ZONE;
  }
}
