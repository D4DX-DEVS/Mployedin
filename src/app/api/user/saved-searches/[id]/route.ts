import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const SavedSearch = mongoose.models.SavedSearch;

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  const body = await req.json();

  const search = await SavedSearch.findOneAndUpdate(
    { _id: id, userId: ctx.userId },
    { $set: body },
    { new: true },
  );

  if (!search) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, search });
}

async function deleteHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const result = await SavedSearch.deleteOne({ _id: id, userId: ctx.userId });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
