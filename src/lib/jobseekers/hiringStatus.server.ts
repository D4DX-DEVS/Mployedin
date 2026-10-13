import mongoose from "mongoose";
import Application, { type ApplicationStatus } from "@/models/Application";

/** The distinct application statuses of each seeker, keyed by seeker id; one aggregation. */
export async function applicationStatusesBySeeker(seekerIds: unknown[]): Promise<Map<string, ApplicationStatus[]>> {
  const out = new Map<string, ApplicationStatus[]>();
  const ids = seekerIds.map((id) => String(id)).filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return out;
  const rows = await Application.aggregate<{ _id: unknown; statuses: ApplicationStatus[] }>([
    { $match: { jobSeekerId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: "$jobSeekerId", statuses: { $addToSet: "$status" } } },
  ]);
  for (const r of rows) out.set(String(r._id), r.statuses);
  return out;
}
