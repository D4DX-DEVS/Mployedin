import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { notify } from "@/lib/notifications/trigger";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";

// Called by cron scheduler (e.g. Vercel Cron)
// Expires all pending offers whose expiresAt has passed

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const now = new Date();

  const expiredOffers = await Offer.find({
    status: "pending",
    expiresAt: { $lte: now },
  })
    .select("_id applicationId employerId jobSeekerId")
    .lean();

  if (!expiredOffers.length) {
    return NextResponse.json({ success: true, expired: 0, timestamp: now.toISOString() });
  }

  const offerIds = expiredOffers.map((o) => o._id);
  await Offer.updateMany({ _id: { $in: offerIds } }, { $set: { status: "expired" } });

  // Revert application status from "offer" back to "selected"
  const applicationIds = expiredOffers.map((o) => o.applicationId);
  await Application.updateMany(
    { _id: { $in: applicationIds }, status: "offer" },
    { $set: { status: "selected" } }
  );

  // Notify employers and job seekers
  const errors: string[] = [];
  for (const offer of expiredOffers) {
    try {
      const employer = await Employer.findById(offer.employerId).select("userId").lean();
      if (employer) {
        await notify({
          userId: String(employer.userId),
          type: "application_status_update",
          title: "Offer Expired",
          message: "An offer you sent has expired without a response.",
          link: `/en/employer/offers`,
          metadata: { offerId: String(offer._id) },
        }).catch(() => {});
      }

      const seeker = await JobSeeker.findById(offer.jobSeekerId).select("userId").lean();
      if (seeker) {
        await notify({
          userId: String(seeker.userId),
          type: "application_status_update",
          title: "Offer Expired",
          message: "An offer you received has expired.",
          link: `/en/job-seeker/offers`,
          metadata: { offerId: String(offer._id) },
        }).catch(() => {});
      }
    } catch (err) {
      errors.push(String(offer._id));
    }
  }

  return NextResponse.json({
    success: true,
    expired: expiredOffers.length,
    errors: errors.length,
    timestamp: now.toISOString(),
  });
}
