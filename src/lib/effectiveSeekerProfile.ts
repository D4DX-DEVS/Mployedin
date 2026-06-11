/**
 * Builds the seeker's *effective* matching profile: the base profile from the
 * JobSeeker document plus any skills the seeker confirmed via skill
 * confirmations. Every surface that displays a match score (AI Matches feed,
 * home dashboard, recommended-jobs widget) must use this so the same job shows
 * the same percentage everywhere.
 */

import SkillConfirmation from "@/models/SkillConfirmation";
import { seekerProfileFromDoc, type SeekerProfile } from "@/lib/matchScore";

export async function effectiveSeekerProfile(
  userId: string,
  seekerDoc: Parameters<typeof seekerProfileFromDoc>[0],
): Promise<SeekerProfile> {
  const profile = seekerProfileFromDoc(seekerDoc);

  const confirmedSkills = await SkillConfirmation.find({
    userId,
    status: "confirmed",
  }).select("skill").lean();

  const existingLower = new Set(profile.skills.map((s) => s.toLowerCase()));
  for (const c of confirmedSkills) {
    if (c.skill && !existingLower.has(c.skill.toLowerCase())) {
      existingLower.add(c.skill.toLowerCase());
      profile.skills.push(c.skill);
    }
  }

  return profile;
}
