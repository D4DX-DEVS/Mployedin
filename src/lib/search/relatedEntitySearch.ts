import { Types } from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * Applications and Interviews rarely carry the denormalized candidateName /
 * jobTitle / companyName fields (the UI renders them from the populated refs),
 * so a regex on those fields alone matches nothing. Resolve the search term
 * against the referenced collections and match by id as well.
 */
export async function relatedEntitySearchOr(
  search: string
): Promise<Record<string, unknown>[]> {
  const rx = { $regex: escapeRegex(search), $options: "i" };

  const [seekers, jobs, employers] = await Promise.all([
    JobSeeker.find({ $or: [{ fullName: rx }, { email: rx }] }).select("_id").lean(),
    Job.find({ title: rx }).select("_id").lean(),
    Employer.find({ companyName: rx }).select("_id").lean(),
  ]);

  const ids = (docs: { _id: unknown }[]): Types.ObjectId[] =>
    docs.map((d) => d._id as Types.ObjectId);

  const or: Record<string, unknown>[] = [
    { candidateName: rx },
    { jobTitle: rx },
    { companyName: rx },
  ];
  if (seekers.length) or.push({ jobSeekerId: { $in: ids(seekers) } });
  if (jobs.length) or.push({ jobId: { $in: ids(jobs) } });
  if (employers.length) or.push({ employerId: { $in: ids(employers) } });

  return or;
}
