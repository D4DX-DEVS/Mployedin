import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";

type MissingField = "resume" | "skills" | "experience" | "preferences";

/**
 * GET /api/user/profile-completion
 *
 * Returns a completion score and list of missing fields.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("skills experience cv preferredRoles preferredCountries preferredSalary availabilityStatus")
    .lean();

  if (!seeker) {
    return NextResponse.json({ score: 0, missing: ["resume", "skills", "experience", "preferences"] as MissingField[] });
  }

  const missing: MissingField[] = [];

  if (!seeker.cv?.originalUrl) missing.push("resume");
  if (!seeker.skills?.length) missing.push("skills");
  if (!seeker.experience?.length) missing.push("experience");
  if (
    !seeker.preferredRoles?.length &&
    !seeker.preferredCountries?.length &&
    !seeker.preferredSalary?.min
  ) {
    missing.push("preferences");
  }

  // 4 fields = 25 points each
  const score = Math.round(((4 - missing.length) / 4) * 100);

  return NextResponse.json({ score, missing });
});
