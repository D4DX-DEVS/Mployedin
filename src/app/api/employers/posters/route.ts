import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import PosterGeneration from "@/models/PosterGeneration";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/employers/posters
 * Lists all AI-generated posters for the authenticated employer.
 * Query: ?page=1&limit=12
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "12", 10)));
  const skip = (page - 1) * limit;

  const [posters, total] = await Promise.all([
    PosterGeneration.find({ employerId: employer._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title")
      .lean(),
    PosterGeneration.countDocuments({ employerId: employer._id }),
  ]);

  return NextResponse.json({
    posters,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/employers/posters
 * Saves a poster generation (confirms selection).
 * Body: { generationId: string }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const body = await req.json();
  const { generationId } = body;
  if (!generationId) {
    return NextResponse.json({ error: "generationId required" }, { status: 400 });
  }

  const poster = await PosterGeneration.findOne({
    _id: generationId,
    employerId: employer._id,
  });
  if (!poster) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }

  return NextResponse.json({ id: poster._id, shareSlug: poster.shareSlug });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
