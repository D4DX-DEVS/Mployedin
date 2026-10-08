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
import GdprRequest from "@/models/GdprRequest";
import { getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import { redactUserMessages } from "@/lib/gdpr/redactMessages";
import { deleteCvRecordsOfSeeker } from "@/lib/cv/cvDocuments";
import { deactivateEmployerAccount } from "@/lib/employers/accountStatus";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import CookieConsentRecord from "@/models/CookieConsentRecord";
import { z } from "zod";

/**
 * Record a completed self-service request in the GDPR register the admin page
 * reads (`/api/admin/gdpr`). Best-effort: the export / erasure itself has
 * already happened, so a register write failure must not fail the request.
 */
async function recordGdprRequest(input: {
  userId: string;
  userName: string;
  userEmail: string;
  requestType: "export" | "delete";
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

  const [user, applications, interviews, notifications, cookieConsents] = await Promise.all([
    User.findById(ctx.userId).select("-passwordHash").lean(),
    seekerProfile
      ? Application.find({ jobSeekerId: seekerProfile._id }).populate("jobId", "title location").lean()
      : [],
    seekerProfile ? Interview.find({ jobSeekerId: seekerProfile._id }).lean() : [],
    Notification.find({ userId: ctx.userId }).lean(),
    // Proof-of-consent history for cookies while signed in (art 15 access).
    CookieConsentRecord.find({ userId: ctx.userId })
      .select("consentId policyVersion choices method gpc locale pageUrl createdAt")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
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
    applications,
    interviews,
    notifications,
    cookieConsents,
  });
});

/**
 * GDPR-2: JobSeeker fields that SURVIVE erasure — identity/structure only
 * (ids, references other records point through, timestamps, and the flags
 * that keep the empty shell out of search). Every other top-level path of the
 * schema is $unset, so a field added later is erased by default instead of
 * silently surviving (the old deny-list missed name, DOB, national ID, visa,
 * addresses, social links, salary, embeddings…).
 */
const JOB_SEEKER_ERASURE_KEEP = new Set([
  "_id", "__v", "id", "userId", "agentId", "referral", "isAgentReferred",
  "applicationIds", "createdAt", "updatedAt", "profileVisibility", "roleArchivedAt",
]);
/** Always cleared, even if schema introspection is unavailable. */
const JOB_SEEKER_ERASURE_REQUIRED = [
  "fullName", "dateOfBirth", "gender", "genderId", "maritalStatusId", "nationality",
  "nationalId", "visaNumber", "passportNumber", "bankAccountNumber", "iban",
  "currentLocation", "permanentAddress", "hometown", "pincode", "socialLinks",
  "certifications", "projects", "accomplishments", "summary", "headline",
  "currentSalary", "preferredSalary", "searchEmbedding", "embedding",
  "cv", "skills", "experience", "education", "languages", "documents",
  "careerProfile", "diversityInclusion",
];

function jobSeekerErasureUnset(): Record<string, 1> {
  const schemaPaths = Object.keys((JobSeeker as { schema?: { paths?: Record<string, unknown> } }).schema?.paths ?? {})
    .map((p) => p.split(".")[0]);
  const fields = new Set([...JOB_SEEKER_ERASURE_REQUIRED, ...schemaPaths]);
  const unset: Record<string, 1> = {};
  for (const f of fields) if (!JOB_SEEKER_ERASURE_KEEP.has(f)) unset[f] = 1;
  return unset;
}

const erasureBodySchema = z.object({ password: z.string().min(1).max(200).optional() }).passthrough();

/**
 * DELETE /api/gdpr/export
 * Right to erasure — anonymizes the user's account and deletes personal data.
 *
 * Body: `{ password }` — required for accounts that have a password (a stolen
 * session alone must not be able to destroy the account). OAuth-only
 * accounts have no password to confirm.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  // Throttle password guesses through this endpoint.
  const { allowed } = await checkRateLimit(`gdpr-erase:${ctx.userId}`, { limit: 5, windowSec: 3600, prefix: "gdpr" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many erasure attempts. Try again later." }, { status: 429 });
  }

  await connectDB();

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    // no body
  }
  const parsedBody = erasureBodySchema.safeParse(rawBody ?? {});
  const password = parsedBody.success ? parsedBody.data.password : undefined;

  const account = await User.findById(ctx.userId).select("+passwordHash role isActive");
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Fresh password confirmation for credentials users.
  if (account.passwordHash) {
    if (!password) {
      return NextResponse.json(
        { error: "password_confirmation_required", message: "Confirm your password to erase your account." },
        { status: 400 },
      );
    }
    if (!(await account.comparePassword(password))) {
      return NextResponse.json({ error: "invalid_password", message: "Password is incorrect." }, { status: 403 });
    }
  }

  const role = account.role as string;

  // Never erase the platform's last active admin — nobody could administer it.
  if (role === "admin") {
    const otherAdmins = await User.countDocuments({ role: "admin", isActive: true, _id: { $ne: account._id } });
    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "last_admin", message: "You are the last active admin. Appoint another admin before erasing this account." },
        { status: 409 },
      );
    }
  }

  // Role-specific shutdown BEFORE the identity disappears.
  const archivedAt = new Date();
  if (role === "employer") {
    // Pauses the company's live jobs and marks the employer inactive.
    await deactivateEmployerAccount(ctx.userId);
    await Employer.updateOne({ userId: ctx.userId }, { $set: { roleArchivedAt: archivedAt } });
  } else if (role === "agent") {
    await Agent.updateOne({ userId: ctx.userId }, { $set: { roleArchivedAt: archivedAt } });
  } else if (role === "super_agent") {
    await SuperAgent.updateOne({ userId: ctx.userId }, { $set: { roleArchivedAt: archivedAt } });
  }

  const anonymizedEmail = `deleted_${ctx.userId}@anonymized.mployedin.com`;

  const [, seekerBefore] = await Promise.all([
    // Anonymize user account (same "Deleted User" identity redactUserMessages uses).
    User.findByIdAndUpdate(ctx.userId, {
      $set: {
        name: "Deleted User",
        email: anonymizedEmail,
        isActive: false,
        deletedAt: new Date(),
      },
      $unset: { phone: 1, avatar: 1 },
    }),
    // Allow-list erasure of the job seeker profile (GD-1). findOneAndUpdate
    // returns the PRE-update doc, so `seekerBefore` still carries cv.originalUrl
    // and documents for the storage hard-delete below.
    JobSeeker.findOneAndUpdate(
      { userId: ctx.userId },
      {
        $unset: jobSeekerErasureUnset(),
        $set: { profileVisibility: "hidden", roleArchivedAt: archivedAt },
      }
    ).select("cv documents").lean<{ _id?: unknown; cv?: { originalUrl?: string }; documents?: { url?: string }[] } | null>(),
    // Delete notifications
    Notification.deleteMany({ userId: ctx.userId }),
    // Keep cookie-consent proof (needed to demonstrate past consent) but cut
    // the link to the erased account and drop the device details.
    CookieConsentRecord.updateMany({ userId: ctx.userId }, { $unset: { userId: 1, userAgent: 1, ipHash: 1 } }),
  ]);

  // Messages the user wrote, and their name on other people's conversation lists.
  try {
    await redactUserMessages(ctx.userId);
  } catch (err) {
    // The account is already deactivated, so the user can't retry: record it for staff.
    logger.error({ err, userId: ctx.userId }, "[gdpr] message redaction failed during erasure");
  }

  // Hard-delete uploaded files from storage — DB erasure alone left the objects
  // behind. Best-effort: a storage failure must not fail the erasure itself
  // (fields are already unset; the bucket is private). Besides the CV, the
  // seeker's document library and every application attachment are theirs too,
  // and stayed downloadable by employers after erasure.
  const fileUrls = [
    seekerBefore?.cv?.originalUrl,
    ...(seekerBefore?.documents ?? []).map((d) => d.url),
  ];
  if (seekerBefore?._id) {
    const applications = await Application.find({ jobSeekerId: seekerBefore._id })
      .select("documents")
      .lean<{ documents?: { url?: string }[] }[]>();
    fileUrls.push(...applications.flatMap((a) => (a.documents ?? []).map((d) => d.url)));
    await Application.updateMany({ jobSeekerId: seekerBefore._id }, { $set: { documents: [] } });
  }
  const { deleteFile } = await import("@/lib/storage/spaces");
  for (const url of new Set(fileUrls.filter((u): u is string => Boolean(u)))) {
    try {
      await deleteFile(url);
    } catch (err) {
      // Best-effort, but the DB no longer references this object: the log line
      // is the only record left of what still needs deleting from the bucket.
      logger.warn({ err, userId: ctx.userId, url }, "[gdpr] erasure could not delete stored file");
    }
  }
  // The CV records hold each CV's full text and what was read from it.
  if (seekerBefore?._id) {
    try {
      await deleteCvRecordsOfSeeker(seekerBefore._id as string);
    } catch (err) {
      logger.error({ err, userId: ctx.userId }, "[gdpr] erasure could not delete CV records");
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
  // The register must not keep the erased identity — record the anonymised one.
  await recordGdprRequest({
    userId: ctx.userId,
    userName: "Deleted User",
    userEmail: anonymizedEmail,
    requestType: "delete",
    req,
  });

  return NextResponse.json({ success: true, message: "Account data has been anonymized per GDPR request." });
});
