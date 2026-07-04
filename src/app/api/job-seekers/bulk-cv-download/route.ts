import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";

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
  const { ids, search, skills, location, availability, hasCV, jobType } = body as {
    ids?: string[];
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
    const validIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
    }
    filter._id = { $in: validIds };
  } else {
    // Apply the same filters as the search
    const conditions: Record<string, unknown>[] = [];
    if (availability) conditions.push({ availabilityStatus: availability });
    if (skills && skills.length > 0) {
      conditions.push({ skills: { $in: skills.map((s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) } });
    }
    if (hasCV === "1") conditions.push({ "cv.originalUrl": { $exists: true, $ne: "" } });
    if (jobType) conditions.push({ preferredJobType: jobType });

    if (search) {
      conditions.push({
        $or: [
          { fullName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { skills: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { "experience.jobTitle": { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { headline: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        ],
      });
    }
    if (location) {
      conditions.push({
        $or: [
          { currentLocation: { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { preferredLocations: { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        ],
      });
    }
    if (conditions.length > 0) {
      filter = { ...filter, $and: conditions };
    }
  }

  const results = await JobSeeker.find(filter)
    .populate("userId", "name email")
    .select("fullName cv.originalUrl userId headline")
    .limit(200)
    .lean();

  const cvList = results
    .filter((js) => js.cv?.originalUrl)
    .map((js) => ({
      id: String(js._id),
      name: js.fullName || (js.userId as { name?: string })?.name || "Unknown",
      headline: js.headline || "",
      url: js.cv.originalUrl,
    }));

  return NextResponse.json({ cvs: cvList, total: cvList.length });
}, { resource: "job_seekers", action: "read" });
