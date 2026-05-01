import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { routeGenerate } from "@/lib/ai/router";

export async function POST(req: NextRequest) {
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
    const { allowed } = checkRateLimit(
      `ai-filter:${userId}`,
      RATE_LIMIT_CONFIGS.ai
    );
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { query } = body as { query?: string };

    if (!query || typeof query !== "string" || query.length > 500) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `You are a filter parser for an interview management system. Parse the user's natural language query into structured filters.

Available filters:
- search: text to search candidate name or job title
- status: one of "scheduled", "confirmed", "completed", "cancelled"
- type: one of "video", "offline", "hybrid"
- outcome: one of "passed", "failed", "hold", "no_show"
- dateFrom: ISO date string (YYYY-MM-DD)
- dateTo: ISO date string (YYYY-MM-DD)

Today's date is ${today}.

User query: "${query}"

Return ONLY a JSON object with the applicable filters. If a filter doesn't apply, omit it.
Example: {"search": "React", "status": "scheduled", "dateFrom": "2026-05-01", "dateTo": "2026-05-07"}`;

    const result = await routeGenerate(
      "You are a JSON-only response bot. Return only valid JSON, no markdown or explanation.\n\n" + prompt,
      "chat",
      { jsonMode: true, maxTokens: 200 }
    );

    // Parse the AI response
    const text = result;
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return NextResponse.json({ search: query });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and sanitize
    const allowed_statuses = ["scheduled", "confirmed", "completed", "cancelled"];
    const allowed_types = ["video", "offline", "hybrid"];
    const allowed_outcomes = ["passed", "failed", "hold", "no_show"];

    const filters: Record<string, string> = {};
    if (parsed.search && typeof parsed.search === "string") filters.search = parsed.search.slice(0, 200);
    if (parsed.status && allowed_statuses.includes(parsed.status)) filters.status = parsed.status;
    if (parsed.type && allowed_types.includes(parsed.type)) filters.type = parsed.type;
    if (parsed.outcome && allowed_outcomes.includes(parsed.outcome)) filters.outcome = parsed.outcome;
    if (parsed.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateFrom)) filters.dateFrom = parsed.dateFrom;
    if (parsed.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateTo)) filters.dateTo = parsed.dateTo;

    return NextResponse.json(filters);
  } catch {
    return NextResponse.json({ error: "Failed to parse query" }, { status: 500 });
  }
}
