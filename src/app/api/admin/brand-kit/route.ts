import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { SystemSettings } from "@/models/SystemSettings";
import { brandKitSchema, MPLOYEDIN_BRAND_KIT } from "@/lib/brand/brandKit";
import { getPlatformBrandKit } from "@/lib/brand/brandKit.server";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string }

function adminOnly(ctx: AuthCtx) {
  return ctx.role === "admin" ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** GET /api/admin/brand-kit — the Mployedin kit every employer starts from. */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  return NextResponse.json({ kit: await getPlatformBrandKit(), builtIn: MPLOYEDIN_BRAND_KIT });
}

/** PUT /api/admin/brand-kit — change the Mployedin kit. Employers without their own kit pick it up at once. */
async function putHandler(req: NextRequest, ctx: AuthCtx) {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const parsed = brandKitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { logoUrl, ...rest } = parsed.data;
  await connectDB();
  await SystemSettings.findOneAndUpdate(
    {},
    { $set: { brandKit: { ...rest, logoUrl: logoUrl || MPLOYEDIN_BRAND_KIT.logoUrl } } },
    { upsert: true },
  );
  await logActivity({ ...actorFromCtx(ctx), action: "settings.brand_kit_update", resource: "settings", req });
  return NextResponse.json({ kit: await getPlatformBrandKit(), builtIn: MPLOYEDIN_BRAND_KIT });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PUT = withAuth(putHandler, { resource: "users", action: "update" });
