import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { isValidObjectId } from "@/lib/security/sanitize";
import { Employer } from "@/models/Employer";
import { gatePosters } from "@/lib/features/posterGate";
import { BRAND_LAYOUTS, POSTER_LOOKS } from "@/components/features/poster/BrandPoster";
import { BrandPosterError, createBrandPoster } from "@/lib/poster/brandPosters.server";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; member?: { actorId: string; companyId: string; [key: string]: unknown } }

const bodySchema = z
  .object({
    jobId: z.string().refine(isValidObjectId, "Invalid job"),
    source: z.enum(["company", "mployedin"]),
    layout: z.enum(BRAND_LAYOUTS),
    look: z.enum(POSTER_LOOKS),
    headline: z.string().trim().max(80).optional(),
    locale: z.enum(["en", "ar"]).optional(),
    showEmployer: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/employers/posters/brand
 * Save a brand-kit poster (drawn in code; free, no credits) and return its
 * share slug. Images come from /api/poster/[slug]/image.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid poster settings", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  await connectDB();
  const employer = (await Employer.findOne({ userId: ctx.userId }).select("_id").lean()) as { _id: unknown } | null;
  if (!employer) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  try {
    const poster = await createBrandPoster({
      ...parsed.data,
      employerId: String(employer._id),
      actorUserId: ctx.member?.actorId ?? ctx.userId,
    });
    await logActivity({
      ...actorFromCtx(ctx),
      action: "poster.brand_create",
      resource: "jobs",
      resourceId: parsed.data.jobId,
      req,
    });
    return NextResponse.json(poster, { status: 201 });
  } catch (err) {
    if (err instanceof BrandPosterError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export const POST = gatePosters(withAuth(postHandler));
