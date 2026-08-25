import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import mongoose from "mongoose";

void User; // ensure User model is registered for populate

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

  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Only discoverable candidates are ever sourced through this endpoint.
  const conditions: Record<string, unknown>[] = [{ profileVisibility: "visible" }];

  if (availability) conditions.push({ availabilityStatus: availability });
  // Nationality is a protected characteristic under the Equality Act 2010
  // (s.9, race including national origin) — not offered as a sourcing filter.
  if (experienceYears > 0) conditions.push({ totalExperienceYears: { $gte: experienceYears } });
  if (skills && skills.length > 0) {
    conditions.push({ skills: { $in: skills.map((s) => new RegExp(escape(s), "i")) } });
  }
  if (location) {
    const re = new RegExp(escape(location), "i");
    conditions.push({ $or: [{ currentLocation: re }, { preferredLocations: re }] });
  }
  if (search) {
    const re = new RegExp(escape(search), "i");
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

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const [docs, total] = await Promise.all([
    JobSeeker.find(filter)
      .select(
        "fullName currentLocation preferredLocations skills availabilityStatus profileCompleteness totalExperienceYears headline experience cv.originalUrl userId"
      )
      .populate({ path: "userId", select: "name avatar" })
      .sort({ profileCompleteness: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobSeeker.countDocuments(filter),
  ]);

  const items = (docs as Array<Record<string, unknown>>).map((d) => {
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
      cv: d.cv,
    };
  });

  return NextResponse.json({ items, total, page, limit });
}

export const GET = withAuth(handler, { resource: "job_seekers", action: "read" });
