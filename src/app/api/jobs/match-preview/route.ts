import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { escapeRegex } from "@/lib/security/sanitize";
import JobSeeker from "@/models/JobSeeker";

/**
 * GET /api/jobs/match-preview
 * Query: skills (comma-separated), country, experienceMin, experienceMax
 *
 * Returns an estimated count of matching candidates and the top matching skills
 * based on current JobSeeker profiles in the platform.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.api);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const skillsParam = searchParams.get("skills") ?? "";
  const country = searchParams.get("country") ?? "";
  const experienceMin = parseInt(searchParams.get("experienceMin") ?? "0", 10);
  const experienceMax = parseInt(searchParams.get("experienceMax") ?? "50", 10);

  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (skillsParam.trim()) {
    const skills = skillsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20); // cap at 20 to prevent abuse
    if (skills.length > 0) {
      query.skills = { $in: skills };
    }
  }

  if (country.trim()) {
    query.country = new RegExp(escapeRegex(country.trim()), "i");
  }

  const [count, topSeekers] = await Promise.all([
    JobSeeker.countDocuments(query),
    JobSeeker.find(query)
      .select("skills")
      .limit(100)
      .lean(),
  ]);

  // Aggregate top skills from matching candidates
  const skillFrequency: Record<string, number> = {};
  for (const seeker of topSeekers) {
    for (const skill of seeker.skills ?? []) {
      skillFrequency[skill] = (skillFrequency[skill] ?? 0) + 1;
    }
  }

  const topSkills = Object.entries(skillFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([skill]) => skill);

  return NextResponse.json({ count, topSkills });
});
