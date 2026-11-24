import mongoose from "mongoose";
import CvExportRecord, { type CvExportVersion } from "@/models/CvExportRecord";
import Application from "@/models/Application";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { AuditLog } from "@/models/AuditLog";
import type {
  CvExportHistoryRow,
  JobApplicationSummary,
  JobExportSummary,
  SeekerJobContext,
} from "@/lib/cv/cvExportHistory";

const toObjectIds = (ids: readonly unknown[]): mongoose.Types.ObjectId[] =>
  ids
    .map((id) => String(id))
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

/** Display names of these accounts, keyed by id. Never emails. */
async function accountNames(ids: readonly unknown[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.map(String))];
  if (unique.length === 0) return out;
  const users = (await User.find({ _id: { $in: toObjectIds(unique) } }).select("name").lean()) as unknown as Array<{
    _id: unknown;
    name?: string;
  }>;
  for (const user of users) out.set(String(user._id), (user.name ?? "").trim());
  return out;
}

/** The job, if the id is a real job; null otherwise. */
export async function findJobForContext(jobId: string): Promise<mongoose.Types.ObjectId | null> {
  if (!mongoose.isValidObjectId(jobId)) return null;
  const found = await Job.exists({ _id: jobId });
  return found ? new mongoose.Types.ObjectId(jobId) : null;
}

/**
 * Completed exports of each listed seeker's CV for one job, keyed by seeker
 * id. Seekers with none are absent.
 */
export async function jobExportsBySeeker(
  jobId: mongoose.Types.ObjectId,
  seekerIds: readonly unknown[],
): Promise<Map<string, JobExportSummary>> {
  const out = new Map<string, JobExportSummary>();
  const ids = toObjectIds(seekerIds);
  if (ids.length === 0) return out;
  const rows = await CvExportRecord.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
    lastAt: Date;
    lastBy: mongoose.Types.ObjectId;
    lastVersions: CvExportVersion[];
  }>([
    { $match: { jobId, status: "done", seekerId: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$seekerId",
        count: { $sum: 1 },
        lastAt: { $first: "$createdAt" },
        lastBy: { $first: "$actorId" },
        lastVersions: { $first: "$versions" },
      },
    },
  ]);
  const names = await accountNames(rows.map((r) => r.lastBy));
  for (const row of rows) {
    out.set(String(row._id), {
      count: row.count,
      lastAt: new Date(row.lastAt).toISOString(),
      lastBy: names.get(String(row.lastBy)) ?? "",
      lastVersions: row.lastVersions ?? [],
    });
  }
  return out;
}

/** Each listed seeker's application to one job, keyed by seeker id. */
export async function jobApplicationsBySeeker(
  jobId: mongoose.Types.ObjectId,
  seekerIds: readonly unknown[],
): Promise<Map<string, JobApplicationSummary>> {
  const out = new Map<string, JobApplicationSummary>();
  const ids = toObjectIds(seekerIds);
  if (ids.length === 0) return out;
  const rows = (await Application.find({ jobId, jobSeekerId: { $in: ids } })
    .select({ jobSeekerId: 1, status: 1, appliedAt: 1, updatedAt: 1, statusHistory: { $slice: -1 } })
    .lean()) as unknown as Array<{
    _id: unknown;
    jobSeekerId: unknown;
    status: string;
    appliedAt?: Date;
    updatedAt?: Date;
    statusHistory?: Array<{ changedAt?: Date }>;
  }>;
  for (const row of rows) {
    const at = row.statusHistory?.[0]?.changedAt ?? row.appliedAt ?? row.updatedAt ?? new Date(0);
    out.set(String(row.jobSeekerId), {
      applicationId: String(row._id),
      status: row.status,
      updatedAt: new Date(at).toISOString(),
    });
  }
  return out;
}

/** Seekers whose CV was exported (and confirmed) for this job. */
export async function seekerIdsExportedForJob(jobId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
  return (await CvExportRecord.distinct("seekerId", { jobId, status: "done" })) as mongoose.Types.ObjectId[];
}

/** Seekers who applied to this job. */
export async function seekerIdsAppliedToJob(jobId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
  return (await Application.distinct("jobSeekerId", { jobId })) as mongoose.Types.ObjectId[];
}

/** The job bar: which job, and how many applied to it or had their CV sent for it. */
export async function jobContextFor(jobId: mongoose.Types.ObjectId): Promise<SeekerJobContext | null> {
  void Employer; // registers the model the populate reads
  const job = (await Job.findById(jobId)
    .select("title status location createdAt employerId")
    .populate("employerId", "companyName")
    .lean()) as unknown as {
    _id: unknown;
    title?: string;
    status?: string;
    createdAt?: Date;
    location?: { city?: string; country?: string };
    employerId?: { companyName?: string } | null;
  } | null;
  if (!job) return null;
  const [appliedIds, exportedIds] = await Promise.all([seekerIdsAppliedToJob(jobId), seekerIdsExportedForJob(jobId)]);
  return {
    job: {
      id: String(job._id),
      title: job.title ?? "",
      company: job.employerId?.companyName,
      city: job.location?.city,
      country: job.location?.country,
      status: job.status ?? "",
      createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
    },
    appliedCount: appliedIds.length,
    exportedCount: exportedIds.length,
  };
}

const HISTORY_LIMIT = 50;

/**
 * Every completed CV export of one seeker, newest first: the per-candidate
 * records, plus the bulk exports from before those existed (the `cv.export`
 * audit entries that carry no batch), shown as "no job chosen".
 */
export async function seekerCvExportHistory(seekerId: string): Promise<CvExportHistoryRow[]> {
  if (!mongoose.isValidObjectId(seekerId)) return [];
  void Employer;
  const [records, legacy] = await Promise.all([
    CvExportRecord.find({ seekerId: new mongoose.Types.ObjectId(seekerId), status: "done" })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName" } })
      .lean() as unknown as Promise<Array<{
      _id: unknown;
      createdAt: Date;
      actorId: unknown;
      actorRole: string;
      versions?: CvExportVersion[];
      jobId?: { _id: unknown; title?: string; employerId?: { companyName?: string } | null } | null;
    }>>,
    // Pre-record exports: the manifest's audit entry, before it carried a batch id.
    AuditLog.find({ action: "cv.export", "meta.seekerIds": seekerId, "meta.batchId": { $exists: false } })
      .select("actorId actorRole createdAt")
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean() as unknown as Promise<Array<{ _id: unknown; actorId?: unknown; actorRole?: string; createdAt: Date }>>,
  ]);
  const names = await accountNames([...records.map((r) => r.actorId), ...legacy.flatMap((l) => (l.actorId ? [l.actorId] : []))]);
  const rows: CvExportHistoryRow[] = [
    ...records.map((r) => ({
      id: String(r._id),
      at: new Date(r.createdAt).toISOString(),
      by: names.get(String(r.actorId)) ?? "",
      byRole: r.actorRole,
      job: r.jobId?.title ? { id: String(r.jobId._id), title: r.jobId.title, company: r.jobId.employerId?.companyName } : null,
      versions: r.versions ?? [],
    })),
    ...legacy.map((l) => ({
      id: String(l._id),
      at: new Date(l.createdAt).toISOString(),
      by: l.actorId ? names.get(String(l.actorId)) ?? "" : "",
      byRole: l.actorRole ?? "",
      job: null,
      versions: [],
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_LIMIT);
}
