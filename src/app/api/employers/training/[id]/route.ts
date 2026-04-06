import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import mongoose, { Model, Document } from "mongoose";
import { validateBody } from "@/lib/validators";
import { trainingUpdateSchema } from "@/lib/validators/misc";

interface ITrainingItem extends Document {
  employerUserId: string;
  status: string;
  notes?: string;
}

function getTrainingModel(): Model<ITrainingItem> {
  return mongoose.model<ITrainingItem>("TrainingItem");
}

async function PATCH(
  req: NextRequest,
  ctx: { userId: string },
  params?: Record<string, string>
) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await validateBody(req, trainingUpdateSchema);

  const TrainingItem = getTrainingModel();
  const item = await TrainingItem.findOneAndUpdate(
    { _id: id, employerUserId: ctx.userId },
    { $set: { status: body.status, notes: body.notes } },
    { new: true }
  );

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

async function DELETE(
  _req: NextRequest,
  ctx: { userId: string },
  params?: Record<string, string>
) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const TrainingItem = getTrainingModel();
  await TrainingItem.findOneAndDelete({ _id: id, employerUserId: ctx.userId });

  return NextResponse.json({ success: true });
}

export const PATCH_handler = withAuth(PATCH, { resource: "employers", action: "update" });
export const DELETE_handler = withAuth(DELETE, { resource: "employers", action: "delete" });
export { PATCH_handler as PATCH, DELETE_handler as DELETE };
