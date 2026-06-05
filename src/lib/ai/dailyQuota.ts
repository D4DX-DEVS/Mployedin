/**
 * Hard per-user DAILY AI-usage quota.
 *
 * This is a global cap across all `/api/ai/*` endpoints, enforced BEFORE any
 * AI provider call — including for roles that bypass the subscription feature
 * gate (admin / super_agent / agent) and for the "free" AI features. It is the
 * backstop that caps total spend/abuse per account per day.
 *
 * Backed by MongoDB (see AiDailyUsage model) so the counter survives serverless
 * cold starts without Redis. When over quota the caller receives HTTP 429 with
 * a `Retry-After` header pointing at the next UTC midnight.
 *
 * Env:
 *   AI_DAILY_LIMIT          Default daily cap per user (default 200). 0 disables.
 *   AI_DAILY_LIMIT_PRIVILEGED  Cap for admin/super_agent/agent (default 1000).
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import AiDailyUsage from "@/models/AiDailyUsage";

const PRIVILEGED_ROLES = new Set(["admin", "super_agent", "agent"]);

function parseLimit(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getDailyLimit(role: string): number {
  if (PRIVILEGED_ROLES.has(role)) {
    return parseLimit(process.env.AI_DAILY_LIMIT_PRIVILEGED, 1000);
  }
  return parseLimit(process.env.AI_DAILY_LIMIT, 200);
}

/** UTC `YYYY-MM-DD` for the given instant. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Start of the next UTC day. */
function nextUtcMidnight(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

/**
 * Enforce the per-user daily AI quota.
 * Returns a 429 `NextResponse` when the user is over quota, or `null` when the
 * request is allowed (after atomically counting it).
 */
export async function enforceDailyAiQuota(
  userId: string,
  role: string,
): Promise<NextResponse | null> {
  const limit = getDailyLimit(role);
  if (limit <= 0) return null; // quota disabled

  await connectDB();

  const now = new Date();
  const day = utcDay(now);
  const resetAt = nextUtcMidnight(now);

  // Atomic upsert + increment — race-safe via the unique {userId, day} index.
  const doc = await AiDailyUsage.findOneAndUpdate(
    { userId, day },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(resetAt.getTime() + 60 * 60 * 1000) },
    },
    { upsert: true, new: true },
  ).lean();

  const count = doc?.count ?? 1;
  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
    return NextResponse.json(
      {
        error: "AI_DAILY_LIMIT_EXCEEDED",
        message: "You have reached your daily AI usage limit. Please try again tomorrow.",
        limit,
        used: count - 1,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-AI-Daily-Limit": String(limit),
          "X-AI-Daily-Remaining": "0",
          "X-AI-Daily-Reset": String(Math.ceil(resetAt.getTime() / 1000)),
        },
      },
    );
  }

  return null; // allowed
}
