import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { getAllCategorySlugs, getCategory } from "@/lib/job-attributes/categoryResolver";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * GET /api/master-data/<category>?q=<search>&limit=<n>
 *
 * Public, rate-limited, read-only list of ACTIVE lookup values for any
 * category the admin manages under Master Data (job-roles, job-skills,
 * currencies, languages, benefits, visa-statuses, …). Meant for form
 * dropdowns and autocompletes, so every option a user picks is one the admin
 * can rename, translate, reorder or retire without a deploy.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const meta = getCategory(category);
  if (!meta) {
    return NextResponse.json({ error: `Unknown category. Expected one of: ${getAllCategorySlugs().join(", ")}` }, { status: 404 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed, resetAt } = await checkRateLimit(`master-data:${ip}`, { limit: 240, windowSec: 60, prefix: "md" });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const parsedLimit = parseInt(searchParams.get("limit") ?? "200", 10);
  const limit = Math.min(1000, Number.isNaN(parsedLimit) ? 200 : Math.max(1, parsedLimit));

  await connectDB();
  const Model = await meta.model();
  const filter: Record<string, unknown> = { isActive: true };
  if (q) {
    const safe = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [{ name: safe }, { nameAr: safe }, { aliases: safe }];
  }
  const items = await Model.find(filter)
    .select("-__v -createdAt -updatedAt -isActive")
    .sort({ sortOrder: 1, name: 1 })
    .limit(limit)
    .lean();

  return NextResponse.json(
    { category, label: meta.label, labelAr: meta.labelAr, items },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
  );
}
