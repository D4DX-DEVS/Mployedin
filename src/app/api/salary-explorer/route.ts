import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * GET /api/salary-explorer — Public salary insights by role/location/industry
 */
export async function GET(req: NextRequest) {
  // SECURITY: public + aggregation-heavy route — throttle per IP.
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = await checkRateLimit(ip, { limit: 30, windowSec: 60, prefix: "salary-explorer" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  // SECURITY: escape regex metacharacters in user input ($regex injection / ReDoS).
  const role = escapeRegex((searchParams.get("role") ?? "").slice(0, 100));
  const country = escapeRegex((searchParams.get("country") ?? "").slice(0, 100));
  const industry = escapeRegex((searchParams.get("industry") ?? "").slice(0, 100));

  const match: Record<string, unknown> = {
    status: "active",
    deletedAt: null,
    "salary.min": { $gt: 0 },
  };

  if (role) match.title = { $regex: role, $options: "i" };
  if (country) match["location.country"] = { $regex: country, $options: "i" };
  if (industry) match.category = { $regex: industry, $options: "i" };

  const [salaryData, topRoles, topCountries] = await Promise.all([
    // Aggregate salary stats
    Job.aggregate([
      { $match: match },
      {
        $group: {
          _id: { currency: "$salary.currency" },
          avgMin: { $avg: "$salary.min" },
          avgMax: { $avg: "$salary.max" },
          medianMin: { $avg: "$salary.min" }, // approximation
          count: { $sum: 1 },
          minSalary: { $min: "$salary.min" },
          maxSalary: { $max: "$salary.max" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),

    // Top roles by salary
    Job.aggregate([
      { $match: { status: "active", deletedAt: null, "salary.min": { $gt: 0 }, ...(country ? { "location.country": { $regex: country, $options: "i" } } : {}) } },
      {
        $group: {
          _id: "$title",
          avgMin: { $avg: "$salary.min" },
          avgMax: { $avg: "$salary.max" },
          currency: { $first: "$salary.currency" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 } } },
      { $sort: { avgMax: -1 } },
      { $limit: 15 },
    ]),

    // Top countries by job count
    Job.aggregate([
      { $match: { status: "active", deletedAt: null, "salary.min": { $gt: 0 } } },
      {
        $group: {
          _id: "$location.country",
          avgMin: { $avg: "$salary.min" },
          avgMax: { $avg: "$salary.max" },
          currency: { $first: "$salary.currency" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return NextResponse.json({
    salaryOverview: salaryData,
    topPayingRoles: topRoles,
    byCountry: topCountries,
    filters: { role, country, industry },
  });
}
