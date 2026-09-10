import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkActionSchema } from "@/lib/validators/applications";
import { sanitizeHtml } from "@/lib/security/html";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import Agent from "@/models/Agent";
import { getSuperAgentEmployerIds } from "@/lib/auth/agentRestrictions";
import {
  notify,
  notifyRejected,
  notifyStatusChange,
  notifyOfferMade,
} from "@/lib/notifications/trigger";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import CommTemplate from "@/models/CommTemplate";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { resolveHiringRulesForJob, type WorkflowSettingsCarrier } from "@/lib/hiring/workflowSettings";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = await checkRateLimit(`bulk:${ctx.userId ?? ip}`, RATE_LIMIT_CONFIGS.bulk);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  await connectDB();

  const body = await validateBody(req, bulkActionSchema);
  const { applicationIds, action, params } = body;

  // Only employers, agents, super_agents, admins can perform bulk actions
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve which employer(s) this actor may touch. null = admin (unscoped).
  let allowedEmployerIds: string[] | null = null;
  let employerId: string | null = null;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);
    allowedEmployerIds = [employerId];
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    const owned = await Employer.find({ agentId: agent._id }).select("_id").lean();
    allowedEmployerIds = [...new Set([
      ...((agent.assignedEmployerIds as unknown[]) ?? []).map(String),
      ...owned.map((e) => String(e._id)),
    ])];
  } else if (ctx.role === "super_agent") {
    allowedEmployerIds = (await getSuperAgentEmployerIds(ctx.userId)).map(String);
  }

  // Build the update payload
  const now = new Date();
  let newStatus: string | undefined;

  if (action === "reject") {
    newStatus = "rejected";
  } else if (action === "move_stage") {
    if (!params?.targetStage) {
      return NextResponse.json({ error: "targetStage is required for move_stage action" }, { status: 400 });
    }
    newStatus = params.targetStage;
  } else if (action === "send_message") {
    if (!params?.messageContent && !params?.templateId && !params?.emailBody) {
      return NextResponse.json({ error: "messageContent, emailBody, or templateId is required for send_message" }, { status: 400 });
    }
    // send_message doesn't change status — it sends email to selected candidates
  }

  // Fetch applications to validate ownership and push status history
  const query: Record<string, unknown> = { _id: { $in: applicationIds } };
  if (allowedEmployerIds) query.employerId = { $in: allowedEmployerIds };

  const applications = await Application.find(query)
    .select("_id status employerId jobSeekerId jobId rejectionReason statusHistory")
    .populate({
      path: "jobSeekerId",
      select: "userId email fullName",
      populate: { path: "userId", select: "_id name email" },
    })
    .populate("jobId", "title workflow");

  if (!applications.length) {
    return NextResponse.json({ error: "No matching applications found" }, { status: 404 });
  }

  if (applications.length !== applicationIds.length && ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Some applications are outside your scope" },
      { status: 403 }
    );
  }

  // Load employer comm template if a custom email subject/body was provided
  let emailSubjectOverride: string | undefined = params?.emailSubject as string | undefined;
  let emailBodyOverride: string | undefined = params?.emailBody as string | undefined;

  // If a templateId was provided, load it. Applying a saved template is the
  // `commTemplates` entitlement in use — gate it here since this route is the
  // one place templates are consumed outside their own CRUD endpoints.
  if (params?.templateId && !emailBodyOverride) {
    const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, { type: "toggle", feature: "commTemplates" });
    if (gateErr) return gateErr;
    const template = await CommTemplate.findById(params.templateId).lean() as {
      subject?: string; body?: string;
    } | null;
    if (template) {
      emailSubjectOverride = template.subject;
      emailBodyOverride = template.body;
    }
  }

  // Resolve employer info for emails
  let companyName = "MPLOYEDIN";
  if (employerId) {
    const emp = await Employer.findById(employerId).select("companyName").lean() as { companyName?: string } | null;
    if (emp?.companyName) companyName = emp.companyName;
  }

  // Candidate notifications: an explicit `notifyCandidate` from the UI wins
  // ("Shortlist without email" means exactly that — absent custom copy used to
  // fall through to the default template and send anyway). Otherwise the
  // employer's saved hiring rule decides, per application: job override first,
  // then the employer default.
  const ruleEmployerIds = [...new Set(applications.map((a) => String(a.employerId)).filter(Boolean))];
  const employerRuleDocs = (await Employer.find({ _id: { $in: ruleEmployerIds } })
    .select("workflow")
    .lean()) as Array<WorkflowSettingsCarrier & { _id: unknown }>;
  const employerRules = new Map(employerRuleDocs.map((e) => [String(e._id), e]));
  const shouldNotifyCandidate = (app: { employerId?: unknown; jobId?: unknown }): boolean => {
    if (typeof params?.notifyCandidate === "boolean") return params.notifyCandidate;
    return resolveHiringRulesForJob(
      app.jobId as WorkflowSettingsCarrier | null,
      employerRules.get(String(app.employerId)),
    ).notifyOnStageChange;
  };

  // Update each and push status history
  let successCount = 0;
  const errors: string[] = [];
  const emailsSent: string[] = [];
  // Mail is collected here and sent in one parallel batch after the writes.
  // Awaiting each send inside the loop made the response wait on N sequential
  // SMTP round trips — a six-candidate move held the request open for a minute
  // with no progress on screen — while every other side effect below is already
  // fire-and-forget.
  const pendingEmails: Array<{
    appId: string;
    to: string;
    subject: string;
    html: string;
    userId?: string;
    source: string;
  }> = [];

  for (const app of applications) {
    try {
      const jobSeeker = app.jobSeekerId as unknown as {
        _id?: unknown; userId?: { _id?: unknown; email?: string; name?: string } | string;
        email?: string; fullName?: string;
      } | null;

      const job = app.jobId as unknown as { title?: string } | null;
      const jobTitle = job?.title ?? "Position";
      const seekerName = jobSeeker?.fullName ?? "Candidate";
      const seekerEmail = typeof jobSeeker?.userId === "object"
        ? (jobSeeker.userId as { email?: string })?.email
        : jobSeeker?.email;
      const seekerUserId = typeof jobSeeker?.userId === "object"
        ? String((jobSeeker.userId as { _id?: unknown })?._id ?? "")
        : String(jobSeeker?.userId ?? "");
      const notifyCandidate = shouldNotifyCandidate(app);

      // Status change actions
      if (newStatus && app.status !== newStatus) {
        app.status = newStatus as typeof app.status;
        app.statusHistory.push({
          status: newStatus as typeof app.status,
          changedAt: now,
          changedBy: ctx.userId as unknown as import("mongoose").Types.ObjectId,
          note: params?.rejectionReason ?? `Bulk action: ${action}`,
        });
        if (action === "reject" && params?.rejectionReason) {
          app.rejectionReason = params.rejectionReason;
        }
        await app.save();

        // Send notification + email based on new status (both follow the notify rule)
        if (seekerUserId && notifyCandidate) {
          if (action === "reject") {
            notifyRejected(seekerUserId, jobTitle, String(app._id)).catch((err) =>
              logger.error({ err, applicationId: String(app._id) }, "failed to notify rejection (bulk)"));
          } else if (newStatus === "offer") {
            notifyOfferMade(seekerUserId, jobTitle, companyName, String(app._id)).catch((err) =>
              logger.error({ err, applicationId: String(app._id) }, "failed to notify offer (bulk)"));
          } else {
            notifyStatusChange(seekerUserId, jobTitle, newStatus, String(app._id)).catch((err) =>
              logger.error({ err, applicationId: String(app._id) }, "failed to notify status change (bulk)"));
          }
        }

        // Send direct email if employer provided custom content or we have defaults
        if (seekerEmail && notifyCandidate) {
          try {
            let emailContent: { subject: string; html: string };

            if (emailSubjectOverride && emailBodyOverride) {
              // Use employer's customized email
              const interpolated = emailBodyOverride
                .replace(/\{\{candidateName\}\}/g, seekerName)
                .replace(/\{\{jobTitle\}\}/g, jobTitle)
                .replace(/\{\{companyName\}\}/g, companyName)
                .replace(/\{\{status\}\}/g, newStatus.replace(/_/g, " "));
              const interpolatedSubject = emailSubjectOverride
                .replace(/\{\{jobTitle\}\}/g, jobTitle)
                .replace(/\{\{companyName\}\}/g, companyName);
              emailContent = {
                subject: interpolatedSubject,
                // Employer-authored HTML goes to a candidate's inbox — strip
                // scripts/handlers/iframes before sending.
                html: wrapEmailHtml(sanitizeHtml(interpolated)),
              };
            } else {
              // Use default template
              emailContent = EmailTemplates.statusUpdate(seekerName, jobTitle, newStatus.replace(/_/g, " "));
            }

            pendingEmails.push({
              appId: String(app._id),
              to: seekerEmail,
              subject: emailContent.subject,
              html: emailContent.html,
              userId: seekerUserId || undefined,
              source: "bulk-action",
            });
          } catch (emailErr) {
            logger.error({ appId: app._id, err: emailErr }, "Bulk email failed for app");
          }
        }
      } else if (action === "send_message") {
        // Send message without status change
        if (seekerEmail && (emailBodyOverride || params?.messageContent)) {
          try {
            const body = (emailBodyOverride ?? params!.messageContent as string)
              .replace(/\{\{candidateName\}\}/g, seekerName)
              .replace(/\{\{jobTitle\}\}/g, jobTitle)
              .replace(/\{\{companyName\}\}/g, companyName);
            const subject = (emailSubjectOverride ?? `Update regarding ${jobTitle}`)
              .replace(/\{\{jobTitle\}\}/g, jobTitle)
              .replace(/\{\{companyName\}\}/g, companyName);

            pendingEmails.push({
              appId: String(app._id),
              to: seekerEmail,
              subject,
              html: wrapEmailHtml(sanitizeHtml(body)),
              userId: seekerUserId || undefined,
              source: "bulk-message",
            });
          } catch (emailErr) {
            logger.error({ appId: app._id, err: emailErr }, "Bulk message failed for app");
          }
        }
      }

      successCount++;
    } catch (err) {
      errors.push(`Application ${app._id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  // One parallel batch, so the response waits on the slowest send rather than
  // the sum of them. A send that fails is logged and reported in `emailsSent`
  // being short — it never fails the stage change, which is already committed.
  if (pendingEmails.length) {
    const results = await Promise.allSettled(
      pendingEmails.map((mail) =>
        sendEmail({
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          userId: mail.userId,
          source: mail.source,
          category: "applications",
        }),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") emailsSent.push(pendingEmails[index].appId);
      else logger.error({ appId: pendingEmails[index].appId, err: result.reason }, "Bulk email failed for app");
    });
  }

  // When an agent/super-agent/admin runs the bulk action, the owning employer(s)
  // never see it happen — send each one a summary. (Employer actors get a UI toast.)
  if (ctx.role !== "employer" && successCount > 0) {
    const employerIds = [...new Set(applications.map((a) => String(a.employerId)).filter(Boolean))];
    const owners = await Employer.find({ _id: { $in: employerIds } }).select("userId").lean() as { userId?: unknown }[];
    for (const owner of owners) {
      if (!owner.userId) continue;
      notify({
        userId: String(owner.userId),
        type: "system",
        title: "Bulk application update",
        message: `${successCount} application(s) were updated via bulk action: ${action}.`,
        link: `/employer/applications`,
        sendEmail: false,
        titleKey: "bulkActionTitle",
        bodyKey: "bulkActionBody",
        params: { count: String(successCount), action },
      }).catch((err) => logger.error({ err }, "failed to notify employer of bulk action"));
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.bulk_action",
    resource: "applications",
    meta: { action, count: successCount, applicationIds, emailsSent: emailsSent.length },
    req,
  });

  return NextResponse.json({
    success: true,
    processed: successCount,
    total: applications.length,
    emailsSent: emailsSent.length,
    errors: errors.length ? errors : undefined,
  });
}

/** Wrap plain-text or partial HTML in the MPLOYEDIN email layout */
function wrapEmailHtml(body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        ${body.includes("<") ? body : `<p>${body.replace(/\n/g, "</p><p>")}</p>`}
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Best regards,<br>The MPLOYEDIN Team</p>
      </div>
    </div>
  `;
}

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
