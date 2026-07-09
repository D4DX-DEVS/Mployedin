import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Notification from "@/models/Notification";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * GET /api/gdpr/export
 * Returns all data associated with the current user (GDPR data export).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  // Max 3 exports per day per user to prevent data harvesting abuse
  const { allowed } = await checkRateLimit(`gdpr-export:${ctx.userId}`, { limit: 3, windowSec: 86400, prefix: "gdpr" });
  if (!allowed) {
    return NextResponse.json({ error: "Export limit reached. You may request up to 3 exports per day." }, { status: 429 });
  }

  await connectDB();

  const [user, seekerProfile, applications, interviews, notifications] = await Promise.all([
    User.findById(ctx.userId).select("-passwordHash").lean(),
    JobSeeker.findOne({ userId: ctx.userId }).lean(),
    Application.find({ jobSeekerId: ctx.userId }).populate("jobId", "title location").lean(),
    Interview.find({ jobSeekerId: ctx.userId }).lean(),
    Notification.find({ userId: ctx.userId }).lean(),
  ]);

  await logActivity({ ...actorFromCtx(ctx), action: "gdpr.export", resource: "users", resourceId: ctx.userId, req });

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user,
    seekerProfile,
    applications,
    interviews,
    notifications,
  });
});

/**
 * DELETE /api/gdpr/export
 * Right to erasure — anonymizes the user's account and deletes personal data.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();

  const anonymizedEmail = `deleted_${ctx.userId}@anonymized.mployedin.com`;

  const [, seekerBefore] = await Promise.all([
    // Anonymize user account
    User.findByIdAndUpdate(ctx.userId, {
      name: "Deleted User",
      email: anonymizedEmail,
      phone: null,
      isActive: false,
      deletedAt: new Date(),
    }),
    // Delete job seeker profile data. Field names MUST match the schema exactly
    // or $unset silently no-ops: `cv` (holds originalUrl + parsed resume text)
    // and `experience` were previously misnamed `cvUrl`/`workExperience`, so
    // that PII survived "erasure". Also clear financial PII (bank/IBAN).
    // findOneAndUpdate returns the PRE-update doc, so `seekerBefore` still
    // carries cv.originalUrl for the storage hard-delete below.
    JobSeeker.findOneAndUpdate(
      { userId: ctx.userId },
      {
        $unset: {
          cv: 1,
          skills: 1,
          experience: 1,
          education: 1,
          languages: 1,
          nationality: 1,
          passportNumber: 1,
          bankAccountNumber: 1,
          iban: 1,
        },
      }
    ).select("cv").lean<{ cv?: { originalUrl?: string } } | null>(),
    // Delete notifications
    Notification.deleteMany({ userId: ctx.userId }),
  ]);

  // Hard-delete the CV file from storage — DB erasure alone left the S3 object
  // behind. Best-effort: a storage failure must not fail the erasure itself
  // (fields are already unset; the bucket is private).
  const cvUrl = seekerBefore?.cv?.originalUrl;
  if (cvUrl) {
    try {
      const { deleteFile } = await import("@/lib/storage/spaces");
      await deleteFile(cvUrl);
    } catch {
      /* best-effort */
    }
  }

  // Log the erasure
  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.erasure",
    resource: "users",
    resourceId: ctx.userId,
    meta: { reason: "GDPR right to erasure" },
    req,
  });

  return NextResponse.json({ success: true, message: "Account data has been anonymized per GDPR request." });
});
