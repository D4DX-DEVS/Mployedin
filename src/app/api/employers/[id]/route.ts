import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { employerAdminUpdateSchema } from "@/lib/validators/employers";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const user = await User.findById(params?.id).select("-passwordHash").lean();
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json({ employer: user });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  // IDOR: agents can only update employers assigned to them
  if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    if (!agent?.assignedEmployerIds?.map(String).includes(params!.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "employer" && ctx.userId !== params?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, employerAdminUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

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
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  if (permanent) {
    const { Employer } = await import("@/models/Employer");
    const { cascadeDeleteEmployer } = await import("@/lib/db/cascade");
    const cascade = await cascadeDeleteEmployer(user._id);
    await Employer.deleteOne({ userId: user._id });
    await user.deleteOne();
    await logActivity({
      ...actorFromCtx(ctx),
      action: "employer.delete",
      resource: "employers",
      resourceId: params?.id,
      meta: { cascade },
      req,
    });
    return NextResponse.json({ message: "Employer permanently deleted", cascade });
  }

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
