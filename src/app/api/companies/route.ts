import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * GET /api/companies — Public company directory for job seekers
 */
export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = await checkRateLimit(`companies:${ip}`, { limit: 30, windowSec: 60, prefix: "companies" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12", 10) || 12));
  const search = url.searchParams.get("search") ?? "";
  const industry = (url.searchParams.get("industry") ?? "").trim();

  // Only surface employers that are actively hiring (≥1 active job). This also
  // scopes the directory to real, vetted companies rather than empty shells.
  // The expiry clause must stay identical to the company profile page's job
  // query, otherwise a card advertises "6 open jobs" and the profile it links
  // to lists four.
  const activeJobCounts = await Job.aggregate([
    {
      $match: {
        status: "active",
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gte: new Date() } },
        ],
      },
    },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  const jobCountMap = new Map<string, number>(
    activeJobCounts.map((j) => [String(j._id), j.count])
  );
  const hiringEmployerIds = activeJobCounts.map((j) => j._id);

  const filter: Record<string, unknown> = { _id: { $in: hiringEmployerIds } };
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { companyName: { $regex: safe, $options: "i" } },
      { industry: { $regex: safe, $options: "i" } },
      { country: { $regex: safe, $options: "i" } },
    ];
  }
  if (industry && industry !== "all") {
    // Anchored so "Media" cannot also match "Social Media Marketing".
    filter.industry = { $regex: `^${escapeRegex(industry)}$`, $options: "i" };
  }

  const [employers, total, rawIndustries] = await Promise.all([
    Employer.find(filter)
      .select("companyName logo industry companySize country website domainVerified")
      .sort({ companyName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Employer.countDocuments(filter),
    // Facet over every hiring employer, not just the current page — a 12-item
    // page cannot tell the client which industries the other 13 companies use.
    Employer.distinct("industry", { _id: { $in: hiringEmployerIds } }),
  ]);

  const industries = (rawIndustries as unknown[])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    items: employers.map((e: Record<string, unknown>) => ({
      _id: String(e._id),
      companyName: e.companyName,
      logo: e.logo,
      industry: e.industry,
      companySize: e.companySize,
      country: e.country,
      website: e.website,
      domainVerified: e.domainVerified,
      activeJobCount: jobCountMap.get(String(e._id)) ?? 0,
    })),
    industries,
    total,
    page,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
  });
}
