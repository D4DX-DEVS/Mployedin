import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import mongoose, { Model, Document } from "mongoose";
import { validateBody } from "@/lib/validators";
import { trainingUpdateSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";

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
  const id = params?.id;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await connectDB();

  const body = await validateBody(req, trainingUpdateSchema);

  const TrainingItem = getTrainingModel();
  const item = await TrainingItem.findOneAndUpdate(
    { _id: id, employerUserId: ctx.userId },
    { $set: { status: body.status, notes: body.notes } },
    { new: true }
  );

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    actorId: ctx.userId,
    actorRole: "employer",
    action: "training.update",
    resource: "employers",
    resourceId: id,
    meta: { status: body.status },
    req,
  });

  return NextResponse.json({ item });
}

async function DELETE(
  req: NextRequest,
  ctx: { userId: string },
  params?: Record<string, string>
) {
  const id = params?.id;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await connectDB();

  const TrainingItem = getTrainingModel();
  await TrainingItem.findOneAndDelete({ _id: id, employerUserId: ctx.userId });

  await logActivity({
    actorId: ctx.userId,
    actorRole: "employer",
    action: "training.delete",
    resource: "employers",
    resourceId: id,
    req,
  });

  return NextResponse.json({ success: true });
}

const PATCH_handler = withAuth(PATCH, { resource: "employers", action: "update" });
const DELETE_handler = withAuth(DELETE, { resource: "employers", action: "delete" });
export { PATCH_handler as PATCH, DELETE_handler as DELETE };
