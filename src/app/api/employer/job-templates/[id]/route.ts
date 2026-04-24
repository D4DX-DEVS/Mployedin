import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const JobTemplate = mongoose.models.JobTemplate;

async function deleteHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const result = await JobTemplate.deleteOne({ _id: id, employerId: ctx.userId });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler);
