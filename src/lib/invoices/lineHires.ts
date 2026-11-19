/**
 * Adds hire details (candidate, job, start date) to recruitment invoice lines
 * that are linked to a hire (`lineItems[].placementId`), so the invoice view
 * and PDF show which hire each line bills. Server only.
 */
import Placement from "@/models/Placement";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import Job from "@/models/Job";
import type { PresentableLineItem } from "./presentation";

type LineWithPlacement = PresentableLineItem & { placementId?: unknown };

export async function attachLineHires<T extends { lineItems?: LineWithPlacement[] }>(invoice: T): Promise<T> {
  const lines = invoice.lineItems ?? [];
  const ids = [...new Set(lines.map((l) => l.placementId).filter(Boolean).map(String))];
  if (ids.length === 0) return invoice;

  const placements = await Placement.find({ _id: { $in: ids } })
    .select("_id jobId jobSeekerId startDate placedAt")
    .lean<{ _id: unknown; jobId?: unknown; jobSeekerId?: unknown; startDate?: Date; placedAt?: Date }[]>();
  const [seekers, jobs] = await Promise.all([
    JobSeeker.find({ _id: { $in: placements.map((p) => p.jobSeekerId) } })
      .select("_id userId fullName")
      .lean<{ _id: unknown; userId?: unknown; fullName?: string }[]>(),
    Job.find({ _id: { $in: placements.map((p) => p.jobId) } }).select("_id title").lean<{ _id: unknown; title?: string }[]>(),
  ]);
  const needUserNames = seekers.filter((s) => !s.fullName?.trim()).map((s) => s.userId);
  const users = needUserNames.length
    ? await User.find({ _id: { $in: needUserNames } }).select("_id name").lean<{ _id: unknown; name?: string }[]>()
    : [];
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const seekerName = new Map(
    seekers.map((s) => [String(s._id), s.fullName?.trim() || userName.get(String(s.userId)) || undefined]),
  );
  const jobTitle = new Map(jobs.map((j) => [String(j._id), j.title]));
  const hireById = new Map(
    placements.map((p) => [
      String(p._id),
      {
        candidateName: seekerName.get(String(p.jobSeekerId)),
        jobTitle: jobTitle.get(String(p.jobId)),
        startDate: p.startDate ?? p.placedAt ?? null,
      },
    ]),
  );

  return {
    ...invoice,
    lineItems: lines.map((line) => {
      const hire = line.placementId ? hireById.get(String(line.placementId)) : undefined;
      return hire ? { ...line, hire } : line;
    }),
  };
}
