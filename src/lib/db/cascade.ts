/**
 * Cascade cleanup for entity deletion.
 *
 * MongoDB has no foreign keys, so deleting a User/Employer/JobSeeker/Agent
 * leaves dependent documents (Applications, Interviews, Offers, Placements,
 * Commissions, Notifications, Leads, ...) pointing at a dead _id.
 * These helpers remove or detach those dependents so we never leave dangling
 * references.
 *
 * Reference conventions (verified against the model schemas):
 *  - Employer/JobSeeker/Agent/SuperAgent profiles ref User via `userId`.
 *  - Application/Interview/Offer/Placement ref the PROFILE _id
 *    (jobSeekerId → JobSeeker, employerId → Employer, agentId → Agent).
 *  - Notification.userId refs User._id.
 *  - Commission ref agentId/superAgentId/placementId (not employer/jobseeker).
 *
 * These run best-effort and non-transactionally (the app connects to a single
 * Mongo node without a guaranteed replica set, so multi-doc transactions are
 * not available). Each step is isolated so one failure does not abort the rest.
 */

import { type Types } from "mongoose";
import logger from "@/lib/logger";
import { mirrorLogErase } from "@/lib/logs/logStore";
import { eraseMatchVectors } from "@/lib/matching/vectorStore";
import { eraseSearchVector } from "@/lib/ai/searchVectors";
import { dataWorkerConfigured } from "@/lib/cloudflare/dataWorkerClient";
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
import Notification from "@/models/Notification";
import SavedJob from "@/models/SavedJob";

export type CascadeSummary = Record<string, number>;

type Deletable = { deleteMany: (filter: Record<string, unknown>) => PromiseLike<DeleteResult> };
type ModelModule = Record<string, unknown> & { default?: unknown };

/**
 * Records an employer owns that mean nothing once the company is gone. A
 * permanent delete used to leave all of them: live on 2026-10-12 a deleted
 * company's career page was still served publicly and its talent pool stayed
 * (audit FUNC-015). Several hold candidate data (background checks, diversity
 * answers, feedback, surveys) and API keys would still authenticate. Each is
 * keyed by the Employer profile id. Invoices are deliberately not here: they
 * are the accounting record.
 *
 * Loaded on demand — the cascade runs rarely and these models are otherwise
 * unrelated to the routes that import this file.
 */
const EMPLOYER_OWNED: ReadonlyArray<[label: string, load: () => Promise<ModelModule>, exportName?: string]> = [
  ["apiKeys", () => import("@/models/ApiKey")],
  ["applicationFeedback", () => import("@/models/ApplicationFeedback"), "ApplicationFeedback"],
  ["applicationForms", () => import("@/models/ApplicationForm")],
  ["approvalWorkflows", () => import("@/models/ApprovalWorkflow")],
  ["backgroundChecks", () => import("@/models/BackgroundCheck"), "BackgroundCheck"],
  ["surveyTemplates", () => import("@/models/CandidateSurvey"), "SurveyTemplate"],
  ["surveyResponses", () => import("@/models/CandidateSurvey"), "SurveyResponse"],
  ["careerPages", () => import("@/models/CareerPage")],
  ["commTemplates", () => import("@/models/CommTemplate"), "CommTemplate"],
  ["companyProfileViews", () => import("@/models/CompanyProfileView"), "CompanyProfileView"],
  ["companyReviews", () => import("@/models/CompanyReview"), "CompanyReview"],
  ["diversityResponses", () => import("@/models/DiversityResponse")],
  ["emailSequences", () => import("@/models/EmailSequence")],
  ["employeeReferrals", () => import("@/models/EmployeeReferral")],
  ["extractionDrafts", () => import("@/models/ExtractionDraft"), "ExtractionDraft"],
  ["hiringDecisions", () => import("@/models/HiringDecision"), "HiringDecision"],
  ["matchingWeightTemplates", () => import("@/models/MatchingWeightTemplate"), "MatchingWeightTemplate"],
  ["onboardingChecklists", () => import("@/models/OnboardingChecklist"), "OnboardingChecklist"],
  ["posterGenerations", () => import("@/models/PosterGeneration")],
  ["referralLinks", () => import("@/models/ReferralLink"), "ReferralLink"],
  ["requisitions", () => import("@/models/Requisition")],
  ["scorecards", () => import("@/models/Scorecard"), "Scorecard"],
  ["skillAssessments", () => import("@/models/SkillAssessment"), "SkillAssessment"],
  ["talentPools", () => import("@/models/TalentPool")],
  ["tenantViewSessions", () => import("@/models/TenantViewSession")],
  ["workflowTemplates", () => import("@/models/WorkflowTemplate"), "WorkflowTemplate"],
];

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
    logger.error({ err, operation: label }, "[cascade] operation failed");
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
    // Their matching vectors in Vectorize go with them (looked up first: the rows are about to go).
    const jobIds = dataWorkerConfigured() ? ((await Job.distinct("_id", { employerId: empId })) as unknown[]).map(String) : [];
    await track(summary, "jobs", Job.deleteMany({ employerId: empId }));
    try {
      await eraseMatchVectors("job", jobIds);
    } catch (err) {
      logger.error({ err, operation: "job vectors (Vectorize)" }, "[cascade] operation failed");
    }

    for (const [label, load, exportName] of EMPLOYER_OWNED) {
      try {
        const mod = await load();
        const model = (exportName ? mod[exportName] : mod.default) as Deletable;
        await track(summary, label, Promise.resolve(model.deleteMany({ employerId: empId })));
      } catch (err) {
        logger.error({ err, operation: label }, "[cascade] operation failed");
      }
    }
    // LOGS_STORE=dual: the D1 copy of the employer's page views goes too.
    try {
      await mirrorLogErase("company_profile_view", "employer_id", [String(empId)]);
    } catch (err) {
      logger.error({ err, operation: "companyProfileViews (D1)" }, "[cascade] operation failed");
    }

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

  await track(summary, "notifications", Notification.deleteMany({ userId: employerUserId }));

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
    await track(summary, "savedJobs", SavedJob.deleteMany({ jobSeekerId: jsId }));
    try {
      await eraseMatchVectors("seeker", [String(jsId)]);
      await eraseSearchVector(String(jsId));
    } catch (err) {
      logger.error({ err, operation: "seeker vector (Vectorize)" }, "[cascade] operation failed");
    }
  }

  // References User._id directly.
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
      // Otherwise the team keeps pointing at a super agent that no longer
      // exists, and reads as "already assigned" when an admin re-homes it.
      await track(
        summary,
        "agentsDetached",
        Agent.updateMany({ superAgentId: saId }, { $unset: { superAgentId: "" } }),
      );
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
