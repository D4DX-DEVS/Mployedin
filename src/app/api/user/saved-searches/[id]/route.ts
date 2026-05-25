import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";
import { z } from "zod";

const SavedSearch = mongoose.models.SavedSearch;

const savedSearchUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(500).optional(),
  filters: z.object({
    location: z.string().max(200).optional(),
    jobType: z.string().max(100).optional(),
    experienceLevel: z.string().max(100).optional(),
    salary: z.string().max(100).optional(),
  }).optional(),
  emailAlert: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly", "never"]).optional(),
}).strict();

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  const raw = await req.json();
  const parsed = savedSearchUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

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
