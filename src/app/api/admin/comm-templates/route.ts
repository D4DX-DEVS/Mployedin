import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import BroadcastTemplate from "@/models/BroadcastTemplate";
import { validateBody } from "@/lib/validators";
import { broadcastTemplateSchema } from "@/lib/validators/admin";

interface AuthCtx { userId: string; role: string; locale: string; }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const templates = await BroadcastTemplate.find()
    .sort({ createdAt: -1 })
    .select("name type subject body createdAt")
    .lean();
  return NextResponse.json({ templates });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const data = await validateBody(req, broadcastTemplateSchema);
  const template = await BroadcastTemplate.create({ ...data, createdBy: ctx.userId });
  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const POST = withAuth(postHandler, { resource: "notifications", action: "create" });
