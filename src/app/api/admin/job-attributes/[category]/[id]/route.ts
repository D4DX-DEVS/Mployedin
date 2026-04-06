import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getCategory } from "@/lib/job-attributes/categoryResolver";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobAttributeUpdateSchema } from "@/lib/validators/location-data";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  const { category, id } = params ?? {};
  const meta = getCategory(category ?? "");
  if (!meta) return NextResponse.json({ error: "Unknown category" }, { status: 404 });

  await connectDB();
  const Model = await meta.model();
  const item = await Model.findById(id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { category, id } = params ?? {};
  const meta = getCategory(category ?? "");
  if (!meta) return NextResponse.json({ error: "Unknown category" }, { status: 404 });

  await connectDB();
  const Model = await meta.model();
  const item = await Model.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, jobAttributeUpdateSchema) as Record<string, unknown>;
  const allowed = ["name", "nameAr", "slug", "sortOrder", "isActive"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      update[k] = k === "slug" ? slugify(String(body[k])) : body[k];
    }
  }

  // If slug changed, check uniqueness
  if (update.slug && update.slug !== item.slug) {
    const dup = await Model.findOne({ slug: update.slug, _id: { $ne: id } });
    if (dup) {
      return NextResponse.json({ error: `Slug "${update.slug}" already in use` }, { status: 409 });
    }
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: `${category}.update`,
    resource: "job_attributes",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { category, id } = params ?? {};
  const meta = getCategory(category ?? "");
  if (!meta) return NextResponse.json({ error: "Unknown category" }, { status: 404 });

  await connectDB();
  const Model = await meta.model();
  const item = await Model.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await Model.deleteOne({ _id: id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: `${category}.delete`,
    resource: "job_attributes",
    resourceId: id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "job_attributes", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "job_attributes", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "job_attributes", action: "delete" });
