/**
 * POST /api/job-seekers/generate-embeddings
 * Admin endpoint to generate/refresh search embeddings for all job seekers.
 * Run this once to pre-compute embeddings, then they auto-update on profile changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";
import { generateEmbeddingBatch, buildProfileText } from "@/lib/ai/embeddings";
import logger from "@/lib/logger";

const ALLOWED_ROLES: UserRole[] = ["admin", "super_agent"];
const BATCH_SIZE = 10; // Process 10 at a time to avoid rate limits

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ALLOWED_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const forceAll = body.forceAll === true;

  // Find candidates that need embeddings
  const filter = forceAll
    ? {}
    : { $or: [{ searchEmbedding: { $exists: false } }, { searchEmbedding: { $size: 0 } }] };

  const candidates = await JobSeeker.find(filter)
    .populate("userId", "name email")
    .lean();

  let generated = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const texts = batch.map(js => buildProfileText(js as unknown as Record<string, unknown>));

    try {
      const embeddings = await generateEmbeddingBatch(texts);

      // Store embeddings
      const updates = batch.map((js, idx) =>
        JobSeeker.updateOne(
          { _id: js._id },
          { $set: { searchEmbedding: embeddings[idx] } }
        )
      );
      await Promise.all(updates);
      generated += batch.length;
    } catch (err) {
      logger.error({ err, batchStart: i }, "Embedding batch failed");
      failed += batch.length;
      // Wait a bit before retrying next batch (rate limit)
      await new Promise(r => setTimeout(r, 2000));
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return NextResponse.json({
    message: `Embedding generation complete`,
    total: candidates.length,
    generated,
    failed,
    skipped: forceAll ? 0 : "candidates with existing embeddings were skipped",
  });
}, { resource: "job_seekers", action: "update" });
