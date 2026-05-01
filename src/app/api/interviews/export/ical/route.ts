import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: Record<string, any> = {};

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return new NextResponse("", { status: 404 });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return new NextResponse("", { status: 404 });
    query.employerId = emp._id;
  }
  // admin/agent: all interviews (or scoped per role)

  query.status = { $in: ["scheduled", "confirmed"] };

  const interviews = await Interview.find(query)
    .sort({ scheduledAt: 1 })
    .limit(200)
    .populate("jobId", "title")
    .populate("jobSeekerId", "userId")
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name" } })
    .lean();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MPLOYEDIN//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MPLOYEDIN Interviews",
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
    lines.push(`DTSTART:${formatIcalDate(start)}`);
    lines.push(`DTEND:${formatIcalDate(end)}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcal(description)}`);
    if (location) lines.push(`LOCATION:${escapeIcal(location)}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=interviews.ics",
    },
  });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
