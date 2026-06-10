/**
 * POST /api/job-seekers/vector-search
 * Semantic vector search across all job seeker fields.
 * Uses Gemini embeddings for semantic similarity matching.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import type { UserRole } from "@/models/User";
import { generateEmbedding, cosineSimilarity, buildProfileText } from "@/lib/ai/embeddings";
import { atlasVectorSearch } from "@/lib/ai/atlasVectorSearch";
import { sanitizeAIInput } from "@/lib/ai/sanitize";

const ALLOWED_ROLES: UserRole[] = ["admin", "super_agent"];
const MIN_SIMILARITY = 0.35; // Minimum cosine similarity threshold
const MAX_RESULTS = 50;
// Hard cap on how many pre-embedded candidates are scanned per request, so a
// growing collection can never load an unbounded number of vectors into memory.
const SCAN_LIMIT = 5000;
// Bound on-the-fly embedding generation per request. Candidates missing an
// embedding are backfilled a few at a time instead of generating thousands of
// synchronous Gemini calls inside a single search request.
const MAX_BACKFILL_PER_REQUEST = 10;

// Fields needed to build the embedding text for a candidate without one.
const BACKFILL_FIELDS = {
  fullName: 1, headline: 1, summary: 1, nationality: 1, currentLocation: 1,
  skills: 1, experience: 1, education: 1, languages: 1, certifications: 1,
  preferredJobType: 1, availabilityStatus: 1, preferredLocations: 1,
  totalExperienceYears: 1, industry: 1, profileCompleteness: 1, status: 1,
  userId: 1,
} as const;

// Fields returned for the paged result rows (hydrated after scoring).
const RESULT_FIELDS = {
  fullName: 1, headline: 1, summary: 1, nationality: 1, currentLocation: 1,
  skills: 1, experience: 1, education: 1, languages: 1, certifications: 1,
  preferredJobType: 1, availabilityStatus: 1, preferredLocations: 1,
  totalExperienceYears: 1, profileCompleteness: 1, status: 1,
  industry: 1, "cv.originalUrl": 1, createdAt: 1, userId: 1,
  email: 1, phone: 1, badges: 1,
} as const;

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ALLOWED_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  const query = sanitizeAIInput(body.query ?? "", 500);
  const page = Math.max(1, parseInt(body.page ?? "1"));
  const limit = Math.min(parseInt(body.limit ?? "10"), MAX_RESULTS);

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Generate embedding for the search query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch {
    return NextResponse.json(
      { error: "Embedding generation failed. Please try again." },
      { status: 503 }
    );
  }

  // Phase 1 — Atlas $vectorSearch (index-backed ANN, preferred). Falls back to
  // a bounded in-memory cosine scan when the vector index is unavailable.
  let mode: "atlas-vector" | "vector" = "atlas-vector";
  let scored: { id: unknown; score: number }[] | null = await atlasVectorSearch(queryEmbedding, {
    limit: Math.min(MAX_RESULTS * 4, 200),
    minCosine: MIN_SIMILARITY,
  });

  if (scored === null) {
    mode = "vector";
    scored = [];
    // Fallback — light scan: pull only _id + searchEmbedding for candidates that
    // already have an embedding. Each row is a vector instead of a full profile,
    // and the count is capped, so memory usage stays bounded.
    const preEmbedded = await JobSeeker.find({
      status: { $ne: "deleted" },
      "searchEmbedding.0": { $exists: true },
    })
      .select({ _id: 1, searchEmbedding: 1 })
      .limit(SCAN_LIMIT)
      .lean();

    for (const js of preEmbedded) {
      const embedding = (js as Record<string, unknown>).searchEmbedding as number[] | undefined;
      if (!embedding || embedding.length === 0) continue;
      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= MIN_SIMILARITY) {
        scored.push({ id: js._id, score });
      }
    }
  }

  // Phase 2 — bounded backfill: generate embeddings for a small batch of
  // candidates that don't have one yet. This converges over repeated searches
  // without ever firing an unbounded number of synchronous embedding calls.
  const missing = await JobSeeker.find({
    status: { $ne: "deleted" },
    "searchEmbedding.0": { $exists: false },
  })
    .select(BACKFILL_FIELDS)
    .limit(MAX_BACKFILL_PER_REQUEST)
    .lean();

  for (const js of missing) {
    try {
      const profileText = buildProfileText(js as unknown as Record<string, unknown>);
      const embedding = await generateEmbedding(profileText);
      // Persist for future searches (fire-and-forget).
      JobSeeker.updateOne(
        { _id: js._id },
        { $set: { searchEmbedding: embedding } }
      ).exec().catch(() => { /* ignore */ });

      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= MIN_SIMILARITY) {
        scored.push({ id: js._id, score });
      }
    } catch {
      continue; // Skip if embedding generation fails
    }
  }

  // Sort by similarity score (highest first)
  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  const pagedScored = scored.slice((page - 1) * limit, page * limit);

  // Phase 3 — hydrate full fields only for the page being returned.
  const pagedIds = pagedScored.map((s) => s.id);
  const docs = await JobSeeker.find({ _id: { $in: pagedIds } })
    .populate("userId", "name email")
    .select(RESULT_FIELDS)
    .lean();

  const docMap = new Map(docs.map((d) => [String(d._id), d]));

  const items = pagedScored
    .map(({ id, score }) => {
      const doc = docMap.get(String(id));
      if (!doc) return null;
      return { ...doc, _relevanceScore: Math.round(score * 100) }; // 0-100%
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    mode,
  });
}, { resource: "job_seekers", action: "read" });
