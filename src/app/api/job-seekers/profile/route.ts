import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

export const runtime = "nodejs";

// ── Zod schema for onboarding profile update ──────────────────────────────────
const experienceEntrySchema = z.object({
  jobTitle: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  startDate: z.string().optional(),
  isCurrent: z.boolean().optional().default(false),
  description: z.string().max(2000).optional(),
  country: z.string().max(100).optional(),
  annualSalary: z.number().min(0).optional(),
  salaryCurrency: z.string().max(10).optional(),
});

const educationEntrySchema = z.object({
  degree: z.string().min(1).max(200),
  institution: z.string().min(1).max(200).optional(),
  field: z.string().max(200).optional(),
  startYear: z.number().int().min(1950).max(2050).optional(),
  passingYear: z.number().int().min(1950).max(2050).optional(),
  courseType: z.string().max(50).optional(),
});

const profileUpdateSchema = z.object({
  // Basic details (Step 0)
  name: z.string().min(1).max(200).trim().optional(),
  phone: z.string().min(7).max(25).trim().optional(),
  workStatus: z.enum(["experienced", "fresher"]).optional(),
  marketingConsent: z.boolean().optional(),

  // Employment (Step 1)
  totalExperienceYears: z.number().int().min(0).max(60).optional(),
  totalExperienceMonths: z.number().int().min(0).max(11).optional(),
  currentSalary: z.object({ amount: z.number().min(0), currency: z.string().max(10) }).optional(),
  noticePeriod: z.number().int().min(0).optional(),
  skills: z.array(z.string().min(1).max(100)).max(30).optional(),
  industry: z.string().max(200).optional(),
  experience: z.array(experienceEntrySchema).max(20).optional(),

  // Education (Step 2)
  education: z.array(educationEntrySchema).max(10).optional(),

  // Preferences (Step 3)
  headline: z.string().max(500).trim().optional(),
  preferredLocations: z.array(z.string().max(100)).max(10).optional(),
  preferredSalary: z.object({ min: z.number().min(0), max: z.number().min(0), currency: z.string().max(10) }).optional(),
  gender: z.string().max(50).optional(),

  // Completion flag
  onboardingComplete: z.boolean().optional(),
  profileCompletedLater: z.boolean().optional(),

  // Misc profile fields
  nationality: z.string().max(100).optional(),
  currentLocation: z.string().max(200).optional(),
  availabilityStatus: z.enum(["immediately", "within_month", "within_3_months", "not_available"]).optional(),
  preferredCountries: z.array(z.string().max(10)).max(15).optional(),
  sectionVisibility: z.record(z.string(), z.boolean()).optional(),
  profileVisibility: z.enum(["visible", "hidden"]).optional(),
}).strict();

// ── GET — return own profile ──────────────────────────────────────────────────
async function GET(_req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const profile = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}

// ── PATCH — update own profile ────────────────────────────────────────────────
async function PATCH(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedData = await validateBody(req, profileUpdateSchema);

  const { name, phone, onboardingComplete, education: eduInput, experience: expInput, ...seekerData } = parsedData;

  await connectDB();

  // Update User.name and User.phone if provided
  const userUpdate: Record<string, string> = {};
  if (name) userUpdate.name = name;
  if (phone) userUpdate.phone = phone;
  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(ctx.userId, userUpdate);
  }

  // Build JobSeeker update object
  const jsUpdate: Record<string, unknown> = { ...seekerData };

  if (name) {
    jsUpdate.fullName = name;
  }

  if (onboardingComplete === true) {
    jsUpdate.isOnboarded = true;
  }

  // Transform education entries for storage
  if (eduInput) {
    jsUpdate.education = eduInput.map((e) => ({
      degree: e.degree,
      institution: e.institution ?? "",
      field: e.field,
      graduationDate: e.passingYear ? new Date(e.passingYear, 11, 31) : undefined,
      grade: e.courseType,
    }));
  }

  // Transform experience entries for storage
  if (expInput && expInput.length > 0) {
    jsUpdate.experience = expInput.map((e) => ({
      jobTitle: e.jobTitle,
      company: e.company,
      startDate: e.startDate ? new Date(e.startDate) : undefined,
      isCurrent: e.isCurrent ?? false,
      description: e.description,
      country: e.country,
    }));
    // Also store current salary from first experience entry if provided
    const first = expInput[0];
    if (first.annualSalary !== undefined) {
      jsUpdate.currentSalary = { amount: first.annualSalary, currency: first.salaryCurrency ?? "USD" };
    }
  }

  // Upsert so social-login users who never registered via email still get a doc
  const updated = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: jsUpdate },
    { upsert: true, returnDocument: "after" }
  );

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job_seeker.update_profile",
    resource: "job_seekers",
    resourceId: updated._id.toString(),
    req,
  });

  return NextResponse.json({ success: true, isOnboarded: updated.isOnboarded });
}

const GET_handler = withAuth(GET);
const PATCH_handler = withAuth(PATCH);
export { GET_handler as GET, PATCH_handler as PATCH };
