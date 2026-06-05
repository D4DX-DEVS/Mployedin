import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import Country from "@/models/Country";
import { checkRateLimit } from "@/lib/security/rateLimit";

// GET /api/countries?q=india&limit=20
// Public endpoint — used for country search dropdowns
export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = checkRateLimit(`countries:${ip}`, { limit: 60, windowSec: 60, prefix: "cntry" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const parsedLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(50, Number.isNaN(parsedLimit) ? 20 : Math.max(1, parsedLimit));

  const query = q
    ? { name: { $regex: escapeRegex(q), $options: "i" }, isActive: true }
    : { isActive: true };

  const countries = await Country.find(query)
    .select("name code currencyCode currencySymbol phoneCode")
    .sort({ sortOrder: 1, name: 1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ countries });
}
