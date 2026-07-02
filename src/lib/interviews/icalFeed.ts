/**
 * Shared iCal (RFC 5545) feed builder for interviews.
 *
 * Used by both the one-off download (/api/interviews/export/ical) and the
 * subscribable calendar feed (/api/calendar/feed/[token]). Calendar apps
 * that subscribe to the feed re-fetch it periodically, so reschedules and
 * cancellations propagate automatically — no Google Calendar API needed.
 */

import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/models/User";

// Ensure Mongoose model registration for populate
void Job;

function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Build the iCal document for a user's scheduled/confirmed interviews.
 * Returns null when the user has no matching profile for their role.
 */
export async function buildInterviewIcal(userId: string, role: UserRole): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId }).select("_id").lean();
    if (!seeker) return null;
    query.jobSeekerId = seeker._id;
  } else if (role === "employer") {
    const emp = await Employer.findOne({ userId }).select("_id").lean();
    if (!emp) return null;
    query.employerId = emp._id;
  } else if (role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return null;
    query.$or = [
      { employerId: { $in: agent.assignedEmployerIds ?? [] } },
      { agentId: agent._id },
    ];
  }
  // admin/super_agent: all interviews (matches existing export behavior)

  query.status = { $in: ["scheduled", "confirmed"] };

  const interviews = await Interview.find(query)
    .sort({ scheduledAt: 1 })
    .limit(200)
    .populate("jobId", "title")
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name" } })
    .lean();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MPLOYEDIN//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MPLOYEDIN Interviews",
    // Hint to subscribing clients to refresh hourly
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const iv of interviews) {
    const job = iv.jobId as unknown as { title?: string } | null;
    const seeker = iv.jobSeekerId as unknown as { userId?: { name?: string } } | null;
    const candidateName = seeker?.userId?.name ?? "Candidate";
    const jobTitle = job?.title ?? "Interview";
    const duration = iv.duration ?? 30;
    const start = new Date(iv.scheduledAt);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const summary = `Interview: ${candidateName} - ${jobTitle} (R${iv.interviewRound ?? 1})`;
    const description = [
      `Round ${iv.interviewRound ?? 1} ${iv.type ?? "video"} interview`,
      iv.meetLink ? `Meet Link: ${iv.meetLink}` : "",
      iv.location ? `Location: ${iv.location}` : "",
      iv.instructions ? `Instructions: ${iv.instructions}` : "",
    ].filter(Boolean).join("\\n");

    const location = iv.type === "video" ? (iv.meetLink ?? "") : (iv.location ?? "");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:interview-${iv._id}@mployedin.com`);
    lines.push(`DTSTAMP:${formatIcalDate(new Date(iv.updatedAt ?? iv.createdAt ?? Date.now()))}`);
    lines.push(`DTSTART:${formatIcalDate(start)}`);
    lines.push(`DTEND:${formatIcalDate(end)}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcal(description)}`);
    if (location) lines.push(`LOCATION:${escapeIcal(location)}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
