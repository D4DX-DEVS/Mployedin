import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import logger from "@/lib/logger";

// In-memory cache: key → { data, expiresAt }
const benchmarkCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Subscription feature gate
    const userRole = (session.user as unknown as { role: string }).role;
    const gateErr = await enforceFeatureGate(session.user.id!, userRole, { type: "ai", feature: "ai_salary_benchmark" });
    if (gateErr) return gateErr;

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userId = (session.user as unknown as { id: string }).id ?? ip;
    const { allowed, remaining, resetAt } = await checkRateLimit(
      `salary-benchmark:${userId}`,
      RATE_LIMIT_CONFIGS.ai
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const __aiQuota = await enforceDailyAiQuota(session.user.id!, userRole);
    if (__aiQuota) return __aiQuota;

    const { searchParams } = new URL(req.url);
    const role = sanitizeAIInput(searchParams.get("role") ?? "", 200);
    const location = sanitizeAIInput(searchParams.get("location") ?? "", 100);
    const seniority = sanitizeAIInput(searchParams.get("seniority") ?? "mid", 50);
    const currency = sanitizeAIInput(searchParams.get("currency") ?? "USD", 10);
    const period = sanitizeAIInput(searchParams.get("period") ?? "yearly", 20);

    if (!role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    // Check cache before hitting the AI
    const cacheKey = `${role}|${location}|${seniority}|${currency}|${period}`;
    const cached = benchmarkCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: { "X-RateLimit-Remaining": String(remaining), "X-Cache": "HIT" },
      });
    }


    const prompt = `You are a compensation analyst. Provide a salary benchmark for the following role:

Role: ${role}
Location: ${location || "Global / Remote"}
Seniority: ${seniority}
Currency: ${currency}
Pay period: ${period}

Research the typical market salary ranges for this role and respond with ONLY a JSON object (no markdown):
{
  "p25": <25th percentile as integer>,
  "median": <median as integer>,
  "p75": <75th percentile as integer>,
  "currency": "${currency}",
  "period": "${period}",
  "competitiveness": "below" | "competitive" | "above",
  "insight": "<one sentence insight about this market, e.g. demand, supply, trends>"
}

Base the numbers on real market data for this currency and period. For example if period is monthly and currency is AED, provide typical AED monthly amounts for Dubai market.`;

    // A provider outage here is expected and non-fatal — the widget already
    // shows "Could not load market data." Report unavailable, not a crash.
    let rawText: string;
    try {
      rawText = (await generateText(prompt, GEMINI_MODELS.flash, 400)).trim();
    } catch (err) {
      logger.warn({ err }, "[Salary Benchmark] provider call failed");
      return NextResponse.json({ error: "Benchmark unavailable" }, { status: 503 });
    }

    let benchmark: unknown;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      benchmark = JSON.parse(cleaned);
      // Store in cache for 24 hours
      benchmarkCache.set(cacheKey, { data: benchmark, expiresAt: Date.now() + CACHE_TTL_MS });
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json(benchmark, {
      headers: { "X-RateLimit-Remaining": String(remaining), "X-Cache": "MISS" },
    });
  } catch (err) {
    logger.error({ err }, "[Salary Benchmark Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
