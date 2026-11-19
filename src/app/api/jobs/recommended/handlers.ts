import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { displayedJobs, scoreSeekerPool } from "@/lib/matching/seekerMatches";
import { maskJobEmployer } from "@/lib/jobs/companyDisclosure";
import { loadSeekerJobPool, POOL_SIZE } from "@/lib/matching/seekerJobPool";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/jobs/recommended
 *
 * The seeker's job feed, scored by the matching engine the emails use, so a
 * job reads the same percentage here as in the digest. Every job in the pool
 * is returned with its score; the ones flagged `recommended` (eligible and at
 * or above the admin threshold) are the only ones any surface may present as
 * a recommendation.
 * Supports hybrid pagination: cursor-based infinite scroll within pool pages.
 *
 * Query params:
 *   cursor      — last job _id from previous page (within current pool)
 *   limit       — items per infinite-scroll batch, default 10, max 20
 *   sort        — "match" (default) | "latest" | "salary"
 *   min_score   — minimum match score filter (default 0 = all jobs)
 *   pool_page   — macro page number (1-based), each pool holds up to POOL_SIZE jobs
 *   recommended — "true" returns recommended jobs only (the home page's list)
 */

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor") ?? null;
  const limitParam = Number(sp.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, Math.round(limitParam))) : 10;
  const sort = sp.get("sort") ?? "match";
  const minScore = Number(sp.get("min_score") ?? "0");
  const poolPageParam = Number(sp.get("pool_page") ?? "1");
  const poolPage = Number.isFinite(poolPageParam) ? Math.max(1, Math.round(poolPageParam)) : 1;
  const recommendedOnly = sp.get("recommended") === "true";

  const loaded = await loadSeekerJobPool(ctx.userId, poolPage);
  if (!loaded) {
    return NextResponse.json({ jobs: [], nextCursor: null, total: 0 });
  }
  const { seekerProfile, candidateJobs, totalMatchingJobs, retrievedByVector } = loaded;

  // Score with the engine. Recommended jobs lead; jobs that fail a hard gate
  // sink by a fixed penalty but stay visible (LinkedIn / Indeed behaviour), and
  // the displayed matchScore is never altered by the ordering.
  const pool = await scoreSeekerPool(seekerProfile, candidateJobs, undefined, { jevMode: "cached" });
  const scoredWithBoost = pool.jobs;

  let scored: typeof scoredWithBoost;
  if (recommendedOnly) {
    // No fallback here: an empty answer is the truthful one, and the page says
    // why using limitingFactor.
    scored = scoredWithBoost.filter((j) => j.recommended);
  } else {
    // Apply the minimum-score filter (defaults to 0, meaning all jobs show).
    scored = scoredWithBoost.filter((j) => j.sortScore >= minScore);
    if (scored.length === 0 && scoredWithBoost.length > 0) scored = [...scoredWithBoost];
  }

  // Sort within pool (the shared ranker already ordered by sortScore)
  if (sort === "latest") {
    scored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "salary") {
    scored.sort((a, b) => (b.salary?.max ?? 0) - (a.salary?.max ?? 0));
  }

  const poolTotal = scored.length;
  const totalPoolPages = retrievedByVector ? 1 : Math.max(1, Math.ceil(totalMatchingJobs / POOL_SIZE));

  // Aggregate signals for the dashboard stat cards (computed over the scored
  // pool so they reflect genuine profile fit, not the raw active-job count).
  const WEEK_MS = 7 * 24 * 3600_000;
  const now = Date.now();
  // matchedCount = jobs that clear every hard gate; strongMatches = the ones
  // we recommend. Both over the whole pool, not the page.
  const matchedCount = pool.eligibleCount;
  const strongMatches = pool.recommendedCount;
  const matchSummary = {
    threshold: pool.threshold,
    bestScore: pool.bestScore,
    limitingFactor: pool.limitingFactor ?? null,
  };
  const newThisWeek = scoredWithBoost.filter(
    (j) => now - new Date(j.createdAt as string | Date).getTime() <= WEEK_MS,
  ).length;

  // Cursor-based pagination within the pool.
  // A cursor that is no longer in the pool (job expired, filled, or filtered out
  // between requests) must end the feed — falling back to index 0 would re-serve
  // page 1 as the "next" page and duplicate every React key in the client feed.
  let startIndex = 0;
  if (cursor) {
    const idx = scored.findIndex((j) => String(j._id) === cursor);
    if (idx === -1) {
      return NextResponse.json({
        jobs: [],
        nextCursor: null,
        total: poolTotal,
        poolPage,
        totalPoolPages,
        totalJobs: totalMatchingJobs,
        matchedCount,
        strongMatches,
        newThisWeek,
        ...matchSummary,
      });
    }
    startIndex = idx + 1;
  }

  const pageJobs = scored
    .slice(startIndex, startIndex + limit)
    .map((job) => maskJobEmployer(job as unknown as Record<string, unknown>) as unknown as typeof job);
  // An empty profile scores the same neutral figure against every job; the
  // cards then carry no percentage at all (displayedJobs).
  const page = displayedJobs(pageJobs, pool);
  const nextCursor =
    page.length > 0 && startIndex + page.length < poolTotal
      ? String(page[page.length - 1]._id)
      : null;

  return NextResponse.json({
    jobs: page,
    nextCursor,
    total: poolTotal,
    poolPage,
    totalPoolPages,
    totalJobs: totalMatchingJobs,
    matchedCount,
    strongMatches,
    newThisWeek,
    ...matchSummary,
    matchUnavailable: pool.scoresUnsupported === true,
  });
}

export { getHandler };
