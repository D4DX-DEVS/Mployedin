import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkActionSchema } from "@/lib/validators/applications";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import {
  notifyRejected,
  notifyStatusChange,
  notifyOfferMade,
} from "@/lib/notifications/trigger";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import CommTemplate from "@/models/CommTemplate";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = checkRateLimit(`bulk:${ctx.userId ?? ip}`, RATE_LIMIT_CONFIGS.bulk);
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

  // For employers: verify they own these applications
  let employerId: string | null = null;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);
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
  if (employerId) query.employerId = employerId;

  const applications = await Application.find(query)
    .select("_id status employerId jobSeekerId jobId rejectionReason statusHistory")
    .populate({
      path: "jobSeekerId",
      select: "userId email fullName",
      populate: { path: "userId", select: "_id name email" },
    })
    .populate("jobId", "title");

  if (!applications.length) {
    return NextResponse.json({ error: "No matching applications found" }, { status: 404 });
  }

  if (applications.length !== applicationIds.length && ctx.role === "employer") {
    return NextResponse.json(
      { error: "Some applications do not belong to your account" },
      { status: 403 }
    );
  }

  // Load employer comm template if a custom email subject/body was provided
  let emailSubjectOverride: string | undefined = params?.emailSubject as string | undefined;
  let emailBodyOverride: string | undefined = params?.emailBody as string | undefined;

  // If a templateId was provided, load it
  if (params?.templateId && !emailBodyOverride) {
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

  // Update each and push status history
  let successCount = 0;
  const errors: string[] = [];
  const emailsSent: string[] = [];

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

        // Send notification + email based on new status
        if (seekerUserId) {
          if (action === "reject") {
            notifyRejected(seekerUserId, jobTitle, String(app._id)).catch(console.error);
          } else if (newStatus === "offer") {
            notifyOfferMade(seekerUserId, jobTitle, companyName, String(app._id)).catch(console.error);
          } else {
            notifyStatusChange(seekerUserId, jobTitle, newStatus, String(app._id)).catch(console.error);
          }
        }

        // Send direct email if employer provided custom content or we have defaults
        if (seekerEmail) {
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
                html: wrapEmailHtml(interpolated),
              };
            } else {
              // Use default template
              emailContent = EmailTemplates.statusUpdate(seekerName, jobTitle, newStatus.replace(/_/g, " "));
            }

            await sendEmail({
              to: seekerEmail,
              subject: emailContent.subject,
              html: emailContent.html,
              userId: seekerUserId || undefined,
              source: "bulk-action",
              category: "applications",
            });
            emailsSent.push(String(app._id));
          } catch (emailErr) {
            console.error("Bulk email failed for app:", app._id, emailErr);
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

            await sendEmail({
              to: seekerEmail,
              subject,
              html: wrapEmailHtml(body),
              userId: seekerUserId || undefined,
              source: "bulk-message",
              category: "applications",
            });
            emailsSent.push(String(app._id));
          } catch (emailErr) {
            console.error("Bulk message failed for app:", app._id, emailErr);
          }
        }
      }

      successCount++;
    } catch (err) {
      errors.push(`Application ${app._id}: ${err instanceof Error ? err.message : "Unknown"}`);
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
