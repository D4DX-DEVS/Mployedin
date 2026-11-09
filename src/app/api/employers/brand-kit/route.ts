import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { brandKitSchema } from "@/lib/brand/brandKit";
import { getEmployerBrandKit } from "@/lib/brand/brandKit.server";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; member?: { actorId: string; companyId: string; [key: string]: unknown } }

/** A team member arrives with ctx.userId swapped to the owner, so this finds the company either way. */
async function employerIdFor(ctx: AuthCtx): Promise<string | null> {
  if (ctx.role !== "employer") return null;
  await connectDB();
  const employer = (await Employer.findOne({ userId: ctx.userId }).select("_id").lean()) as { _id: unknown } | null;
  return employer ? String(employer._id) : null;
}

/** GET /api/employers/brand-kit — the company's kit, the Mployedin kit, and whether a custom one is saved. */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  const employerId = await employerIdFor(ctx);
  if (!employerId) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  const view = await getEmployerBrandKit(employerId);
  if (!view) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  return NextResponse.json(view);
}

/** PUT /api/employers/brand-kit — save the company's own kit. */
async function putHandler(req: NextRequest, ctx: AuthCtx) {
  const employerId = await employerIdFor(ctx);
  if (!employerId) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const parsed = brandKitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { logoUrl, ...rest } = parsed.data;
  await Employer.updateOne(
    { _id: employerId },
    { $set: { brandKit: { ...rest, ...(logoUrl ? { logoUrl } : {}) } } },
  );
  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.brand_kit_update",
    resource: "employers",
    resourceId: employerId,
    req,
  });
  return NextResponse.json(await getEmployerBrandKit(employerId));
}

/** DELETE /api/employers/brand-kit — go back to the Mployedin kit. */
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  const employerId = await employerIdFor(ctx);
  if (!employerId) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  await Employer.updateOne({ _id: employerId }, { $unset: { brandKit: 1 } });
  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.brand_kit_reset",
    resource: "employers",
    resourceId: employerId,
    req,
  });
  return NextResponse.json(await getEmployerBrandKit(employerId));
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);
