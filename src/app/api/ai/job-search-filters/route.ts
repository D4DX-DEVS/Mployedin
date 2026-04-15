import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/models/User";
import { withAuth } from "@/lib/auth/withAuth";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiJobSearchSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

const ALLOWED_ROLES: UserRole[] = ["employer", "agent", "admin", "super_agent"];
const JOB_STATUSES = new Set(["active", "draft", "closed", "expired"]);
const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected"]);
const WORK_MODES = new Set(["onsite", "hybrid", "remote"]);

interface RawJobSearchFilters {
  search?: unknown;
  status?: unknown;
  approvalStatus?: unknown;
  workMode?: unknown;
  location?: unknown;
  skills?: unknown;
  showSalary?: unknown;
  summary?: unknown;
}

function normalizeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;

  const cleaned = sanitizeAIInput(value, maxLength);
  return cleaned || undefined;
}

function normalizeJobSearchFilters(raw: RawJobSearchFilters) {
  const status = typeof raw.status === "string" && JOB_STATUSES.has(raw.status)
    ? raw.status
    : undefined;
  const approvalStatus = typeof raw.approvalStatus === "string" && APPROVAL_STATUSES.has(raw.approvalStatus)
    ? raw.approvalStatus
    : undefined;
  const workMode = typeof raw.workMode === "string" && WORK_MODES.has(raw.workMode)
    ? raw.workMode
    : undefined;
  const skills = Array.isArray(raw.skills)
    ? raw.skills
      .filter((skill): skill is string => typeof skill === "string")
      .map((skill) => sanitizeAIInput(skill, 50))
      .filter(Boolean)
      .slice(0, 8)
    : [];

  return {
    search: normalizeString(raw.search),
    status,
    approvalStatus,
    workMode,
    location: normalizeString(raw.location),
    skills,
    showSalary: typeof raw.showSalary === "boolean" ? raw.showSalary : undefined,
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

  const { query } = await validateBody(req, aiJobSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);

  try {
    const prompt = `You translate natural-language employer job list searches into structured filters.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "status": "active" | "draft" | "closed" | "expired" | null,
  "approvalStatus": "pending" | "approved" | "rejected" | null,
  "workMode": "onsite" | "hybrid" | "remote" | null,
  "location": string | null,
  "skills": string[],
  "showSalary": boolean | null,
  "summary": string
}

Guidelines:
- Extract filters only when the user clearly asked for them.
- Put leftover title or keyword intent into "search".
- If the user asks for remote jobs, set workMode to "remote".
- If the user asks for salary hidden or undisclosed jobs, set showSalary to false.
- Never invent company names, dates, or IDs.
- Keep summary under 180 characters.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawJobSearchFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeJobSearchFilters(rawFilters);

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
}, { resource: "jobs", action: "read" });