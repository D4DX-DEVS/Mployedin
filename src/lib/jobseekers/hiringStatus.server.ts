import mongoose from "mongoose";
import Application, { type ApplicationStatus } from "@/models/Application";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import type { SeekerApplicationRow } from "@/lib/jobseekers/hiringStatus";

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

interface PopulatedApplication {
  _id: unknown;
  jobSeekerId: unknown;
  status: string;
  updatedAt?: Date;
  jobId?: { _id: unknown; title?: string; employerId?: { companyName?: string } | null } | null;
}

/**
 * Every application of each seeker with the job and company it is for, newest
 * change first, keyed by seeker id. Applications whose job was deleted are
 * left out — there is nothing to name.
 */
export async function applicationsBySeeker(seekerIds: unknown[]): Promise<Map<string, SeekerApplicationRow[]>> {
  const out = new Map<string, SeekerApplicationRow[]>();
  const ids = seekerIds.map((id) => String(id)).filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return out;
  // Registers the models the populate below reads.
  void Job;
  void Employer;
  const rows = (await Application.find({ jobSeekerId: { $in: ids } })
    .select("jobSeekerId jobId status updatedAt")
    .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName" } })
    .sort({ updatedAt: -1 })
    .lean()) as unknown as PopulatedApplication[];
  for (const r of rows) {
    if (!r.jobId?.title) continue;
    const key = String(r.jobSeekerId);
    const list = out.get(key) ?? [];
    list.push({
      id: String(r._id),
      jobId: String(r.jobId._id),
      jobTitle: r.jobId.title,
      company: r.jobId.employerId?.companyName,
      status: r.status,
      updatedAt: (r.updatedAt ?? new Date(0)).toISOString(),
    });
    out.set(key, list);
  }
  return out;
}
