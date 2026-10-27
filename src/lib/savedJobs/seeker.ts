import JobSeeker from "@/models/JobSeeker";
import type { Types } from "mongoose";

/** SavedJob rows key on the JobSeeker PROFILE _id, never the User id. */
export async function seekerProfileId(userId: string): Promise<Types.ObjectId | null> {
  const seeker = await JobSeeker.findOne({ userId }).select("_id").lean<{ _id: Types.ObjectId } | null>();
  return seeker?._id ?? null;
}
