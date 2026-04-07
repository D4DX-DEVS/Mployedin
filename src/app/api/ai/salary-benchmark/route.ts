import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userId = (session.user as unknown as { id: string }).id ?? ip;
    const { allowed, remaining, resetAt } = checkRateLimit(
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

    const { searchParams } = new URL(req.url);
    const role = sanitizeAIInput(searchParams.get("role") ?? "", 200);
    const location = sanitizeAIInput(searchParams.get("location") ?? "", 100);
    const seniority = sanitizeAIInput(searchParams.get("seniority") ?? "mid", 50);
    const currency = sanitizeAIInput(searchParams.get("currency") ?? "USD", 10);
    const period = sanitizeAIInput(searchParams.get("period") ?? "yearly", 20);

    if (!role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
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

    const rawText = (await generateText(prompt, GEMINI_MODELS.flash, 400)).trim();

    let benchmark: unknown;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      benchmark = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json(benchmark, {
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });
  } catch (err) {
    console.error("[Salary Benchmark Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
