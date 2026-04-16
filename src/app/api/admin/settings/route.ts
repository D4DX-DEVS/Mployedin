import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import SystemSettings from "@/models/SystemSettings";
import type { ISystemSettings } from "@/models/SystemSettings";

interface AuthCtx { userId: string; role: string; locale: string; }

async function getHandler() {
  await connectDB();
  let settings = await SystemSettings.findOne().lean();
  if (!settings) {
    settings = await SystemSettings.findOneAndUpdate(
      {},
      { $setOnInsert: { platformName: "MPLOYEDIN", supportEmail: "support@mployedin.com", maintenanceMode: false } },
      { upsert: true, new: true }
    ).lean();
  }
  return NextResponse.json({ settings });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json() as Partial<ISystemSettings>;
  const allowed: (keyof ISystemSettings)[] = ["platformName", "supportEmail", "maintenanceMode"];
  const update: Partial<ISystemSettings> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key] as never;
  }

  const settings = await SystemSettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, new: true }
  ).lean();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "settings.update",
    resource: "settings",
    changes: { after: update },
    req,
  });

  return NextResponse.json({ settings });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
