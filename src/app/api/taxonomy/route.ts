import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  TAXONOMY_SEEDS,
  TAXONOMY_TYPES,
  type TaxonomyType,
} from "@/lib/taxonomy/seeds";

/**
 * GET /api/taxonomy?type=<skills|roles|locations|countries|specializations|industries>&q=<query>&limit=<n>
 *
 * Public, rate-limited reference-data search used by the job-seeker autocomplete
 * inputs (onboarding, preferences, profile). Merges active master-data documents
 * with a curated seed list so results stay useful even when a collection is empty.
 * No AI — fast regex lookup.
 */
export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown")
    .split(",")[0]
    .trim();
  const { allowed, resetAt } = checkRateLimit(`taxonomy:${ip}`, {
    limit: 120,
    windowSec: 60,
    prefix: "tax",
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "") as TaxonomyType;
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const parsedLimit = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(25, Number.isNaN(parsedLimit) ? 10 : Math.max(1, parsedLimit));

  if (!TAXONOMY_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Expected one of: ${TAXONOMY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const lowerQ = q.toLowerCase();

  // ── DB results (best-effort; never let a sparse/missing collection break search) ──
  let dbItems: string[] = [];
  try {
    await connectDB();
    dbItems = await fetchFromDb(type, q, limit);
  } catch {
    dbItems = [];
  }

  // ── Curated seeds filtered by query ──
  const seeds = TAXONOMY_SEEDS[type].filter((s) =>
    lowerQ ? s.toLowerCase().includes(lowerQ) : true
  );

  // ── Merge, de-duplicate case-insensitively, prioritise prefix matches ──
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...dbItems, ...seeds]) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  const ranked = lowerQ
    ? merged.sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(lowerQ) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(lowerQ) ? 0 : 1;
        return aStarts - bStarts;
      })
    : merged;

  return NextResponse.json(
    { items: ranked.slice(0, limit) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}

async function fetchFromDb(type: TaxonomyType, q: string, limit: number): Promise<string[]> {
  const regex = q ? { $regex: escapeRegex(q), $options: "i" } : undefined;
  const nameFilter = regex ? { name: regex, isActive: true } : { isActive: true };

  switch (type) {
    case "skills": {
      const { default: JobSkill } = await import("@/models/JobSkill");
      const docs = await JobSkill.find(nameFilter)
        .select("name")
        .sort({ sortOrder: 1, name: 1 })
        .limit(limit)
        .lean();
      return docs.map((d) => d.name);
    }
    case "industries": {
      const { default: Industry } = await import("@/models/Industry");
      const docs = await Industry.find(nameFilter)
        .select("name")
        .sort({ sortOrder: 1, name: 1 })
        .limit(limit)
        .lean();
      return docs.map((d) => d.name);
    }
    case "specializations": {
      const { MajorSubject } = await import("@/models/MajorSubject");
      const docs = await MajorSubject.find(nameFilter)
        .select("name")
        .sort({ sortOrder: 1, name: 1 })
        .limit(limit)
        .lean();
      return docs.map((d: { name: string }) => d.name);
    }
    case "countries": {
      const { default: Country } = await import("@/models/Country");
      const docs = await Country.find(nameFilter)
        .select("name")
        .sort({ sortOrder: 1, name: 1 })
        .limit(limit)
        .lean();
      return docs.map((d) => d.name);
    }
    case "locations": {
      const { default: City } = await import("@/models/City");
      const { default: Country } = await import("@/models/Country");
      const [cities, countries] = await Promise.all([
        City.find(nameFilter).select("name").sort({ sortOrder: 1, name: 1 }).limit(limit).lean(),
        Country.find(nameFilter).select("name").sort({ sortOrder: 1, name: 1 }).limit(limit).lean(),
      ]);
      return [...cities.map((d) => d.name), ...countries.map((d) => d.name)];
    }
    case "roles": {
      // No dedicated roles model — surface distinct titles from live job postings.
      const { default: Job } = await import("@/models/Job");
      const filter: Record<string, unknown> = { status: "active" };
      if (regex) filter.title = regex;
      const titles = (await Job.distinct("title", filter)) as string[];
      return titles.slice(0, limit);
    }
    default:
      return [];
  }
}
