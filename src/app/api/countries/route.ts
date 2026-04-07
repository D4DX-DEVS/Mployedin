import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import Country from "@/models/Country";

// GET /api/countries?q=india&limit=20
// Public endpoint — used for country search dropdowns
export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));

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
