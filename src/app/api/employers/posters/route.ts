import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import PosterGeneration from "@/models/PosterGeneration";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// Editor overrides come from the client; validate shape + bounds so nothing
// arbitrary lands in the Mixed field. Values are only ever read as data (React
// style props / text), never as HTML, but we still bound them defensively.
const elementOverrideSchema = z.object({
  text: z.string().max(200).optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  fontScale: z.number().min(0.1).max(4).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  hidden: z.boolean().optional(),
}).strict();

const styleOverridesSchema = z.object({
  fontFamily: z.string().max(200).optional(),
  textTheme: z.enum(["white", "warm", "sky", "mono-dark"]).optional(),
  bodyWeight: z.number().int().min(100).max(900).optional(),
  overlay: z.enum(["none", "light", "medium", "heavy"]).optional(),
  elements: z.record(z.string(), elementOverrideSchema).optional(),
}).strict();

const saveSchema = z.object({
  generationId: z.string().min(1),
  styleOverrides: styleOverridesSchema.optional(),
  layoutOverride: z.enum(["layout-a", "layout-b", "layout-c", "layout-d"]).optional(),
  selectedVariation: z.number().int().min(0).max(10).optional(),
});

/**
 * GET /api/employers/posters
 * Lists all AI-generated posters for the authenticated employer.
 * Query: ?page=1&limit=12
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "12", 10)));
  const skip = (page - 1) * limit;

  const [posters, total] = await Promise.all([
    PosterGeneration.find({ employerId: employer._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      // Full job snapshot so My Posters can render the composed poster (not just the raw background).
      .populate("jobId", "title companyName logo location salary skills description responsibilities qualifications requirements employmentType")
      .lean(),
    PosterGeneration.countDocuments({ employerId: employer._id }),
  ]);

  return NextResponse.json({
    posters,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/employers/posters
 * Saves a poster generation (confirms selection).
 * Body: { generationId: string }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id");
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { generationId, styleOverrides, layoutOverride, selectedVariation } = parsed.data;

  const poster = await PosterGeneration.findOne({
    _id: generationId,
    employerId: employer._id,
  });
  if (!poster) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }

  // Persist the editor state (all optional — a plain save just confirms selection).
  if (styleOverrides !== undefined) poster.styleOverrides = styleOverrides;
  if (layoutOverride !== undefined) poster.layoutOverride = layoutOverride;
  if (selectedVariation !== undefined) poster.selectedVariation = selectedVariation;
  if (styleOverrides !== undefined || layoutOverride !== undefined || selectedVariation !== undefined) {
    await poster.save();
  }

  return NextResponse.json({ id: poster._id, shareSlug: poster.shareSlug });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
