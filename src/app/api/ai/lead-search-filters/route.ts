import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/models/User";
import { withAuth } from "@/lib/auth/withAuth";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { z } from "zod";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

const ALLOWED_ROLES: UserRole[] = ["super_agent", "admin"];

const aiLeadSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
});

const VALID_STATUSES = new Set(["new", "contacted", "interested", "negotiating", "converted", "lost"]);
const VALID_SORT_FIELDS = new Set(["createdAt", "companyName", "status", "followUpAt", "country", "industry"]);

interface RawLeadSearchFilters {
  search?: unknown;
  status?: unknown;
  country?: unknown;
  industry?: unknown;
  source?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  followUpFrom?: unknown;
  followUpTo?: unknown;
  hasNotes?: unknown;
  hasFollowUp?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
  summary?: unknown;
}

function normalizeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitizeAIInput(value, maxLength);
  return cleaned || undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().split("T")[0];
}

function normalizeLeadSearchFilters(raw: RawLeadSearchFilters) {
  return {
    search: normalizeString(raw.search),
    status: typeof raw.status === "string" && VALID_STATUSES.has(raw.status) ? raw.status : undefined,
    country: normalizeString(raw.country),
    industry: normalizeString(raw.industry),
    source: normalizeString(raw.source),
    dateFrom: normalizeDate(raw.dateFrom),
    dateTo: normalizeDate(raw.dateTo),
    followUpFrom: normalizeDate(raw.followUpFrom),
    followUpTo: normalizeDate(raw.followUpTo),
    hasNotes: typeof raw.hasNotes === "boolean" ? raw.hasNotes : undefined,
    hasFollowUp: typeof raw.hasFollowUp === "string" && ["true", "overdue"].includes(raw.hasFollowUp) ? raw.hasFollowUp : undefined,
    sortBy: typeof raw.sortBy === "string" && VALID_SORT_FIELDS.has(raw.sortBy) ? raw.sortBy : undefined,
    sortOrder: typeof raw.sortOrder === "string" && ["asc", "desc"].includes(raw.sortOrder) ? raw.sortOrder : undefined,
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
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { query } = await validateBody(req, aiLeadSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);

  try {
    const prompt = `You translate lead pipeline search requests into structured filters.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "status": "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost" | null,
  "country": string | null,
  "industry": string | null,
  "source": string | null,
  "dateFrom": "YYYY-MM-DD" | null,
  "dateTo": "YYYY-MM-DD" | null,
  "followUpFrom": "YYYY-MM-DD" | null,
  "followUpTo": "YYYY-MM-DD" | null,
  "hasNotes": boolean | null,
  "hasFollowUp": "true" | "overdue" | null,
  "sortBy": "createdAt" | "companyName" | "status" | "followUpAt" | "country" | "industry" | null,
  "sortOrder": "asc" | "desc" | null,
  "summary": string
}

Guidelines:
- Put company name, contact name, or general keyword search into "search".
- Use "status" only if the user explicitly mentions a pipeline stage.
- Use "country" for location/region mentions, "industry" for sector mentions.
- Use "source" for lead origin mentions (e.g., "referral", "website", "cold call").
- Use date ranges when the user mentions time periods (this week, last month, etc.).
- Use "hasFollowUp": "overdue" when user asks about missed or overdue follow-ups.
- Use "sortBy" and "sortOrder" when user asks to sort or order results.
- Never invent lead IDs, agent names, or specific data.
- Keep summary under 180 characters.
- Today's date is ${new Date().toISOString().split("T")[0]}.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawLeadSearchFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeLeadSearchFilters(rawFilters);

    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai.lead_search_filter",
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
      filters: { search: safeQuery },
      summary: `AI parsing was unavailable, so keyword search was used for "${safeQuery}".`,
      degraded: true,
    });
  }
}, { resource: "leads", action: "read", aiQuota: true });
