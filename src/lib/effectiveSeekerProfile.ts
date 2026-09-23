/**
 * Builds the seeker's *effective* matching profile: the base profile from the
 * JobSeeker document plus any skills the seeker confirmed via skill
 * confirmations. Every surface that displays a match score (AI Matches feed,
 * home dashboard, recommended-jobs widget, and the digests) must use this so
 * the same job shows the same percentage everywhere.
 */

import { isValidObjectId } from "mongoose";
import SkillConfirmation from "@/models/SkillConfirmation";
import { seekerProfileFromDoc, type SeekerProfile } from "@/lib/matchScore";

export async function effectiveSeekerProfile(
  userId: string,
  seekerDoc: Parameters<typeof seekerProfileFromDoc>[0],
): Promise<SeekerProfile> {
  const confirmed = await loadConfirmedSkills([userId]);
  return withConfirmedSkills(seekerProfileFromDoc(seekerDoc), confirmed.get(String(userId)) ?? []);
}

/**
 * Add confirmed skills to a profile, skipping any it already lists.
 *
 * Mutates and returns `profile` — callers pass a freshly built one.
 */
export function withConfirmedSkills(profile: SeekerProfile, confirmed: readonly string[]): SeekerProfile {
  const existingLower = new Set(profile.skills.map((s) => s.toLowerCase()));
  for (const skill of confirmed) {
    if (skill && !existingLower.has(skill.toLowerCase())) {
      existingLower.add(skill.toLowerCase());
      profile.skills.push(skill);
    }
  }
  return profile;
}

/**
 * Confirmed skills for many seekers in one query, keyed by userId.
 *
 * The digests scored the bare profile while the app scored this one, so for
 * every seeker with a confirmed skill the email and the home page disagreed
 * about the same job even on the same engine. The crons load these once per
 * batch rather than once per seeker.
 */
export async function loadConfirmedSkills(userIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  // A blank or malformed id would make the whole $in throw a CastError; it
  // simply has no confirmations.
  const ids = userIds.filter((id) => isValidObjectId(id));
  if (ids.length === 0) return out;
  const rows = await SkillConfirmation.find({ userId: { $in: ids }, status: "confirmed" })
    .select("userId skill")
    .lean();
  for (const row of rows as Array<{ userId: unknown; skill?: string }>) {
    if (!row.skill) continue;
    const key = String(row.userId);
    const list = out.get(key) ?? [];
    list.push(row.skill);
    out.set(key, list);
  }
  return out;
}
