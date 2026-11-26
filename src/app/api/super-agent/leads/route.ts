import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Lead from "@/models/Lead";
import { escapeRegex } from "@/lib/security/sanitize";
import mongoose from "mongoose";

const VALID_STATUSES = new Set(["new", "contacted", "interested", "negotiating", "converted", "lost"]);
const VALID_SORT_FIELDS = new Set(["createdAt", "companyName", "status", "score", "followUpAt", "country", "industry"]);

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20), 100);

  // --- Filters ---
  const status = searchParams.get("status");
  const agentId = searchParams.get("agentId");
  const search = searchParams.get("search")?.trim() || undefined;
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
   
  // Regional scope MUST always apply. Keep it inside $and so later $or
  // assignments (hasNotes / search) cannot clobber the territory boundary
  // (previous bug: hasNotes="false" overwrote filter.$or → cross-region leak).
  const filter: any = {
    $and: [
      { $or: [
        { superAgentId: scope.saProfileId },
        { agentId: { $in: scope.effectiveAgentIds } },
      ] },
    ],
  };

  // Ids and dates are checked up front: a bad one used to reach Mongo as a
  // CastError and come back 500 (audit 2026-11-26 SA-04).
  if ((agentId && !mongoose.isValidObjectId(agentId)) || (exhibitionId && !mongoose.isValidObjectId(exhibitionId))) {
    return NextResponse.json({ error: "Invalid id filter" }, { status: 400 });
  }
  if ([dateFrom, dateTo, followUpFrom, followUpTo].some((d) => d && Number.isNaN(Date.parse(d)))) {
    return NextResponse.json({ error: "Invalid date filter" }, { status: 400 });
  }

  if (status && VALID_STATUSES.has(status)) filter.status = status;
  // Cast to ObjectId: Lead.find casts a string, but the stage-count
  // Lead.aggregate below does not, so filtering by agent or exhibition showed
  // the leads with every stage tile at zero (audit 2026-11-26 SA-05/V-5).
  if (agentId) filter.agentId = new mongoose.Types.ObjectId(agentId);
  if (country) filter.country = { $regex: escapeRegex(country), $options: "i" };
  if (industry) filter.industry = { $regex: escapeRegex(industry), $options: "i" };
  if (source) filter.source = { $regex: escapeRegex(source), $options: "i" };
  if (exhibitionId) filter.exhibitionId = new mongoose.Types.ObjectId(exhibitionId);

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
  if (hasNotes === "false") filter.$and.push({ $or: [{ notes: { $exists: false } }, { notes: "" }] });
  if (hasFollowUp === "true") filter.followUpAt = { $exists: true, $ne: null };
  // Overdue = the date has passed AND the lead is still open. A converted or
  // lost lead's old follow-up date is not work anyone owes; the dashboard's
  // "follow-ups are overdue" row counts the same set and links here.
  if (hasFollowUp === "overdue") {
    filter.followUpAt = { $lt: new Date(), $exists: true };
    filter.$and.push({ status: { $nin: ["converted", "lost"] } });
  }

  // Text search across company, contact, email
  if (search) {
    const safe = escapeRegex(search);
    const searchOr = [
      { companyName: { $regex: safe, $options: "i" } },
      { contactPerson: { $regex: safe, $options: "i" } },
      { contactEmail: { $regex: safe, $options: "i" } },
    ];
    filter.$and.push({ $or: searchOr });
  }

  // Sort
  const sort: Record<string, 1 | -1> = {};
  sort[VALID_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt"] = sortOrder;

  // Distinct values for filter dropdowns
  const returnDistinct = searchParams.get("distinct") === "true";

  // The stage strip is this page's primary control, so its counts must span the
  // whole filtered set. The client derived them from the page it had been
  // handed, so every stage summed to the page size (10) rather than the
  // pipeline. Status is dropped from this match on purpose: selecting a stage
  // must not collapse the other stages' counts to zero.
   
  const { status: _stageFilter, ...filterWithoutStatus } = filter as Record<string, unknown>;

  const [items, total, stageAgg] = await Promise.all([
    Lead.find(filter)
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
      .sort(sort)
      // Case-insensitive order for text columns (SA-11), as the jobs route does.
      .collation({ locale: "en", strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
    Lead.aggregate([
      { $match: filterWithoutStatus },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const row of stageAgg) stageCounts[String(row._id)] = row.count;

  const result: Record<string, unknown> = { items, total, stageCounts, page, totalPages: Math.ceil(total / limit) };

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
