import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Lead from "@/models/Lead";
import { escapeRegex } from "@/lib/security/sanitize";

const VALID_STATUSES = new Set(["new", "contacted", "interested", "negotiating", "converted", "lost"]);
const VALID_SORT_FIELDS = new Set(["createdAt", "companyName", "status", "score", "followUpAt", "country", "industry"]);

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  // --- Filters ---
  const status = searchParams.get("status");
  const agentId = searchParams.get("agentId");
  const search = searchParams.get("search");
  const country = searchParams.get("country");
  const industry = searchParams.get("industry");
  const source = searchParams.get("source");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const followUpFrom = searchParams.get("followUpFrom");
  const followUpTo = searchParams.get("followUpTo");
  const hasNotes = searchParams.get("hasNotes");
  const hasFollowUp = searchParams.get("hasFollowUp");
  const exhibitionId = searchParams.get("exhibitionId");
  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

  // Dual-scoping: team agents + region-based agents
  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ items: [], total: 0, page: 1, totalPages: 0 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = {
    $or: [
      { superAgentId: scope.saProfileId },
      { agentId: { $in: scope.effectiveAgentIds } },
    ],
  };

  if (status && VALID_STATUSES.has(status)) filter.status = status;
  if (agentId) filter.agentId = agentId;
  if (country) filter.country = { $regex: escapeRegex(country), $options: "i" };
  if (industry) filter.industry = { $regex: escapeRegex(industry), $options: "i" };
  if (source) filter.source = { $regex: escapeRegex(source), $options: "i" };
  if (exhibitionId) filter.exhibitionId = exhibitionId;

  // Date range filters
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  // Follow-up date range
  if (followUpFrom || followUpTo) {
    filter.followUpAt = {};
    if (followUpFrom) filter.followUpAt.$gte = new Date(followUpFrom);
    if (followUpTo) filter.followUpAt.$lte = new Date(followUpTo);
  }

  // Boolean flags
  if (hasNotes === "true") filter.notes = { $exists: true, $ne: "" };
  if (hasNotes === "false") filter.$or = [{ notes: { $exists: false } }, { notes: "" }];
  if (hasFollowUp === "true") filter.followUpAt = { $exists: true, $ne: null };
  if (hasFollowUp === "overdue") filter.followUpAt = { $lt: new Date(), $exists: true };

  // Text search across company, contact, email
  if (search) {
    const safe = escapeRegex(search);
    const searchOr = [
      { companyName: { $regex: safe, $options: "i" } },
      { contactPerson: { $regex: safe, $options: "i" } },
      { contactEmail: { $regex: safe, $options: "i" } },
    ];
    filter.$or = filter.$or ? [...filter.$or, ...searchOr] : searchOr;
  }

  // Sort
  const sort: Record<string, 1 | -1> = {};
  sort[VALID_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt"] = sortOrder;

  // Distinct values for filter dropdowns
  const returnDistinct = searchParams.get("distinct") === "true";

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  const result: Record<string, unknown> = { items, total, page, totalPages: Math.ceil(total / limit) };

  // Return distinct filter values when requested (for dropdowns)
  if (returnDistinct) {
    const baseFilter = {
      $or: [
        { superAgentId: scope.saProfileId },
        { agentId: { $in: scope.effectiveAgentIds } },
      ],
    };
    const [countries, industries, sources] = await Promise.all([
      Lead.distinct("country", baseFilter),
      Lead.distinct("industry", baseFilter),
      Lead.distinct("source", baseFilter),
    ]);
    result.facets = {
      countries: countries.filter(Boolean).sort(),
      industries: industries.filter(Boolean).sort(),
      sources: sources.filter(Boolean).sort(),
    };
  }

  return NextResponse.json(result);
}, { resource: "leads", action: "read" });
