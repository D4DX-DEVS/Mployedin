import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Employer, { ISavedView } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { z } from "zod";
import mongoose from "mongoose";
import type { UserRole } from "@/types/user";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

const savedViewCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  query: z.string().max(500).default(""),
});

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("savedViews").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  // Filter views for current user only, return newest first
  const userViews = (employer.savedViews ?? [])
    .filter((v: ISavedView) => String(v.userId) === ctx.userId)
    .sort((a: ISavedView, b: ISavedView) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((v: ISavedView) => ({
      id: String(v._id),
      name: v.name,
      query: v.query,
      createdAt: v.createdAt?.toISOString(),
    }));

  return NextResponse.json({ views: userViews });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("savedViews").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const body = await validateBody(req, savedViewCreateSchema);

  // Strip leading ? if present
  const query = body.query.startsWith("?") ? body.query.slice(1) : body.query;

  // Reject if query contains page=
  if (query.includes("page=")) {
    return NextResponse.json(
      { error: "Cannot save views with page parameter" },
      { status: 400 }
    );
  }

  // Count user's views
  const userViewCount = (employer.savedViews ?? []).filter((v: ISavedView) => String(v.userId) === ctx.userId).length;
  if (userViewCount >= 20) {
    return NextResponse.json(
      { error: "You can keep up to 20 saved views." },
      { status: 400 }
    );
  }

  // Create new view
  const newView = {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(ctx.userId),
    name: body.name,
    query,
    createdAt: new Date(),
  };

  // Add view to employer's savedViews
  await Employer.findOneAndUpdate(
    { userId: ctx.userId },
    { $push: { savedViews: newView } },
    { upsert: true }
  );

  return NextResponse.json(
    {
      id: String(newView._id),
      name: newView.name,
      query: newView.query,
      createdAt: newView.createdAt.toISOString(),
    },
    { status: 201 }
  );
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const viewId = searchParams.get("id");

  if (!viewId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Validate id format
  if (!mongoose.Types.ObjectId.isValid(viewId)) {
    return NextResponse.json({ error: "Invalid view id" }, { status: 400 });
  }

  // Remove only if it belongs to the current user. Check first: a $pull that
  // matches nothing still returns the employer, so it cannot signal "not yours".
  const employer = await Employer.findOne({ userId: ctx.userId }).select("savedViews").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }
  const owned = (employer.savedViews ?? []).some(
    (v: ISavedView) => String(v._id) === viewId && String(v.userId) === ctx.userId,
  );
  if (!owned) {
    return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  }

  await Employer.updateOne(
    { userId: ctx.userId },
    { $pull: { savedViews: { _id: new mongoose.Types.ObjectId(viewId) } } },
  );

  return NextResponse.json({ ok: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
