import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkScreeningSchema } from "@/lib/validators/applications";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { notify } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * POST /api/applications/bulk-screening
 * Send screening questions to selected applications.
 * Skip applications that already have screening answers.
 *
 * Request body: { applicationIds: string[] }
 * Response: { sent: number, skipped: number, errors: string[] }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(
    `bulk-screening:${ctx.userId ?? ip}`,
    RATE_LIMIT_CONFIGS.bulk
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  await connectDB();

  // Only employers, agents, super_agents, admins can perform bulk actions
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, bulkScreeningSchema);
  const { applicationIds } = body;

  // Resolve which employer(s) this actor may touch. null = admin (unscoped).
  let allowedEmployerIds: string[] | null = null;
  let employerId: string | null = null;

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId })
      .select("_id")
      .lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);
    allowedEmployerIds = [employerId];
  } else if (ctx.role !== "admin") {
    // Agents and super agents: the shared default-deny scope helper.
    allowedEmployerIds = ((await getScopedEmployerIds(ctx)) ?? []).map(String);
  }

  // Fetch applications to validate ownership
  const query: Record<string, unknown> = { _id: { $in: applicationIds } };
  if (allowedEmployerIds) query.employerId = { $in: allowedEmployerIds };

  const applications = await Application.find(query)
    .select(
      "_id jobSeekerId jobId screeningAnswers screeningRequestedAt screeningAnsweredAt"
    )
    .populate({
      path: "jobSeekerId",
      select: "userId email fullName",
      populate: { path: "userId", select: "_id name email" },
    })
    .populate("jobId", "title screeningQuestions");

  if (!applications.length) {
    return NextResponse.json(
      { error: "No matching applications found" },
      { status: 404 }
    );
  }

  if (applications.length !== applicationIds.length && ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Some applications are outside your scope" },
      { status: 403 }
    );
  }

  // Process each application: skip if already answered, send if not
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  for (const app of applications) {
    try {
      // Check if already has screening answers
      // Answered at apply time (no screeningAnsweredAt) or after a request.
      if ((app.screeningAnswers?.length ?? 0) > 0 || app.screeningAnsweredAt) {
        skipped++;
        continue;
      }

      // Get job seeker info
      const jobSeeker = app.jobSeekerId as unknown as {
        _id?: unknown;
        userId?: { _id?: unknown; email?: string; name?: string } | string;
        email?: string;
        fullName?: string;
      } | null;

      const job = app.jobId as unknown as {
        title?: string;
        screeningQuestions?: unknown[];
      } | null;

      const seekerEmail = typeof jobSeeker?.userId === "object"
        ? (jobSeeker.userId as { email?: string })?.email
        : jobSeeker?.email;

      if (!seekerEmail) {
        errors.push(`Application ${app._id}: seeker email not found`);
        continue;
      }

      // Check if job has screening questions
      if (
        !job?.screeningQuestions ||
        (Array.isArray(job.screeningQuestions) && job.screeningQuestions.length === 0)
      ) {
        errors.push(
          `Application ${app._id}: job has no screening questions`
        );
        continue;
      }

      // Mark as screening requested
      app.screeningRequestedAt = now;
      app.screeningRequestedBy = ctx.userId as unknown as import("mongoose").Types.ObjectId;
      await app.save();

      // Log activity
      await logActivity({
        ...actorFromCtx(ctx),
        action: "screening_requested",
        resource: "application",
        resourceId: String(app._id),
      });

      // Emit notification (email will be sent via Inngest worker)
      const userId = typeof jobSeeker?.userId === "object"
        ? String((jobSeeker.userId as { _id?: unknown })?._id)
        : String(jobSeeker?.userId);

      await notify({
        userId,
        type: "application_invite",
        title: "Screening Questions",
        message: "You have been sent screening questions for your application.",
        titleKey: "screeningRequestTitle",
        bodyKey: "screeningRequestBody",
        params: {
          jobTitle: job?.title ?? "Position",
        },
        link: `/job-seeker/applications/${app._id}/screening-answers`,
        sendEmail: true,
      });

      sent++;
    } catch (error) {
      logger.error({ error, appId: app._id }, "Error processing screening request");
      errors.push(
        `Application ${app._id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors,
    total: applications.length,
  });
}

export const POST = withAuth(postHandler);
