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

const ALLOWED_ROLES: UserRole[] = ["admin", "super_agent"];
const AVAILABILITY_VALUES = new Set(["immediately", "within_month", "within_3_months", "not_available"]);
const JOB_TYPE_VALUES = new Set(["remote", "hybrid", "onsite", "any"]);
const SORT_VALUES = new Set(["newest", "oldest", "profile_high", "profile_low"]);

interface RawAdminJobSeekerFilters {
  search?: unknown;
  skills?: unknown;
  location?: unknown;
  availability?: unknown;
  jobType?: unknown;
  minProfile?: unknown;
  maxProfile?: unknown;
  hasCV?: unknown;
  sort?: unknown;
  experienceYears?: unknown;
  education?: unknown;
  nationality?: unknown;
  summary?: unknown;
}

function normalizeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitizeAIInput(value, maxLength);
  return cleaned || undefined;
}

function normalizeFilters(raw: RawAdminJobSeekerFilters) {
  const skills = Array.isArray(raw.skills)
    ? raw.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => sanitizeAIInput(s, 50))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const minProfile = typeof raw.minProfile === "number" && raw.minProfile >= 0 && raw.minProfile <= 100
    ? Math.round(raw.minProfile) : undefined;
  const maxProfile = typeof raw.maxProfile === "number" && raw.maxProfile >= 0 && raw.maxProfile <= 100
    ? Math.round(raw.maxProfile) : undefined;

  return {
    search: normalizeString(raw.search),
    skills,
    location: normalizeString(raw.location),
    availability: typeof raw.availability === "string" && AVAILABILITY_VALUES.has(raw.availability)
      ? raw.availability : undefined,
    jobType: typeof raw.jobType === "string" && JOB_TYPE_VALUES.has(raw.jobType)
      ? raw.jobType : undefined,
    minProfile,
    maxProfile,
    hasCV: raw.hasCV === true ? true : undefined,
    sort: typeof raw.sort === "string" && SORT_VALUES.has(raw.sort)
      ? raw.sort : undefined,
    experienceYears: typeof raw.experienceYears === "number" && raw.experienceYears >= 0
      ? Math.round(raw.experienceYears) : undefined,
    education: normalizeString(raw.education),
    nationality: normalizeString(raw.nationality),
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
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { query } = await validateBody(req, aiCandidateSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);

  try {
    const prompt = `You translate admin job-seeker search requests into structured filters for a recruitment platform database.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "skills": string[],
  "location": string | null,
  "availability": "immediately" | "within_month" | "within_3_months" | "not_available" | null,
  "jobType": "remote" | "hybrid" | "onsite" | "any" | null,
  "minProfile": number | null,
  "maxProfile": number | null,
  "hasCV": boolean | null,
  "sort": "newest" | "oldest" | "profile_high" | "profile_low" | null,
  "experienceYears": number | null,
  "education": string | null,
  "nationality": string | null,
  "summary": string
}

Guidelines:
- "search" is ONLY for name, headline, or job title/role keywords (e.g. "electrical engineer", "HR manager", "marketing director", "accountant").
- "skills" extracts specific technical/professional skills (e.g. "React", "Python", "AutoCAD", "SAP").
- "location" for city/country/region.
- "availability" for timing/readiness of the candidate.
- "jobType" for preferred work mode.
- "minProfile"/"maxProfile" for profile completeness percentage (0-100).
- "hasCV" = true if user wants only candidates with uploaded CVs.
- "sort" for sorting preference.
- "experienceYears" minimum years of experience if mentioned.
- "education" for ANY degree, qualification, or academic field keywords. Examples: "MTech", "BTech", "MBA", "Computer Science", "BSc", "Engineering", "Bachelor", "Master", "PhD", "mechanical engineering". If the query mentions a degree or academic subject, it MUST go in "education", NOT "search". Use the SHORT FORM of the degree (BTech, MTech, MBA, BSc, MSc, PhD) — the system will automatically expand to match related variants (e.g. BTech also matches Bachelor, BSc, B.E.).
- "nationality" for nationality/citizenship filter.
- Keep summary under 180 characters describing what was understood.
- IMPORTANT RULES:
  1. If the query is about a degree or academic qualification (mtech, btech, bsc, mba, phd, bachelor, master, diploma, engineering, computer science, etc.), put it in "education" NOT in "search".
  2. If the query is about a job role/position (engineer, manager, developer), put it in "search".
  3. "mtech computer science" → education: "MTech Computer Science", search: null
  4. "electrical engineer" → search: "electrical engineer", education: null
  5. "MBA in marketing with 5 years experience" → education: "MBA marketing", experienceYears: 5
  6. If they mention specific technologies, put those in "skills".
  7. Never invent data not present in the query.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawAdminJobSeekerFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeFilters(rawFilters);

    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai.admin_jobseeker_search",
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
}, { resource: "job_seekers", action: "read" });
