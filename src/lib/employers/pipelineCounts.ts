/**
 * One definition per employer pipeline metric (EMP-13).
 *
 * The dashboard, analytics and applications workspace each counted these their
 * own way, so the same company showed shortlisted 6/19/27, interviews 1/2/18
 * and an 8% conversion beside 0 hires. Every employer surface that shows one of
 * these headline numbers reads it from here:
 *
 * - activeJobs:          jobs with status "active" and not soft-deleted.
 * - applications:        every application to the employer (all statuses).
 * - byStatus[s]:         applications whose CURRENT status is s. "Shortlisted"
 *                        means sitting at shortlisted now, not "ever reached".
 * - inPipeline:          applications still in play — current status is one of
 *                        applied, shortlisted, interview_scheduled, selected,
 *                        offer (hired, rejected and withdrawn are out).
 * - upcomingInterviews:  Interview docs with status scheduled or confirmed whose
 *                        scheduledAt is now or later.
 * - hired:               applications whose current status is "hired" (not
 *                        Placement rows — placements are the agency billing
 *                        record and lag or never exist for direct hires).
 * - conversionRate:      hired / applications, as a whole percent.
 *
 * The analytics funnel is deliberately different: it counts how many
 * candidates REACHED each stage (current status + statusHistory), so a hired
 * candidate still counts toward "shortlisted" there. Its copy says so.
 */
import { Types } from "mongoose";
import connectDB from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";

export const PIPELINE_STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Statuses of an application that is still in play. */
export const OPEN_PIPELINE_STATUSES: PipelineStatus[] = ["applied", "shortlisted", "interview_scheduled", "selected", "offer"];

/** Interview statuses that mean "this interview is going to happen". */
export const ACTIVE_INTERVIEW_STATUSES = ["scheduled", "confirmed"];

type Id = Types.ObjectId | string;

export const activeJobsFilter = (employerId: Id) => ({ employerId, status: "active", deletedAt: null });

export const upcomingInterviewsFilter = (employerId: Id, now = new Date()) => ({
  employerId,
  status: { $in: ACTIVE_INTERVIEW_STATUSES },
  scheduledAt: { $gte: now },
});

export interface EmployerPipelineCounts {
  activeJobs: number;
  applications: number;
  byStatus: Record<PipelineStatus, number>;
  inPipeline: number;
  upcomingInterviews: number;
  hired: number;
  /** Whole percent, 0 when there are no applications. */
  conversionRate: number;
}

export function conversionRate(hired: number, applications: number): number {
  return applications > 0 ? Math.round((hired / applications) * 100) : 0;
}

export async function getEmployerPipelineCounts(employerId: Id): Promise<EmployerPipelineCounts> {
  await connectDB();
  const [activeJobs, statusRows, upcomingInterviews] = await Promise.all([
    Job.countDocuments(activeJobsFilter(employerId)),
    Application.aggregate<{ _id: string; count: number }>([
      // $match does not cast strings the way find() does.
      { $match: { employerId: typeof employerId === "string" ? new Types.ObjectId(employerId) : employerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Interview.countDocuments(upcomingInterviewsFilter(employerId)),
  ]);

  const byStatus = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<PipelineStatus, number>;
  let applications = 0;
  for (const row of statusRows) {
    applications += row.count;
    if (row._id in byStatus) byStatus[row._id as PipelineStatus] = row.count;
  }
  const inPipeline = OPEN_PIPELINE_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  const hired = byStatus.hired;

  return {
    activeJobs,
    applications,
    byStatus,
    inPipeline,
    upcomingInterviews,
    hired,
    conversionRate: conversionRate(hired, applications),
  };
}
