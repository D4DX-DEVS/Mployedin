import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedSearch from "@/models/SavedSearch";

async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const items = await SavedSearch.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({
    items: items.map((s) => ({
      _id: String(s._id),
      name: s.name,
      query: s.query,
      filters: s.filters,
      emailAlert: s.emailAlert,
      frequency: s.frequency,
      lastNotifiedAt: s.lastNotifiedAt,
      resultCount: s.resultCount,
      createdAt: s.createdAt,
    })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const body = await req.json();
  const { name, query, filters, frequency, emailAlert } = body;

  if (!name || !query) {
    return NextResponse.json({ error: "Name and query required" }, { status: 400 });
  }

  const cleanQuery = String(query).trim();
  const cleanFilters = {
    location: filters?.location ? String(filters.location).trim() : undefined,
    jobType: filters?.jobType ? String(filters.jobType).trim() : undefined,
    experienceLevel: filters?.experienceLevel ? String(filters.experienceLevel).trim() : undefined,
    salary: filters?.salary ? String(filters.salary).trim() : undefined,
  };

  // Duplicate guard: reject a search that matches an existing one for this user
  // (same query + same filters, case-insensitive). Prevents the new "Save search"
  // action on the jobs feed (and the saved-searches form) from piling up copies.
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const existing = await SavedSearch.find({ userId: ctx.userId })
    .select("query filters")
    .lean();
  const duplicate = existing.find(
    (s) =>
      norm(s.query) === norm(cleanQuery) &&
      norm(s.filters?.location) === norm(cleanFilters.location) &&
      norm(s.filters?.jobType) === norm(cleanFilters.jobType) &&
      norm(s.filters?.experienceLevel) === norm(cleanFilters.experienceLevel) &&
      norm(s.filters?.salary) === norm(cleanFilters.salary),
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "You already saved this search", duplicate: true, existingId: String(duplicate._id) },
      { status: 409 },
    );
  }

  // Limit to 20 saved searches per user
  if (existing.length >= 20) {
    return NextResponse.json({ error: "Maximum 20 saved searches allowed" }, { status: 400 });
  }

  const search = await SavedSearch.create({
    userId: ctx.userId,
    name: String(name).trim(),
    query: cleanQuery,
    filters: cleanFilters,
    frequency: frequency || "weekly",
    emailAlert: emailAlert !== false,
  });

  return NextResponse.json({ success: true, search });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
