import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Territory from "@/models/Territory";
import { logActivity } from "@/lib/audit/log";
import { escapeRegex } from "@/lib/security/sanitize";

export const GET = withAuth(async (req: NextRequest) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = {};
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

  const territories = await Territory.find(filter)
    .populate("managedBy", "name email")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({ items: territories, total: territories.length });
}, { resource: "territories", action: "read" });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const body = await req.json();
  const territory = await Territory.create({ ...body, createdBy: ctx.userId });

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "territory.create",
    resource: "territories",
    resourceId: String(territory._id),
    changes: { after: { name: body.name } },
    req,
  });

  return NextResponse.json(territory, { status: 201 });
}, { resource: "territories", action: "create" });

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const body = await req.json();
  const { id, ...update } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const territory = await Territory.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!territory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "territory.update",
    resource: "territories",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json(territory);
}, { resource: "territories", action: "update" });
