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
}

async function GET(_req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const js = await (JobSeeker as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ settings?: JobSeekerSettings } | null> } }
  }).findOne({ userId: ctx.userId }).select("settings").lean();

  const defaults: JobSeekerSettings = {
    autoApply: false,
    autoApplyFilters: { minScore: 70, maxDistance: "same_country", onlyVerifiedEmployers: true },
    instantBooking: true,
    showSalary: true,
    openToRelocation: true,
  };

  return NextResponse.json({ settings: js?.settings ?? defaults });
}

async function PATCH(req: NextRequest, ctx: { userId: string; role: string }) {
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

export const GET_handler = withAuth(GET);
export const PATCH_handler = withAuth(PATCH);
export { GET_handler as GET, PATCH_handler as PATCH };
