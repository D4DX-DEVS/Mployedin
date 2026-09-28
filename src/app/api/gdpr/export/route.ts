import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Notification from "@/models/Notification";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";
import GdprRequest from "@/models/GdprRequest";
import ConsentLog from "@/models/ConsentLog";
import { getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import { createDeletionRequest } from "@/lib/gdpr/deletionRequest";

/**
 * Record a completed self-service request in the GDPR register the admin page
 * reads (`/api/admin/gdpr`). Best-effort: the export itself has already
 * happened, so a register write failure must not fail the request.
 */
async function recordGdprRequest(input: {
  userId: string;
  userName: string;
  userEmail: string;
  requestType: "export";
  req: NextRequest;
}): Promise<void> {
  try {
    await GdprRequest.create({
      userId: input.userId,
      userName: input.userName,
      userEmail: input.userEmail,
      requestType: input.requestType,
      status: "completed",
      completedAt: new Date(),
      ipAddress: getClientIp(input.req.headers),
    });
  } catch (err) {
    logger.error({ err, userId: input.userId, requestType: input.requestType }, "[gdpr] failed to record request in register");
  }
}

/**
 * GET /api/gdpr/export
 * Returns all data associated with the current user (GDPR data export).
 * Includes user profile, applications, interviews, notifications, consent logs,
 * GDPR requests, and for employers their company profile.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  // Max 3 exports per day per user to prevent data harvesting abuse
  const { allowed } = await checkRateLimit(`gdpr-export:${ctx.userId}`, { limit: 3, windowSec: 86400, prefix: "gdpr" });
  if (!allowed) {
    return NextResponse.json({ error: "Export limit reached. You may request up to 3 exports per day." }, { status: 429 });
  }

  await connectDB();

  // Application.jobSeekerId / Interview.jobSeekerId reference the JobSeeker
  // PROFILE _id, not the User _id — querying by ctx.userId always returned
  // empty arrays, making the export incomplete. Resolve the profile first.
  const seekerProfile = await JobSeeker.findOne({ userId: ctx.userId }).lean<{ _id: unknown } | null>();
  const employerProfile = ctx.role === "employer" ? await Employer.findOne({ userId: ctx.userId }).lean() : null;

  const [user, applications, interviews, notifications, consentLogs, gdprRequests] = await Promise.all([
    User.findById(ctx.userId).select("-passwordHash").lean(),
    seekerProfile
      ? Application.find({ jobSeekerId: seekerProfile._id }).populate("jobId", "title location").lean()
      : [],
    seekerProfile ? Interview.find({ jobSeekerId: seekerProfile._id }).lean() : [],
    Notification.find({ userId: ctx.userId }).lean(),
    ConsentLog.find({ userId: ctx.userId }).lean(),
    GdprRequest.find({ userId: ctx.userId }).lean(),
  ]);

  await logActivity({ ...actorFromCtx(ctx), action: "gdpr.export", resource: "users", resourceId: ctx.userId, req });
  const subject = user as { name?: string; email?: string } | null;
  await recordGdprRequest({
    userId: ctx.userId,
    userName: subject?.name ?? "Unknown",
    userEmail: subject?.email ?? "",
    requestType: "export",
    req,
  });

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user,
    seekerProfile,
    employerProfile,
    applications,
    interviews,
    notifications,
    consentLogs,
    gdprRequests,
  });
});

/**
 * DELETE /api/gdpr/export — kept for older clients. Asking for erasure no
 * longer erases on the spot: it opens a deletion request an admin completes
 * from the GDPR register (the same path as POST /api/gdpr/requests).
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const result = await createDeletionRequest(req, ctx);
  if (!result.ok) {
    return result.code === "ADMIN_ACCOUNT"
      ? NextResponse.json({ error: "Administrator accounts can't be deleted this way.", code: result.code }, { status: 403 })
      : NextResponse.json({ error: "You already have a deletion request open.", code: result.code }, { status: 409 });
  }
  return NextResponse.json({ success: true, requestId: result.requestId }, { status: 202 });
});
