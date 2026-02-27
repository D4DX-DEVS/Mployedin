import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const user = await User.findById(params?.id).select("-passwordHash").lean();
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json({ employer: user });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "email", "companyName", "industry", "location", "phone", "isActive"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  Object.assign(user, update);
  await user.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.update",
    resource: "employers",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ employer: user });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  user.isActive = false;
  await user.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.deactivate",
    resource: "employers",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Employer deactivated" });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "delete" });
