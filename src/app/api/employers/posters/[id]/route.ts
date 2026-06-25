import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import PosterGeneration from "@/models/PosterGeneration";
import { deleteFile, urlToKey } from "@/lib/storage/spaces";
import type { AuthContext } from "@/lib/auth/withAuth";

/**
 * GET /api/employers/posters/[id]
 * Retrieve a single poster by ID.
 */
async function getHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const poster = await PosterGeneration.findOne({
    _id: id,
    employerId: employer._id,
  })
    .populate("jobId", "title")
    .lean();

  if (!poster) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }

  return NextResponse.json(poster);
}

/**
 * DELETE /api/employers/posters/[id]
 * Delete a poster generation and its S3 assets.
 */
async function deleteHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const poster = await PosterGeneration.findOne({
    _id: id,
    employerId: employer._id,
  });
  if (!poster) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }

  // Delete S3 assets for all variations
  const deletePromises = poster.variations.map((v: { backgroundUrl: string }) => {
    try {
      return deleteFile(urlToKey(v.backgroundUrl));
    } catch {
      return Promise.resolve();
    }
  });
  await Promise.allSettled(deletePromises);

  await PosterGeneration.deleteOne({ _id: poster._id });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const DELETE = withAuth(deleteHandler);
