import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import FAQ from "@/models/FAQ";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { faqUpdateSchema } from "@/lib/validators/cms";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await FAQ.findById(params?.id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await FAQ.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, faqUpdateSchema) as Record<string, unknown>;
  const allowed = ["question", "questionAr", "answer", "answerAr", "category", "sortOrder", "isActive"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) update[k] = body[k];
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "faq.update",
    resource: "cms",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await FAQ.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await FAQ.deleteOne({ _id: params?.id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "faq.delete",
    resource: "cms",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "cms", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "cms", action: "delete" });
