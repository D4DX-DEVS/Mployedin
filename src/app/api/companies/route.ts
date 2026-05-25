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
  const { allowed } = checkRateLimit(`companies:${ip}`, { limit: 30, windowSec: 60, prefix: "companies" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12")));
  const search = url.searchParams.get("search") ?? "";

  const filter: Record<string, unknown> = { isActive: true };
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { companyName: { $regex: safe, $options: "i" } },
      { industry: { $regex: safe, $options: "i" } },
      { "address.city": { $regex: safe, $options: "i" } },
    ];
  }

  const [employers, total] = await Promise.all([
    Employer.find(filter)
      .select("companyName logo industry companySize city country description website domainVerified")
      .sort({ companyName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Employer.countDocuments(filter),
  ]);

  // Get active job counts in batch
  const employerIds = employers.map((e: Record<string, unknown>) => e._id);
  const jobCounts = await Job.aggregate([
    { $match: { employerId: { $in: employerIds }, status: "active" } },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  const jobCountMap = new Map(jobCounts.map((j) => [String(j._id), j.count]));

  return NextResponse.json({
    items: employers.map((e: Record<string, unknown>) => ({
      _id: String(e._id),
      companyName: e.companyName,
      logo: e.logo,
      industry: e.industry,
      companySize: e.companySize,
      city: e.city,
      country: e.country,
      description: e.description,
      website: e.website,
      domainVerified: e.domainVerified,
      activeJobCount: jobCountMap.get(String(e._id)) ?? 0,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
