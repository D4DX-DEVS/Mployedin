import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { notify } from "@/lib/notifications/trigger";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import logger from "@/lib/logger";
import { forEachBounded, byId } from "@/lib/cron/scale";
import { OPEN_OFFER_STATUSES } from "@/lib/offers/status";
import { userLocalePath } from "@/lib/i18n/localePath";

export const maxDuration = 300;

// Called by cron scheduler (e.g. Vercel Cron)
// Expires all open (pending or countered) offers whose expiresAt has passed.
// A countered offer left open forever blocked any new offer on the application
// (one open offer per application).

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();
  const now = new Date();

  const expiredOffers = await Offer.find({
    status: { $in: [...OPEN_OFFER_STATUSES] },
    expiresAt: { $lte: now },
  })
    .select("_id applicationId employerId jobSeekerId")
    .limit(500)
    .lean();
  // Next scheduled run will process any remainder.

  if (!expiredOffers.length) {
    return NextResponse.json({ success: true, expired: 0, timestamp: now.toISOString() });
  }

  const offerIds = expiredOffers.map((o) => o._id);
  // Re-check the status so an offer answered since the read is left alone.
  await Offer.updateMany(
    { _id: { $in: offerIds }, status: { $in: [...OPEN_OFFER_STATUSES] } },
    {
      $set: { status: "expired" },
      $push: { events: { type: "expired", at: now, actorRole: "system" } },
    },
  );

  // Revert application status from "offer" back to "selected", on the record
  // too — the timeline and time-to-hire read statusHistory.
  const applicationIds = expiredOffers.map((o) => o.applicationId);
  await Application.updateMany(
    { _id: { $in: applicationIds }, status: "offer" },
    {
      $set: { status: "selected" },
      $push: { statusHistory: { status: "selected", changedAt: now, note: "Offer expired" } },
    },
  );

  // Batch-fetch employers and seekers
  const employerIds = expiredOffers.map((o) => o.employerId).filter(Boolean);
  const jobSeekerIds = expiredOffers.map((o) => o.jobSeekerId).filter(Boolean);

  const employers = await Employer.find({ _id: { $in: employerIds } }).select("_id userId").lean();
  const employerMap = byId(employers);

  const seekers = await JobSeeker.find({ _id: { $in: jobSeekerIds } }).select("_id userId").lean();
  const seekerMap = byId(seekers);

  // Notify employers and job seekers with bounded concurrency
  const { failed } = await forEachBounded(expiredOffers, 10, async (offer) => {
    const employer = employerMap.get(String(offer.employerId));
    if (employer) {
      await notify({
        userId: String(employer.userId),
        type: "application_status_update",
        title: "Offer Expired",
        message: "An offer you sent has expired without a response.",
        link: await userLocalePath(employer.userId, "/employer/offers"),
        metadata: { offerId: String(offer._id) },
      });
    } else {
      logger.warn({ offerId: String(offer._id), employerId: String(offer.employerId) }, "Employer not found for offer");
    }

    const seeker = seekerMap.get(String(offer.jobSeekerId));
    if (seeker) {
      await notify({
        userId: String(seeker.userId),
        type: "application_status_update",
        title: "Offer Expired",
        message: "An offer you received has expired.",
        link: await userLocalePath(seeker.userId, "/job-seeker/offers"),
        metadata: { offerId: String(offer._id) },
      });
    } else {
      logger.warn({ offerId: String(offer._id), jobSeekerId: String(offer.jobSeekerId) }, "Job seeker not found for offer");
    }
  });

  return NextResponse.json({
    success: true,
    expired: expiredOffers.length,
    errors: failed,
    timestamp: now.toISOString(),
  });
}
