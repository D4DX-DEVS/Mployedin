import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import mongoose, { Schema, Document, Model } from "mongoose";

// Inline lightweight model (not worth a separate models/ file)
interface ITrainingItem extends Document {
  employerUserId: string;
  title: string;
  provider: string;
  targetRole: string;
  status: "not_started" | "in_progress" | "completed";
  dueDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

let TrainingItem: Model<ITrainingItem>;
try {
  TrainingItem = mongoose.model<ITrainingItem>("TrainingItem");
} catch {
  const schema = new Schema<ITrainingItem>(
    {
      employerUserId: { type: String, required: true, index: true },
      title: { type: String, required: true },
      provider: { type: String, default: "" },
      targetRole: { type: String, default: "" },
      status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
      dueDate: Date,
      notes: String,
    },
    { timestamps: true }
  );
  TrainingItem = mongoose.model<ITrainingItem>("TrainingItem", schema);
}

async function GET(_req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const items = await TrainingItem.find({ employerUserId: ctx.userId })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ items });
}

async function POST(req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const body = await req.json();

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const item = await TrainingItem.create({
    employerUserId: ctx.userId,
    title: body.title.trim(),
    provider: body.provider ?? "",
    targetRole: body.targetRole ?? "",
    status: body.status ?? "not_started",
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    notes: body.notes ?? "",
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET_handler = withAuth(GET, { resource: "employers", action: "read" });
export const POST_handler = withAuth(POST, { resource: "employers", action: "create" });
export { GET_handler as GET, POST_handler as POST };
