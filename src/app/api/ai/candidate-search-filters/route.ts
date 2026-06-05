import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/models/User";
import { withAuth } from "@/lib/auth/withAuth";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiCandidateSearchSchema } from "@/lib/validators/ai";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

const ALLOWED_ROLES: UserRole[] = ["employer", "agent", "admin", "super_agent"];
const AVAILABILITY_STATUSES = new Set(["immediately", "within_month", "within_3_months", "not_available"]);
const SCORE_BANDS = new Set(["all", "high", "good", "low", "unscored"]);

interface RawCandidateSearchFilters {
  search?: unknown;
  jobQuery?: unknown;
  location?: unknown;
  skills?: unknown;
  availability?: unknown;
  scoreBand?: unknown;
  summary?: unknown;
}

function normalizeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = sanitizeAIInput(value, maxLength);
  return cleaned || undefined;
}

function normalizeCandidateSearchFilters(raw: RawCandidateSearchFilters) {
  const skills = Array.isArray(raw.skills)
    ? raw.skills
      .filter((skill): skill is string => typeof skill === "string")
      .map((skill) => sanitizeAIInput(skill, 50))
      .filter(Boolean)
      .slice(0, 8)
    : [];

  return {
    search: normalizeString(raw.search),
    jobQuery: normalizeString(raw.jobQuery),
    location: normalizeString(raw.location),
    skills,
    availability: typeof raw.availability === "string" && AVAILABILITY_STATUSES.has(raw.availability)
      ? raw.availability
      : undefined,
    scoreBand: typeof raw.scoreBand === "string" && SCORE_BANDS.has(raw.scoreBand)
      ? raw.scoreBand
      : undefined,
    summary: normalizeString(raw.summary, 220),
  };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ALLOWED_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const { query } = await validateBody(req, aiCandidateSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);

  try {
    const prompt = `You translate employer candidate-search requests into structured filters.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "jobQuery": string | null,
  "location": string | null,
  "skills": string[],
  "availability": "immediately" | "within_month" | "within_3_months" | "not_available" | null,
  "scoreBand": "all" | "high" | "good" | "low" | "unscored" | null,
  "summary": string
}

Guidelines:
- Put leftover title, role, or keyword intent into "search".
- Use "jobQuery" only if the user is clearly referring to a job or role to compare against.
- Extract skills only when they are explicit and keep them short.
- Use "availability" only when the user asks for timing or readiness.
- Use "scoreBand" for intent like high match, good fit, low fit, or unscored.
- Never invent candidate names, IDs, employers, or dates.
- Keep summary under 180 characters.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawCandidateSearchFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeCandidateSearchFilters(rawFilters);

    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai.candidate_search_filter",
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
}, { resource: "job_seekers", action: "read", aiQuota: true });