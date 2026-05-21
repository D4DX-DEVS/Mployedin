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
import { sanitizeAIInput } from "@/lib/ai/sanitize";

const ALLOWED_ROLES: UserRole[] = ["admin", "super_agent"];
const MIN_SIMILARITY = 0.35; // Minimum cosine similarity threshold
const MAX_RESULTS = 50;

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

  // Fetch all job seekers with their data (cached embeddings or compute on-the-fly)
  const jobSeekers = await JobSeeker.find({ status: { $ne: "deleted" } })
    .populate("userId", "name email")
    .select({
      fullName: 1, headline: 1, summary: 1, nationality: 1, currentLocation: 1,
      skills: 1, experience: 1, education: 1, languages: 1, certifications: 1,
      preferredJobType: 1, availabilityStatus: 1, preferredLocations: 1,
      totalExperienceYears: 1, profileCompleteness: 1, status: 1,
      industry: 1, "cv.originalUrl": 1, createdAt: 1, userId: 1,
      searchEmbedding: 1, email: 1, phone: 1, badges: 1,
    })
    .lean();

  // Compute similarity scores
  const scoredResults: { doc: typeof jobSeekers[0]; score: number }[] = [];

  for (const js of jobSeekers) {
    let embedding = (js as Record<string, unknown>).searchEmbedding as number[] | undefined;

    if (!embedding || embedding.length === 0) {
      // Generate and store embedding on-the-fly for candidates without one
      try {
        const profileText = buildProfileText(js as unknown as Record<string, unknown>);
        embedding = await generateEmbedding(profileText);
        // Store embedding for future use (fire-and-forget)
        JobSeeker.updateOne(
          { _id: js._id },
          { $set: { searchEmbedding: embedding } }
        ).exec().catch(() => { /* ignore */ });
      } catch {
        continue; // Skip if embedding generation fails
      }
    }

    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score >= MIN_SIMILARITY) {
      scoredResults.push({ doc: js, score });
    }
  }

  // Sort by similarity score (highest first)
  scoredResults.sort((a, b) => b.score - a.score);

  const total = scoredResults.length;
  const paged = scoredResults.slice((page - 1) * limit, page * limit);

  const items = paged.map(({ doc, score }) => ({
    ...doc,
    _relevanceScore: Math.round(score * 100), // 0-100%
  }));

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    mode: "vector",
  });
}, { resource: "job_seekers", action: "read" });
