/**
 * Utility to auto-classify and update a seeker's industry after profile changes.
 * Called after profile saves unless the industry is manually set.
 *
 * This keeps industry classification automatic and in sync with profile updates
 * (experience, skills, education, careerProfile changes).
 */

import JobSeeker from "@/models/JobSeeker";
import { classifyIndustry } from "@/lib/jobseekers/industryClassifier";
import { ObjectId } from "mongoose";

interface SeekerWithIndustryFields {
  _id?: ObjectId | string;
  userId?: ObjectId | string;
  experience?: unknown;
  skills?: unknown;
  education?: unknown;
  careerProfile?: unknown;
  cv?: unknown;
  industry?: string;
  industrySource?: "auto" | "manual";
}

/**
 * Auto-classify industry for a seeker if not manually set.
 * If the seeker's industry is already set to "manual", this does nothing.
 * Otherwise, classifies from the profile and updates the database.
 *
 * Call this after a profile update to keep industry in sync.
 * Safe to call multiple times; it's a no-op if already classified.
 */
export async function ensureIndustryClassified(seeker: SeekerWithIndustryFields): Promise<void> {
  // Skip if manually set
  if (seeker.industrySource === "manual") return;

  // Classify from current profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = classifyIndustry(seeker as any);

  // Only update if classified and different from current
  if (result.industry && result.industry !== seeker.industry) {
    const seekerId = seeker._id || seeker.userId;
    if (!seekerId) return;

    await JobSeeker.updateOne(
      { _id: seekerId },
      {
        $set: {
          industry: result.industry,
          industrySource: "auto",
        },
      }
    );
  }
}
