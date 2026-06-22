import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/models/User";
import { withAuth } from "@/lib/auth/withAuth";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiApplicationSearchSchema } from "@/lib/validators/ai";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

const ALLOWED_ROLES: UserRole[] = ["admin", "super_agent", "agent"];
const APP_STATUSES = new Set(["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"]);
const SOURCE_TYPES = new Set(["easy_apply", "full_form", "direct", "auto_apply"]);
const SCORE_BANDS = new Set(["all", "excellent", "good", "average", "low"]);

interface RawAppSearchFilters {
  search?: unknown;
  status?: unknown;
  source?: unknown;
  scoreBand?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  skills?: unknown;
  employer?: unknown;
  summary?: unknown;
}

function normalizeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitizeAIInput(value, maxLength);
  return cleaned || undefined;
}

function normalizeAppSearchFilters(raw: RawAppSearchFilters) {
  const status = typeof raw.status === "string" && APP_STATUSES.has(raw.status)
    ? raw.status
    : undefined;
  const source = typeof raw.source === "string" && SOURCE_TYPES.has(raw.source)
    ? raw.source
    : undefined;
  const scoreBand = typeof raw.scoreBand === "string" && SCORE_BANDS.has(raw.scoreBand)
    ? raw.scoreBand
    : undefined;
  const skills = Array.isArray(raw.skills)
    ? raw.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => sanitizeAIInput(s, 50))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  // Validate date strings
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (typeof raw.dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateFrom)) {
    const d = new Date(raw.dateFrom);
    if (!isNaN(d.getTime())) dateFrom = raw.dateFrom;
  }
  if (typeof raw.dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateTo)) {
    const d = new Date(raw.dateTo);
    if (!isNaN(d.getTime())) dateTo = raw.dateTo;
  }

  return {
    search: normalizeString(raw.search),
    status,
    source,
    scoreBand,
    dateFrom,
    dateTo,
    skills,
    employer: normalizeString(raw.employer),
    summary: normalizeString(raw.summary, 220),
  };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ALLOWED_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const { query } = await validateBody(req, aiApplicationSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);
  const today = new Date().toISOString().split("T")[0];

  try {
    const prompt = `You translate natural-language admin application searches into structured filters.
Today's date is ${today}.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "status": "applied" | "shortlisted" | "interview_scheduled" | "selected" | "offer" | "hired" | "rejected" | "withdrawn" | null,
  "source": "easy_apply" | "full_form" | "direct" | "auto_apply" | null,
  "scoreBand": "excellent" | "good" | "average" | "low" | null,
  "dateFrom": "YYYY-MM-DD" | null,
  "dateTo": "YYYY-MM-DD" | null,
  "skills": string[],
  "employer": string | null,
  "summary": string
}

Guidelines:
- Extract filters only when the user clearly asked for them.
- Put leftover name, keyword, or role intent into "search".
- Use "skills" only when the user explicitly asks for a skill/technology.
- Use "scoreBand" for AI score intent: "excellent" = 80-100, "good" = 60-79, "average" = 40-59, "low" = 0-39.
- Use "status" for pipeline stage references (e.g. "shortlisted", "in interview" → "interview_scheduled", "selected", "rejected").
- Use "source" when user mentions how they applied (easy apply, direct, auto apply, full form).
- Use "employer" when user mentions a company name.
- For relative dates like "last week", "this month", "yesterday", calculate from today (${today}).
- Never invent candidate names or IDs.
- Keep summary under 180 characters.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawAppSearchFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeAppSearchFilters(rawFilters);

    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai.application_search_filter",
      resource: "ai",
      meta: { query: safeQuery },
      req,
    });

    return NextResponse.json({
      query: safeQuery,
      filters,
      summary: filters.summary ?? `AI search applied for "${safeQuery}".`,
      degraded: false,
    });
  } catch {
    return NextResponse.json({
      query: safeQuery,
      filters: { search: safeQuery, skills: [] },
      summary: `AI parsing was unavailable, so keyword search was used for "${safeQuery}".`,
      degraded: true,
    });
  }
}, { resource: "applications", action: "read", aiQuota: true });
