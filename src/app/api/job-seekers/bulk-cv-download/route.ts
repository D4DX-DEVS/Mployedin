import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * POST /api/job-seekers/bulk-cv-download
 * Returns a list of CV URLs for the given job seeker IDs or current search results.
 * Admin-only endpoint.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const body = await req.json();
  const { ids, includeWithoutCv, search, skills, location, availability, hasCV, jobType } = body as {
    ids?: string[];
    /** With `ids`: also return the picked candidates who have no CV (Copilot shortlist export). */
    includeWithoutCv?: boolean;
    search?: string;
    skills?: string[];
    location?: string;
    availability?: string;
    hasCV?: string;
    jobType?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filter: Record<string, any> = { "cv.originalUrl": { $exists: true, $ne: "" } };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    // Validate IDs are proper MongoDB ObjectIds
    const validIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id)).slice(0, 200);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
    }
    filter = includeWithoutCv === true ? { _id: { $in: validIds } } : { ...filter, _id: { $in: validIds } };
  } else {
    // Apply the same filters as the search
    const conditions: Record<string, unknown>[] = [];
    if (availability) conditions.push({ availabilityStatus: availability });
    if (skills && skills.length > 0) {
      conditions.push({ skills: { $in: skills.map((s) => new RegExp(escapeRegex(s), "i")) } });
    }
    if (hasCV === "1") conditions.push({ "cv.originalUrl": { $exists: true, $ne: "" } });
    if (jobType) conditions.push({ preferredJobType: jobType });

    if (search) {
      conditions.push({
        $or: [
          { fullName: { $regex: escapeRegex(search), $options: "i" } },
          { skills: { $regex: escapeRegex(search), $options: "i" } },
          { "experience.jobTitle": { $regex: escapeRegex(search), $options: "i" } },
          { headline: { $regex: escapeRegex(search), $options: "i" } },
        ],
      });
    }
    if (location) {
      conditions.push({
        $or: [
          { currentLocation: { $regex: escapeRegex(location), $options: "i" } },
          { preferredLocations: { $regex: escapeRegex(location), $options: "i" } },
        ],
      });
    }
    if (conditions.length > 0) {
      filter = { ...filter, $and: conditions };
    }
  }

  const results = await JobSeeker.find(filter)
    .populate("userId", "name email")
    .select("fullName email phone skills experience.jobTitle cv.originalUrl userId headline nationality currentLocation totalExperienceYears")
    .limit(200)
    .lean();

  // Picked ids come back in the order they were sent (the Copilot's ranking).
  const order = new Map((ids ?? []).map((id, i) => [id, i]));
  const cvList = results
    .filter((js) => includeWithoutCv === true || js.cv?.originalUrl)
    .sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0))
    .map((js) => ({
      id: String(js._id),
      name: js.fullName || (js.userId as { name?: string })?.name || "Unknown",
      headline: js.headline || "",
      title: js.experience?.[0]?.jobTitle || "",
      email: js.email || (js.userId as { email?: string })?.email || "",
      phone: js.phone || "",
      skills: (js.skills ?? []).slice(0, 12),
      nationality: js.nationality || "",
      location: js.currentLocation || "",
      experienceYears: js.totalExperienceYears ?? null,
      hasCV: Boolean(js.cv?.originalUrl),
      url: js.cv?.originalUrl || null,
    }));

  return NextResponse.json({ cvs: cvList, total: cvList.length });
}, { resource: "job_seekers", action: "read" });
