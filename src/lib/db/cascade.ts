/**
 * Cascade cleanup for entity deletion.
 *
 * MongoDB has no foreign keys, so deleting a User/Employer/JobSeeker/Agent
 * leaves dependent documents (Applications, Interviews, Offers, Placements,
 * Commissions, SavedJobs, Notifications, Leads, ...) pointing at a dead _id.
 * These helpers remove or detach those dependents so we never leave dangling
 * references.
 *
 * Reference conventions (verified against the model schemas):
 *  - Employer/JobSeeker/Agent/SuperAgent profiles ref User via `userId`.
 *  - Application/Interview/Offer/Placement ref the PROFILE _id
 *    (jobSeekerId → JobSeeker, employerId → Employer, agentId → Agent).
 *  - SavedJob.jobSeekerId / SavedSearch.userId / Notification.userId ref User._id.
 *  - Commission ref agentId/superAgentId/placementId (not employer/jobseeker).
 *
 * These run best-effort and non-transactionally (the app connects to a single
 * Mongo node without a guaranteed replica set, so multi-doc transactions are
 * not available). Each step is isolated so one failure does not abort the rest.
 */

import mongoose, { type Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import OfferLetter from "@/models/OfferLetter";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Lead from "@/models/Lead";
import Job from "@/models/Job";
import JobTemplate from "@/models/JobTemplate";
import SavedJob from "@/models/SavedJob";
import Notification from "@/models/Notification";

export type CascadeSummary = Record<string, number>;

type DeleteResult = { deletedCount?: number };
type UpdateResult = { modifiedCount?: number };

/** Run a deleteMany / updateMany and record the affected count, never throwing. */
async function track(
  summary: CascadeSummary,
  label: string,
  op: Promise<DeleteResult | UpdateResult>,
): Promise<void> {
  try {
    const r = await op;
    const count =
      (r as DeleteResult).deletedCount ?? (r as UpdateResult).modifiedCount ?? 0;
    if (count) summary[label] = (summary[label] ?? 0) + count;
  } catch (err) {
    console.error(`[cascade] failed on "${label}":`, err);
  }
}

/**
 * Permanently delete all dependents of an Employer.
 * Call BEFORE removing the Employer profile + User document.
 * @param employerUserId The User._id of the employer being deleted.
 */
export async function cascadeDeleteEmployer(
  employerUserId: string | Types.ObjectId,
): Promise<CascadeSummary> {
  await connectDB();
  const summary: CascadeSummary = {};

  const employer = await Employer.findOne({ userId: employerUserId })
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();

  if (employer?._id) {
    const empId = employer._id;

    // Commissions linked through this employer's placements.
    const placements = await Placement.find({ employerId: empId })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>();
    const placementIds = placements.map((p) => p._id);
    if (placementIds.length) {
      await track(
        summary,
        "commissions",
        Commission.deleteMany({ placementId: { $in: placementIds } }),
      );
    }

    await track(summary, "placements", Placement.deleteMany({ employerId: empId }));
    await track(summary, "offerLetters", OfferLetter.deleteMany({ employerId: empId }));
    await track(summary, "offers", Offer.deleteMany({ employerId: empId }));
    await track(summary, "interviews", Interview.deleteMany({ employerId: empId }));
    await track(summary, "applications", Application.deleteMany({ employerId: empId }));
    await track(summary, "jobTemplates", JobTemplate.deleteMany({ employerId: empId }));
    await track(summary, "jobs", Job.deleteMany({ employerId: empId }));

    // Detach from agent assignments and converted-lead links.
    await track(
      summary,
      "agentAssignments",
      Agent.updateMany(
        { assignedEmployerIds: empId },
        { $pull: { assignedEmployerIds: empId } },
      ),
    );
    await track(
      summary,
      "leadLinks",
      Lead.updateMany(
        { convertedToEmployerId: empId },
        { $unset: { convertedToEmployerId: "" } },
      ),
    );
  }

  return summary;
}

/**
 * Permanently delete all dependents of a JobSeeker.
 * Call BEFORE removing the JobSeeker profile + User document.
 * @param jobSeekerUserId The User._id of the job seeker being deleted.
 */
export async function cascadeDeleteJobSeeker(
  jobSeekerUserId: string | Types.ObjectId,
): Promise<CascadeSummary> {
  await connectDB();
  const summary: CascadeSummary = {};

  const seeker = await JobSeeker.findOne({ userId: jobSeekerUserId })
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();

  if (seeker?._id) {
    const jsId = seeker._id;

    const placements = await Placement.find({ jobSeekerId: jsId })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>();
    const placementIds = placements.map((p) => p._id);
    if (placementIds.length) {
      await track(
        summary,
        "commissions",
        Commission.deleteMany({ placementId: { $in: placementIds } }),
      );
    }

    await track(summary, "placements", Placement.deleteMany({ jobSeekerId: jsId }));
    await track(summary, "offers", Offer.deleteMany({ jobSeekerId: jsId }));
    await track(summary, "interviews", Interview.deleteMany({ jobSeekerId: jsId }));
    await track(summary, "applications", Application.deleteMany({ jobSeekerId: jsId }));
  }

  // These reference User._id directly.
  await track(summary, "savedJobs", SavedJob.deleteMany({ jobSeekerId: jobSeekerUserId }));
  // SavedSearch is registered lazily (not a dedicated model file); only act if loaded.
  const SavedSearch = mongoose.models.SavedSearch;
  if (SavedSearch) {
    await track(summary, "savedSearches", SavedSearch.deleteMany({ userId: jobSeekerUserId }));
  }
  await track(summary, "notifications", Notification.deleteMany({ userId: jobSeekerUserId }));

  return summary;
}

/**
 * Detach/clean dependents when an Agent or Super Agent user is permanently
 * deleted. Agents are operational, not financial owners, so we DETACH their
 * optional references on operational records and remove their Leads, but we do
 * NOT delete Commissions (retained for accounting; they also carry invoiceId).
 * @param userId  The User._id of the agent/super_agent.
 * @param role    "agent" | "super_agent"
 */
export async function cascadeDeleteAgentUser(
  userId: string | Types.ObjectId,
  role: "agent" | "super_agent",
): Promise<CascadeSummary> {
  await connectDB();
  const summary: CascadeSummary = {};

  if (role === "agent") {
    const agent = await Agent.findOne({ userId })
      .select("_id")
      .lean<{ _id: Types.ObjectId } | null>();
    if (agent?._id) {
      const agentId = agent._id;
      await track(summary, "leads", Lead.deleteMany({ agentId }));
      await track(
        summary,
        "superAgentLinks",
        SuperAgent.updateMany({ agentIds: agentId }, { $pull: { agentIds: agentId } }),
      );
      await track(
        summary,
        "applicationsDetached",
        Application.updateMany({ agentId }, { $unset: { agentId: "" } }),
      );
      await track(
        summary,
        "interviewsDetached",
        Interview.updateMany({ agentId }, { $unset: { agentId: "" } }),
      );
      await track(
        summary,
        "placementsDetached",
        Placement.updateMany({ agentId }, { $unset: { agentId: "" } }),
      );
    }
  } else {
    const superAgent = await SuperAgent.findOne({ userId })
      .select("_id")
      .lean<{ _id: Types.ObjectId } | null>();
    if (superAgent?._id) {
      const saId = superAgent._id;
      await track(
        summary,
        "leadsDetached",
        Lead.updateMany({ superAgentId: saId }, { $unset: { superAgentId: "" } }),
      );
      await track(
        summary,
        "placementsDetached",
        Placement.updateMany({ superAgentId: saId }, { $unset: { superAgentId: "" } }),
      );
    }
  }

  return summary;
}
