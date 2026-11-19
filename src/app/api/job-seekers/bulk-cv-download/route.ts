import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import "@/models/User"; // registers the model that populate("userId") reads

/**
 * POST /api/job-seekers/bulk-cv-download { ids, includeWithoutCv? }
 *
 * The details of the seekers picked by id, in the order sent. Admin only.
 *
 * It used to feed the admin list's "Download CVs" zip and answered "everyone
 * matching these filters" too. The shared CV export (CvExportDialog +
 * /api/cv-export/manifest) replaced that, so the filter mode is gone; what still
 * calls this is the Copilot shortlist, which asks for its picked candidates'
 * contact details at click time (they never pass through the chat model).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const body = (await req.json().catch(() => null)) as {
    ids?: unknown;
    /** Also return the picked candidates who have no CV (Copilot shortlist export). */
    includeWithoutCv?: boolean;
  } | null;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === "string") : [];
  // Validate IDs are proper MongoDB ObjectIds
  const validIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id)).slice(0, 200);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
  }
  const includeWithoutCv = body?.includeWithoutCv === true;

  const filter = includeWithoutCv
    ? { _id: { $in: validIds } }
    : { "cv.originalUrl": { $exists: true, $ne: "" }, _id: { $in: validIds } };

  const results = await JobSeeker.find(filter)
    .populate("userId", "name email")
    .select("fullName email phone skills experience.jobTitle cv.originalUrl userId headline nationality currentLocation totalExperienceYears")
    .limit(200)
    .lean();

  // Picked ids come back in the order they were sent (the Copilot's ranking).
  const order = new Map(validIds.map((id, i) => [id, i]));
  const cvList = results
    .filter((js) => includeWithoutCv || js.cv?.originalUrl)
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
