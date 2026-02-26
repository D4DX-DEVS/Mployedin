import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";

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

async function GET(_req: NextRequest, ctx: { userId: string }) {
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

async function PATCH(req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const { settings } = await req.json();

  await (JobSeeker as unknown as {
    findOneAndUpdate: (q: object, update: object, opts: object) => Promise<unknown>
  }).findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { settings } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}

export const GET_handler = withAuth(GET, { resource: "job_seekers", action: "read" });
export const PATCH_handler = withAuth(PATCH, { resource: "job_seekers", action: "update" });
export { GET_handler as GET, PATCH_handler as PATCH };
