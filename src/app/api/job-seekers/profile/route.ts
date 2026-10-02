import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import ConsentLog from "@/models/ConsentLog";
import { getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { recomputeCompleteness } from "@/lib/jobSeeker/persistCompleteness";
import { resolveSeekerArea, type SeekerAreaRegion } from "@/lib/agents/territoryCoverage";
import { mergeEducationEntry, mergeExperienceEntry } from "@/lib/jobSeeker/wizardEntries";

export const runtime = "nodejs";

/** The stored entry an onboarding answer updates, as GET returned it. */
const entryIdSchema = z.string().regex(/^[a-f\d]{24}$/i).optional();

// ── Zod schema for onboarding profile update ──────────────────────────────────
const experienceEntrySchema = z.object({
  _id: entryIdSchema,
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
  _id: entryIdSchema,
  degree: z.string().min(1).max(200),
  // Blank is allowed: school-level qualifications have no university, and the
  // entry is stored with "" either way.
  institution: z.string().trim().max(200).optional(),
  field: z.string().max(200).optional(),
  course: z.string().max(200).optional(),
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
  // Onboarding asks for these three; they live under `careerProfile` on the
  // document and are mapped there below rather than set at the root.
  department: z.string().max(200).optional(),
  roleCategory: z.string().max(200).optional(),
  jobRole: z.string().max(200).optional(),
  experience: z.array(experienceEntrySchema).max(20).optional(),

  // Education (Step 2)
  education: z.array(educationEntrySchema).max(10).optional(),

  // Preferences (Step 3)
  headline: z.string().max(500).trim().optional(),
  preferredLocations: z.array(z.string().max(100)).max(10).optional(),
  // `max` is optional: onboarding asks for a single expected figure, and
  // writing max: 0 alongside it produced ranges whose top was below the bottom.
  preferredSalary: z.object({ min: z.number().min(0), max: z.number().min(0).optional(), currency: z.string().max(10) }).optional(),
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
  // The seeker's area: a catalogue city picked from the list, or just the
  // region (state) when their city isn't listed. null clears it.
  cityId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  stateId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
}).strict().refine((body) => !(body.cityId && body.stateId), {
  message: "Pick a city or a region, not both.",
  path: ["stateId"],
});

interface SeekerArea {
  cityId: string | null;
  cityName: string | null;
  stateId: string;
  stateName: string;
  countryCode: string;
}

/** The area a seeker picked, named for the picker: city (or none), region, country. */
function toArea(region: SeekerAreaRegion | null): SeekerArea | null {
  return region
    ? {
        cityId: region.cityId ? String(region.cityId) : null,
        cityName: region.cityName,
        stateId: String(region.stateId),
        stateName: region.stateName,
        countryCode: region.countryCode,
      }
    : null;
}

async function describeArea(cityId: unknown, stateId: unknown): Promise<SeekerArea | null> {
  // A city since taken off the list still leaves the region it was in.
  const viaCity = cityId ? await resolveSeekerArea({ cityId: String(cityId) }) : null;
  if (viaCity) return toArea(viaCity);
  return stateId ? toArea(await resolveSeekerArea({ stateId: String(stateId) })) : null;
}

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
  // Phone is stored on User, not JobSeeker. Onboarding pre-fills from this
  // response, so without it a seeker resuming the wizard was asked to retype a
  // number we already had.
  const [account, area] = await Promise.all([
    User.findById(ctx.userId).select("phone").lean<{ phone?: string } | null>(),
    describeArea(
      (profile as { regionCityId?: unknown }).regionCityId,
      (profile as { regionStateId?: unknown }).regionStateId,
    ),
  ]);
  return NextResponse.json({ profile: { ...profile, phone: account?.phone ?? null, area } });
}

// ── PATCH — update own profile ────────────────────────────────────────────────
async function PATCH(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedData = await validateBody(req, profileUpdateSchema);

  const {
    name, phone, onboardingComplete,
    education: eduInput, experience: expInput,
    department, roleCategory, jobRole, cityId, stateId,
    ...seekerData
  } = parsedData;

  await connectDB();

  // The area must be a real catalogue city or region — checked before
  // anything is written, so a bad pick saves nothing.
  const area = cityId ? await resolveSeekerArea({ cityId }) : stateId ? await resolveSeekerArea({ stateId }) : null;
  if ((cityId || stateId) && !area) {
    return NextResponse.json({ error: cityId ? "Pick your city from the list." : "Pick your region from the list." }, { status: 400 });
  }

  // Consent history for the GDPR register: remember the previous marketing
  // consent so only real changes are logged (onboarding and profile edits
  // both land here).
  const requestedConsent = (seekerData as { marketingConsent?: boolean }).marketingConsent;
  const previousConsent =
    typeof requestedConsent === "boolean"
      ? await JobSeeker.findOne({ userId: ctx.userId }).select("marketingConsent").lean<{ marketingConsent?: boolean } | null>()
      : null;

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

  // Area: the picked city and its state, or the region alone (what agents'
  // territories match on). The free-text location line follows the pick
  // unless this save sets it.
  if (area) {
    jsUpdate.regionCityId = area.cityId;
    jsUpdate.regionStateId = area.stateId;
    if (seekerData.currentLocation === undefined) {
      const place = area.cityName ?? area.stateName;
      const country = area.countryCode ? new Intl.DisplayNames(["en"], { type: "region" }).of(area.countryCode) : "";
      jsUpdate.currentLocation = country ? `${place}, ${country}` : place;
    }
  } else if (cityId === null || stateId === null) {
    jsUpdate.regionCityId = null;
    jsUpdate.regionStateId = null;
  }

  // Career profile lives in a subdocument. Dot-paths so that setting one answer
  // doesn't wipe the others a previous save already stored.
  if (department !== undefined) jsUpdate["careerProfile.department"] = department;
  if (roleCategory !== undefined) jsUpdate["careerProfile.roleCategory"] = roleCategory;
  if (jobRole !== undefined) jsUpdate["careerProfile.jobRole"] = jobRole;

  // Onboarding shows one job and one qualification; a CV import may have stored
  // several. Its answers update the entry they were filled from and keep the
  // rest — replacing the lists erased every other job and degree.
  // ponytail: read-merge-write of the whole lists; a write to the same lists
  // landing between the read and the $set below is lost (milliseconds, one
  // seeker in their own onboarding). arrayFilters + $push would close it.
  type StoredEntry = { _id?: unknown } & Record<string, unknown>;
  const storedLists = expInput?.length || eduInput?.length
    ? await JobSeeker.findOne({ userId: ctx.userId })
      .select("experience education")
      .lean<{ experience?: StoredEntry[]; education?: StoredEntry[] } | null>()
    : null;
  let experienceIndex: number | undefined;
  let educationIndex: number | undefined;

  // Transform education entries for storage
  if (eduInput?.length) {
    let list = storedLists?.education ?? [];
    for (const e of eduInput) {
      ({ list, index: educationIndex } = mergeEducationEntry(list, {
        _id: e._id,
        degree: e.degree,
        institution: e.institution ?? "",
        field: e.field,
        course: e.course,
        courseType: e.courseType,
        startYear: e.startYear,
        // UTC: `new Date(y, 11, 31)` is midnight in the *server's* zone, which
        // east of UTC lands on 30 December and renders as the wrong year-end.
        graduationDate: e.passingYear ? new Date(Date.UTC(e.passingYear, 11, 31)) : undefined,
      }));
    }
    jsUpdate.education = list;
  }

  // Transform experience entries for storage
  if (expInput && expInput.length > 0) {
    let list = storedLists?.experience ?? [];
    for (const e of expInput) {
      ({ list, index: experienceIndex } = mergeExperienceEntry(list, {
        _id: e._id,
        jobTitle: e.jobTitle,
        company: e.company,
        startDate: e.startDate ? new Date(e.startDate) : undefined,
        isCurrent: e.isCurrent ?? false,
        description: e.description,
        country: e.country,
      }));
    }
    jsUpdate.experience = list;
    // Also store current salary from first experience entry if provided
    const first = expInput[0];
    if (first.annualSalary !== undefined) {
      jsUpdate.currentSalary = { amount: first.annualSalary, currency: first.salaryCurrency ?? "USD" };
    }
  }

  // Stamp when the seeker actually chose their availability. The field itself
  // defaults to "immediately" at signup, so the stored value alone cannot say
  // whether they answered — and the digest cadence depends on knowing.
  if (jsUpdate.availabilityStatus !== undefined) {
    jsUpdate.availabilityStatusSetAt = new Date();
  }

  // Upsert so social-login users who never registered via email still get a doc
  const updated = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: jsUpdate },
    { upsert: true, returnDocument: "after" }
  );

  // This route writes scored fields (nationality, skills, experience, …) but
  // never recomputed completeness, so the stored figure went stale the moment a
  // seeker edited here instead of through /api/job-seeker/profile.
  await recomputeCompleteness(ctx.userId, updated);

  if (typeof requestedConsent === "boolean" && previousConsent?.marketingConsent !== requestedConsent) {
    await ConsentLog.create({
      userId: ctx.userId,
      userName: updated.fullName ?? name ?? "Unknown",
      consentType: "marketing",
      granted: requestedConsent,
      source: "profile",
      ipAddress: getClientIp(req.headers),
    }).catch((err: unknown) => logger.warn({ err, userId: ctx.userId }, "[consent] failed to record marketing consent change"));
  }

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job_seeker.update_profile",
    resource: "job_seekers",
    resourceId: updated._id.toString(),
    req,
  });

  // The ids of the entries just written, so the form's next save of the same
  // step updates them instead of adding a copy.
  const savedId = (list: unknown, index: number | undefined) =>
    index === undefined ? undefined : (list as Array<{ _id?: unknown }> | undefined)?.[index]?._id;
  const experienceId = savedId(updated.experience, experienceIndex);
  const educationId = savedId(updated.education, educationIndex);
  const entryIds = {
    ...(experienceId ? { experience: String(experienceId) } : {}),
    ...(educationId ? { education: String(educationId) } : {}),
  };

  return NextResponse.json({
    success: true,
    isOnboarded: updated.isOnboarded,
    ...(cityId !== undefined || stateId !== undefined ? { area: toArea(area) } : {}),
    ...(Object.keys(entryIds).length ? { entryIds } : {}),
  });
}

const GET_handler = withAuth(GET);
const PATCH_handler = withAuth(PATCH);
export { GET_handler as GET, PATCH_handler as PATCH };
