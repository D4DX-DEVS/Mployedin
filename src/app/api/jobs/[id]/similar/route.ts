import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";

/**
 * GET /api/jobs/[id]/similar
 *
 * Returns up to 6 similar jobs based on overlapping skills and tags.
 * Public endpoint — no auth required so both logged-in and public pages can use it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await connectDB();

  const job = await Job.findById(id)
    .select("requirements.skills tags location title")
    .lean()
    .catch(() => null);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const skills: string[] = (job.requirements?.skills ?? []).map((s: string) => s.toLowerCase());
  const tags: string[] = (job.tags ?? []).map((t: string) => t.toLowerCase());
  const keywords = [...new Set([...skills, ...tags])];

  if (keywords.length === 0) {
    return NextResponse.json({ jobs: [] });
  }

  // Find active jobs that share skills or tags (exclude current job)
  const similar = await Job.find({
    _id: { $ne: job._id },
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
    $and: [
      {
        $or: [
          { "requirements.skills": { $in: job.requirements?.skills ?? [] } },
          { tags: { $in: job.tags ?? [] } },
        ],
      },
    ],
  })
    .select("title location salary requirements.skills tags employerId createdAt")
    .populate("employerId", "companyName logo")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  // Score by overlap count and return top 6
  const scored = similar
    .map((s) => {
      const sSkills = (s.requirements?.skills ?? []).map((sk: string) => sk.toLowerCase());
      const sTags = (s.tags ?? []).map((t: string) => t.toLowerCase());
      const allKeys = [...new Set([...sSkills, ...sTags])];
      const overlap = allKeys.filter((k) => keywords.includes(k)).length;
      return { ...s, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 6);

  return NextResponse.json({ jobs: scored });
}
