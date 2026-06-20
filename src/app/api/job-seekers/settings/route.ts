import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { jobSeekerSettingsSchema } from "@/lib/validators/job-seekers";
import { logActivity } from "@/lib/audit/log";

interface JobSeekerSettings {
  autoApply: boolean;
  autoApplyFilters: {
    minScore: number;
    maxDistance: string;
    onlyVerifiedEmployers: boolean;
  };
  instantBooking: boolean;
  showSalary: boolean;
  openToRelocation: boolean;
  timezone?: string;
  timeBuffer?: number;
  weeklyAvailability?: string[];
  availableHours?: { day: string; startTime: string; endTime: string }[];
  defaultResumeId?: string;
  autoGenerateCoverLetter?: boolean;
  coverLetterTone?: string;
  autoAnswerScreening?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  preferredLocations?: string[];
  notifications?: {
    jobMatchAlerts?: boolean;
    applicationSubmitted?: boolean;
    interviewNotifications?: boolean;
  };
}

interface ResumeDoc {
  id: string;
  name: string;
  url: string;
}

async function getHandler(_req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const js = await (JobSeeker as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ settings?: JobSeekerSettings; documents?: { id: string; name: string; category: string; url: string }[] } | null> } }
  }).findOne({ userId: ctx.userId }).select("settings documents").lean();

  const defaults: JobSeekerSettings = {
    autoApply: false,
    autoApplyFilters: { minScore: 70, maxDistance: "same_country", onlyVerifiedEmployers: true },
    instantBooking: true,
    showSalary: true,
    openToRelocation: true,
    autoGenerateCoverLetter: true,
    coverLetterTone: "professional",
    autoAnswerScreening: false,
    salaryCurrency: "USD",
    notifications: {
      jobMatchAlerts: true,
      applicationSubmitted: true,
      interviewNotifications: true,
    },
  };

  const resumes: ResumeDoc[] = (js?.documents ?? [])
    .filter((d) => d.category === "resume" && d.url)
    .map((d) => ({ id: d.id, name: d.name, url: d.url }));

  return NextResponse.json({
    settings: js?.settings ?? defaults,
    resumes,
  });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { settings } = await validateBody(req, jobSeekerSettingsSchema);

  await (JobSeeker as unknown as {
    findOneAndUpdate: (q: object, update: object, opts: object) => Promise<unknown>
  }).findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { settings } },
    { upsert: true }
  );

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job_seeker.update_settings",
    resource: "job_seekers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
