/**
 * Turn a hire into a Placement.
 *
 * A hire (offer accepted, or a card moved to "hired") used to change only
 * `Application.status`. Placements — which invoices, commissions and the
 * agent's `placementsCompleted` all hang off — were created only by an
 * admin-only POST that no screen called, so the platform's revenue loop never
 * started.
 *
 * Idempotent on `applicationId` (unique index on placements): calling it twice
 * for one application returns the existing placement.
 */

import type { ClientSession, Types } from "mongoose";
import Placement, { type IPlacement } from "@/models/Placement";
import Application from "@/models/Application";
import Job from "@/models/Job";
import Offer from "@/models/Offer";
import Agent from "@/models/Agent";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import logger from "@/lib/logger";

type Id = string | Types.ObjectId;

interface OfferTerms {
  _id?: unknown;
  salary?: { amount?: number; currency?: string; period?: string } | null;
  startDate?: Date | string | null;
}

export interface CreatePlacementForHireOptions {
  /** Run inside this transaction. Announcing is then left to the caller, after commit. */
  session?: ClientSession;
  /** The accepted offer, when the caller already has it. Otherwise the latest accepted offer is looked up. */
  offer?: OfferTerms | null;
}

export interface CreatePlacementForHireResult {
  placement: IPlacement;
  /** False when the application already had a placement. */
  created: boolean;
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}

/**
 * Create the placement for a hired application, or return the one it has.
 * Returns null when the application or its job no longer exists.
 */
export async function createPlacementForHire(
  applicationId: Id,
  { session, offer }: CreatePlacementForHireOptions = {},
): Promise<CreatePlacementForHireResult | null> {
  const existing = await Placement.findOne({ applicationId }).session(session ?? null);
  if (existing) return { placement: existing, created: false };

  const application = (await Application.findById(applicationId)
    .select("jobId jobSeekerId employerId")
    .session(session ?? null)
    .lean()) as { _id: Types.ObjectId; jobId?: Types.ObjectId; jobSeekerId?: Types.ObjectId; employerId?: Types.ObjectId } | null;
  if (!application?.jobId || !application.jobSeekerId) return null;

  const job = (await Job.findById(application.jobId)
    .select("employerId agentId")
    .session(session ?? null)
    .lean()) as { employerId?: Types.ObjectId; agentId?: Types.ObjectId } | null;
  const employerId = job?.employerId ?? application.employerId;
  if (!employerId) return null;

  // The agent credited is the job's agent, else the employer's assigned agent.
  let agentId = job?.agentId;
  if (!agentId) {
    const employer = (await Employer.findById(employerId).select("agentId").session(session ?? null).lean()) as
      | { agentId?: Types.ObjectId }
      | null;
    agentId = employer?.agentId;
  }
  const agent = agentId
    ? ((await Agent.findById(agentId).select("superAgentId").session(session ?? null).lean()) as
        | { superAgentId?: Types.ObjectId }
        | null)
    : null;

  const terms: OfferTerms | null =
    offer ??
    ((await Offer.findOne({ applicationId, status: "accepted" })
      .sort({ respondedAt: -1 })
      .select("salary startDate")
      .session(session ?? null)
      .lean()) as OfferTerms | null);

  const now = new Date();
  const doc = {
    applicationId: application._id,
    jobId: application.jobId,
    jobSeekerId: application.jobSeekerId,
    employerId,
    agentId: agentId ?? undefined,
    superAgentId: agent?.superAgentId ?? undefined,
    status: "active" as const,
    placedAt: now,
    startDate: terms?.startDate ? new Date(terms.startDate) : now,
    salary: typeof terms?.salary?.amount === "number" ? terms.salary.amount : undefined,
    ...(terms?.salary?.currency ? { currency: terms.salary.currency } : {}),
    visaStatus: "pending" as const,
    commissionPaid: false,
    notes: terms?.salary?.period
      ? `Created on hire from the accepted offer (${terms.salary.period} salary).`
      : "Created on hire.",
  };

  try {
    const [placement] = await Placement.create([doc], { session });
    return { placement, created: true };
  } catch (err) {
    // A concurrent hire of the same application won the unique index. Inside a
    // transaction the error aborts it, so let the caller's retry handle that.
    if (isDuplicateKey(err) && !session) {
      const winner = await Placement.findOne({ applicationId });
      if (winner) return { placement: winner, created: false };
    }
    throw err;
  }
}

/**
 * Side effects of a new placement: the agent's `placementsCompleted` counter,
 * and notices to the agent's super-agent and to admins. Shared by
 * POST /api/placements and the hire paths. Never throws.
 */
export async function announcePlacement(
  placement: Pick<IPlacement, "_id" | "agentId" | "jobSeekerId" | "jobId" | "employerId">,
  locale = "en",
): Promise<void> {
  const placementId = String(placement._id);
  try {
    if (placement.agentId) {
      const { incrementAgentCounter } = await import("@/lib/agentPerformance");
      incrementAgentCounter(String(placement.agentId), "placementsCompleted");
    }

    // jobSeekerId is a JobSeeker id; the name lives on its User.
    const seeker = placement.jobSeekerId
      ? ((await JobSeeker.findById(placement.jobSeekerId).select("userId").lean()) as { userId?: unknown } | null)
      : null;
    const [jsUser, jobDoc, empDoc] = await Promise.all([
      seeker?.userId ? User.findById(seeker.userId).select("name").lean() : null,
      placement.jobId ? Job.findById(placement.jobId).select("title").lean() : null,
      placement.employerId ? Employer.findById(placement.employerId).select("companyName").lean() : null,
    ]);
    const candidateName = (jsUser as { name?: string } | null)?.name ?? "A candidate";
    const jobTitle = (jobDoc as { title?: string } | null)?.title ?? "a position";
    const companyName = (empDoc as { companyName?: string } | null)?.companyName ?? "a company";

    const { getSuperAgentUserId, notifySuperAgentPlacement, notifyAdminsPlacement } = await import(
      "@/lib/notifications/trigger"
    );

    if (placement.agentId) {
      const saUserId = await getSuperAgentUserId(String(placement.agentId));
      if (saUserId) {
        notifySuperAgentPlacement(saUserId, candidateName, jobTitle, companyName, placementId, locale).catch((err) =>
          logger.error({ err, placementId }, "Failed to notify super agent of new placement"),
        );
      }
    }

    // Admins oversee the platform's revenue events.
    notifyAdminsPlacement(candidateName, jobTitle, companyName, placementId).catch((err) =>
      logger.error({ err, placementId }, "Failed to notify admins of new placement"),
    );
  } catch (err) {
    logger.error({ err, placementId }, "Failed to announce new placement");
  }
}
