/**
 * Emails the candidate a real calendar invitation.
 *
 * The `.ics` attachment is what makes Gmail, Outlook and Apple Mail show an
 * event card with Yes/No/Maybe — and those buttons send an iTIP reply to the
 * organiser mailbox, which this app does not read. So every invitation also
 * carries a tokenised response link, in the mail body and inside the event
 * description, and that link is what records `candidateResponse`.
 *
 * Never throws. By the time this runs the interview row exists; a mail failure
 * must not roll the booking back or 500 the request that made it.
 */

import { buildInviteIcs } from "@/lib/interviews/icalInvite";
import { ensureResponseToken, responseUrl } from "@/lib/interviews/responseToken";
import { formatZonedDateTime } from "@/lib/datetime/zone";
import { resolveRecipientTimeZone } from "@/lib/notifications/recipientZone";
import logger from "@/lib/logger";

interface PopulatedInterview {
  _id: unknown;
  scheduledAt: Date | string;
  duration?: number;
  type?: string;
  meetLink?: string | null;
  location?: string | null;
  instructions?: string | null;
  status: string;
  icsSequence?: number;
  jobId?: { title?: string } | null;
  jobSeekerId?: { _id?: unknown; userId?: { _id?: unknown; name?: string; email?: string | null } | null } | null;
  employerId?: { companyName?: string; userId?: { email?: string | null } | null } | null;
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://mployedin.com"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInterviewInvite(interviewId: string, locale = "en"): Promise<boolean> {
  try {
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    const { default: Interview } = await import("@/models/Interview");

    const interview = await Interview.findById(interviewId)
      .select("scheduledAt duration type meetLink location instructions status icsSequence jobId jobSeekerId employerId")
      .populate("jobId", "title")
      .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
      .populate({ path: "employerId", populate: { path: "userId", select: "email" } })
      .lean<PopulatedInterview | null>();

    if (!interview) return false;

    const candidateEmail = interview.jobSeekerId?.userId?.email ?? null;
    if (!candidateEmail) return false;

    const candidateName = interview.jobSeekerId?.userId?.name ?? "Candidate";
    const jobTitle = interview.jobId?.title ?? "Interview";
    const organizerName = interview.employerId?.companyName ?? "Hiring team";
    // The employer is the organiser; the platform address is only a stand-in
    // so the ICS stays valid when an employer account has no mailbox on file.
    const organizerEmail = interview.employerId?.userId?.email ?? "no-reply@mployedin.com";
    const cancelled = interview.status === "cancelled";

    const token = await ensureResponseToken(String(interview._id));
    const url = token ? responseUrl(token, appBaseUrl(), locale) : null;

    const ics = buildInviteIcs({
      interviewId: String(interview._id),
      jobTitle,
      candidateName,
      candidateEmail,
      organizerName,
      organizerEmail,
      scheduledAt: new Date(interview.scheduledAt),
      duration: interview.duration ?? 30,
      type: interview.type ?? "video",
      meetLink: interview.meetLink ?? null,
      location: interview.location ?? null,
      instructions: interview.instructions ?? null,
      sequence: interview.icsSequence ?? 0,
      cancelled,
      responseUrl: url,
    });

    // Written in the candidate's own zone, with the zone named — they are
    // frequently in a different country from the employer who booked it.
    const seekerUserId = interview.jobSeekerId?.userId?._id;
    const timeZone = seekerUserId ? await resolveRecipientTimeZone(String(seekerUserId)) : undefined;
    const when = formatZonedDateTime(interview.scheduledAt, { timeZone, locale, dateStyle: "full" });

    const method = cancelled ? "CANCEL" : "REQUEST";
    const { sendEmail } = await import("@/lib/communications/email");

    await sendEmail({
      to: candidateEmail,
      subject: cancelled
        ? `Interview cancelled: ${jobTitle}`
        : `Interview invitation: ${jobTitle} with ${organizerName}`,
      category: "interview",
      source: "interview-invite",
      html: `
        <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;color:#111827;">${escapeHtml(cancelled ? "Interview cancelled" : "Interview invitation")}</h2>
          <p style="color:#374151;line-height:1.6;margin:0 0 16px;">
            ${escapeHtml(cancelled
              ? `Your ${jobTitle} interview with ${organizerName} has been cancelled.`
              : `${organizerName} would like to interview you for ${jobTitle}.`)}
          </p>
          <p style="color:#111827;font-weight:600;margin:0 0 20px;">${escapeHtml(when)}</p>
          ${
            url && !cancelled
              ? `<p style="margin:0 0 8px;">
                   <a href="${url}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Confirm or request another time</a>
                 </p>
                 <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0;">
                   Answering here is what reaches ${escapeHtml(organizerName)}. If your mail app shows its own Yes/No buttons, use this link instead.
                 </p>`
              : ""
          }
        </div>
      `,
      attachments: [
        {
          filename: "interview.ics",
          content: ics,
          // The method parameter is what makes a mail client render an event
          // card rather than offering a file download.
          contentType: `text/calendar; charset=utf-8; method=${method}`,
        },
      ],
    });

    return true;
  } catch (err) {
    logger.error({ err, interviewId }, "Failed to send interview invitation");
    return false;
  }
}
