import { withoutHiddenSections } from "@/lib/jobSeeker/sectionVisibility";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import mongoose from "mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { hasBuiltCvContent } from "@/lib/cv/seekerCvAvailability";
import { employerAccessibleSeekerIds, resolveCvActor } from "@/lib/cv/cvAccess";
import type { SeekerOwnership } from "@/lib/jobSeeker/staffAccess";

void User; // ensure User model is registered for populate

/**
 * The rows' seekers whose CV the viewer may open (the same gate as the CV route:
 * authorizeCvAccess, here for a page at once). Fails closed: anything the gate
 * does not know is not openable.
 */
async function cvAccessibleIds(
  ctx: AuthContext,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  if (ctx.role === "admin") return new Set(ids);
  if (ctx.role === "employer") {
    // A colleague who may review applicants but not manage talent pools opens a CV
    // only through an application (see the CV route), never from the talent pool.
    if (ctx.member && ctx.member.permissions.canManageTalentPools !== true) return new Set();
    const actor = await resolveCvActor(ctx);
    return employerAccessibleSeekerIds(actor.employerId, ids);
  }
  if (ctx.role === "agent" || ctx.role === "super_agent") {
    const { canViewSeeker } = await resolveCvActor(ctx);
    if (!canViewSeeker) return new Set();
    // The ownership fields the scope rule decides on are read here, for staff only, in one query:
    // an employer's rows never carry (or select) them.
    const owned = (await JobSeeker.find({ _id: { $in: ids } })
      .select("agentId referral regionCityId regionStateId profileVisibility roleArchivedAt")
      .lean()) as unknown as SeekerOwnership[];
    const allowed = await Promise.all(owned.map((seeker) => canViewSeeker(seeker)));
    return new Set(owned.filter((_, index) => allowed[index]).map((seeker) => String(seeker._id)));
  }
  return new Set();
}

/**
 * GET /api/employer/talent-search (FG-4)
 *
 * Proactive, job-agnostic talent sourcing for employers (LinkedIn-Recruiter /
 * Naukri-Resdex style). Unlike `/api/applications` (job-scoped) and
 * `/api/job-seekers` (staff-only PII enumeration), this endpoint lets an
 * employer browse the discoverable talent pool — i.e. seekers who opted in via
 * `profileVisibility: "visible"` — and filter by skills, location, availability
 * and experience. Only non-sensitive profile fields are returned (no email).
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "12"), 1), 50);
  const search = searchParams.get("search")?.trim();
  const location = searchParams.get("location")?.trim();
  const availability = searchParams.get("availability")?.trim();
  const experienceYears = parseInt(searchParams.get("experienceYears") ?? "0");
  const skills = searchParams.get("skills")?.split(",").map((s) => s.trim()).filter(Boolean);

  // Only discoverable candidates are ever sourced through this endpoint.
  const conditions: Record<string, unknown>[] = [{ profileVisibility: "visible" }];

  if (availability) conditions.push({ availabilityStatus: availability });
  // Nationality is a protected characteristic under the Equality Act 2010
  // (s.9, race including national origin) — not offered as a sourcing filter.
  if (experienceYears > 0) conditions.push({ totalExperienceYears: { $gte: experienceYears } });
  if (skills && skills.length > 0) {
    conditions.push({ skills: { $in: skills.map((s) => new RegExp(escapeRegex(s), "i")) } });
    // A skills list the person hid must not be searchable either.
    conditions.push({ "sectionVisibility.skills": { $ne: false } });
  }
  if (location) {
    const re = new RegExp(escapeRegex(location), "i");
    conditions.push({ $or: [{ currentLocation: re }, { preferredLocations: re }] });
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    conditions.push({
      $or: [
        { fullName: re },
        { skills: re },
        { currentLocation: re },
        { headline: re },
        { "experience.jobTitle": re },
      ],
    });
  }

  // Accounts an admin converted out of the job_seeker role keep their profile
  // but must not surface in an employer's talent pool.
  conditions.push({ roleArchivedAt: null });

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const [docs, total, availableNow] = await Promise.all([
    JobSeeker.find(filter)
      // No `cv` here on purpose. The CV route requires an application or talent
      // pool membership, so a sourced-only employer could never open it — the
      // URL only fed a "View CV" menu item that 403s, and shipped a private
      // object's path to a browser that has no right to it. `education` and
      // `summary` and the sections hidden on the CV (cvDesign.hiddenSections) are read
      // only to answer `canBuildCv` and are not returned.
      .select(
        "fullName currentLocation preferredLocations skills availabilityStatus profileCompleteness totalExperienceYears headline experience userId isAgentReferred sectionVisibility education summary cvDesign.hiddenSections"
      )
      .populate({ path: "userId", select: "name avatar" })
      .sort({ profileCompleteness: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobSeeker.countDocuments(filter),
    // Across every page, not the 20 rows on screen (QA EMP-012: card said 16 of 230).
    JobSeeker.countDocuments({ $and: [...conditions, { availabilityStatus: "immediately" }] }),
  ]);

  // Whether the viewer may open each row's CV, by the CV route's own gate (cvAccess):
  // an employer for a seeker who applied or sits in one of their pools — one batched
  // query for the page — staff by their scope, an admin for anyone. Sourced-only
  // candidates are not openable, so the page does not offer "View CV" for them.
  const accessible = await cvAccessibleIds(ctx, (docs as Array<{ _id: unknown }>).map((d) => String(d._id)));

  // Sections the person hid on their profile are not shown to employers searching for talent.
  const items = (docs as Array<Record<string, unknown>>).map(withoutHiddenSections).map((d: Record<string, unknown>) => {
    const user = d.userId as { _id?: unknown; name?: string; avatar?: string } | null;
    return {
      _id: String(d._id),
      fullName: (d.fullName as string) ?? user?.name,
      userId: user?._id ? { _id: String(user._id), name: user.name ?? "", avatar: user.avatar } : undefined,
      currentLocation: d.currentLocation,
      skills: d.skills,
      availabilityStatus: d.availabilityStatus,
      profileCompleteness: d.profileCompleteness,
      totalExperienceYears: d.totalExperienceYears,
      experience: d.experience,
      // Whether the Standardised CV can be drawn: a yes/no, never the profile text itself. Sections the
      // person hid do not count (they were removed above).
      canBuildCv: hasBuiltCvContent(d as Parameters<typeof hasBuiltCvContent>[0]),
      // Whether the CV route would serve this seeker to the viewer: a yes/no. "View CV" needs it
      // (a file or a buildable profile alone is not enough).
      cvAccessible: accessible.has(String(d._id)),
      // Employers learn THAT a partner referred this candidate, never who.
      isAgentReferred: d.isAgentReferred === true,
    };
  });

  return NextResponse.json({ items, total, availableNow, page, limit });
}

export const GET = withAuth(handler, { resource: "job_seekers", action: "read" });
