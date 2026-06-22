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

const aiReferralSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
});

const VALID_STATUSES = new Set(["active", "expired", "maxed", "inactive"]);
const VALID_ROLES = new Set(["agent", "super_agent"]);
const VALID_SORT_FIELDS = new Set(["createdAt", "usedCount", "code", "label"]);

interface RawReferralSearchFilters {
  search?: unknown;
  status?: unknown;
  creatorRole?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
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

function normalizeReferralSearchFilters(raw: RawReferralSearchFilters) {
  return {
    search: normalizeString(raw.search),
    status: typeof raw.status === "string" && VALID_STATUSES.has(raw.status) ? raw.status : undefined,
    creatorRole: typeof raw.creatorRole === "string" && VALID_ROLES.has(raw.creatorRole) ? raw.creatorRole : undefined,
    dateFrom: normalizeDate(raw.dateFrom),
    dateTo: normalizeDate(raw.dateTo),
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

  const { query } = await validateBody(req, aiReferralSearchSchema);
  const safeQuery = sanitizeAIInput(query, 500);

  try {
    const prompt = `You translate referral link search requests into structured filters.

Return ONLY valid JSON with this exact shape:
{
  "search": string | null,
  "status": "active" | "expired" | "maxed" | "inactive" | null,
  "creatorRole": "agent" | "super_agent" | null,
  "dateFrom": "YYYY-MM-DD" | null,
  "dateTo": "YYYY-MM-DD" | null,
  "sortBy": "createdAt" | "usedCount" | "code" | "label" | null,
  "sortOrder": "asc" | "desc" | null,
  "summary": string
}

Guidelines:
- Put referral code (e.g. "MPL-1234"), label keywords, or creator name into "search".
- Use "status" when user mentions active links, expired, disabled, or limit-reached links.
- Use "creatorRole" when user specifically mentions agent or super-agent links.
- Use date ranges when the user mentions time periods (this week, last month, Q2, etc.).
- Use "sortBy": "usedCount" when user asks for "most used" or "top performing".
- Use "sortOrder" accordingly (desc for "most", "top", "highest"; asc for "least", "fewest").
- Never invent link codes, agent names, or specific data.
- Keep summary under 180 characters.
- Today's date is ${new Date().toISOString().split("T")[0]}.

User query: "${safeQuery}"`;

    const rawFilters = parseAIJson<RawReferralSearchFilters>(await routeGenerate(prompt, "nl_search"));
    const filters = normalizeReferralSearchFilters(rawFilters);

    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai.referral_search_filter",
      resource: "ai",
      meta: { query: safeQuery },
      req,
    });

    return NextResponse.json({ filters });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to process search query", filters: { summary: "Could not parse your request. Try rephrasing." } },
      { status: 200 }
    );
  }
}, { aiQuota: true });
